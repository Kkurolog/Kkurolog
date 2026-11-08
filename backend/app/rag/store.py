"""
chunk 를 저장하고 비슷한 chunk 를 찾는 곳.

- InMemoryVectorStore: 파일(jsonl)에서 읽어 메모리에서 검색. 로컬 개발·테스트용.
  글이 수십 개(chunk 수백 개) 수준이라 이것만으로도 충분히 빠르다.
- SupabaseVectorStore: Supabase(pgvector). 테이블·함수는 scripts/sql/kkurolog_chunks.sql 참고.

두 클래스 모두 search() 와 get_chunks() 만 있으면 pipeline 이 그대로 쓴다.
"""

import json
import math
import os
from pathlib import Path
from typing import Protocol

from app.rag.models import Chunk, ScoredChunk

TABLE = "kkurolog_chunks"
MATCH_FUNCTION = "match_kkurolog_chunks"


class VectorStore(Protocol):
    def search(self, vector: list[float], top_k: int) -> list[ScoredChunk]: ...

    def get_chunks(self, post_id: str, indices: list[int]) -> list[Chunk]: ...


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return 0.0 if na == 0 or nb == 0 else dot / (na * nb)


class InMemoryVectorStore:
    def __init__(self, chunks: list[Chunk]) -> None:
        # L0 이나 임베딩이 없는 chunk 는 검색 대상에서 뺀다
        self._chunks = [c for c in chunks if c.visibility != "L0" and c.embedding]
        self._by_key = {(c.post_id, c.chunk_index): c for c in self._chunks}

    @classmethod
    def from_jsonl(cls, path: str | Path) -> "InMemoryVectorStore":
        with Path(path).open(encoding="utf-8") as f:
            return cls([Chunk.model_validate(json.loads(line)) for line in f if line.strip()])

    def search(self, vector: list[float], top_k: int) -> list[ScoredChunk]:
        scored = [ScoredChunk(chunk=c, score=cosine(vector, c.embedding)) for c in self._chunks]
        scored.sort(key=lambda s: s.score, reverse=True)
        return scored[:top_k]

    def get_chunks(self, post_id: str, indices: list[int]) -> list[Chunk]:
        return [self._by_key[(post_id, i)] for i in indices if (post_id, i) in self._by_key]


class SupabaseVectorStore:
    """SUPABASE_URL, SUPABASE_KEY(서버 전용 키) 환경변수가 필요하다."""

    COLUMNS = (
        "chunk_id, post_id, chunk_index, post_type, title, nickname, career_tags, date, url, "
        "visibility, question, content, embed_text"
    )

    def __init__(self) -> None:
        from supabase import create_client  # requirements-rag.txt 를 설치해야 import 된다

        self._client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

    def search(self, vector: list[float], top_k: int) -> list[ScoredChunk]:
        rows = self._client.rpc(MATCH_FUNCTION, {"query_embedding": vector, "match_count": top_k}).execute().data
        return [ScoredChunk(chunk=Chunk.model_validate(row), score=row["similarity"]) for row in rows or []]

    def get_chunks(self, post_id: str, indices: list[int]) -> list[Chunk]:
        if not indices:
            return []
        rows = (
            self._client.table(TABLE)
            .select(self.COLUMNS)
            .eq("post_id", post_id)
            .in_("chunk_index", indices)
            .neq("visibility", "L0")
            .execute()
            .data
        )
        return [Chunk.model_validate(row) for row in rows or []]

    def upsert(self, chunks: list[Chunk]) -> None:
        """scripts/load_chunks.py 가 쓴다."""
        rows = [c.model_dump() for c in chunks]
        for start in range(0, len(rows), 100):
            self._client.table(TABLE).upsert(rows[start : start + 100]).execute()
