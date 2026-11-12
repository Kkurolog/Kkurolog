"""
비슷한 chunk 를 찾는 곳. (chunk 를 만들고 넣는 건 scripts/ 가 한다. backend 는 읽기만 한다)

- SupabaseVectorStore: Supabase(pgvector). 테이블·검색 함수는 supabase/migrations/0001_experience_tables.sql
  (sources / people / chunks 테이블, match_chunks 함수) 를 그대로 쓴다.
- InMemoryVectorStore: 메모리에서 검색. 테스트용, 그리고 Supabase 없이 로컬에서 돌려볼 때
  (임베딩이 들어 있는 Chunk 모양 jsonl 파일이 있어야 한다).

두 클래스 모두 search() 와 get_chunks() 만 있으면 pipeline 이 그대로 쓴다.
"""

import json
import math
import os
from pathlib import Path
from typing import Protocol

from app.rag.models import Chunk, ScoredChunk

MATCH_FUNCTION = "match_chunks"
PUBLIC_VISIBILITY = ["L1", "L2", "L3"]  # L0 은 허용 목록에 없으니 절대 나오지 않는다 (DECISIONS 2026-11-09)


class VectorStore(Protocol):
    def search(self, vector: list[float], top_k: int) -> list[ScoredChunk]: ...

    def get_chunks(self, source_id: str, indices: list[int]) -> list[Chunk]: ...


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return 0.0 if na == 0 or nb == 0 else dot / (na * nb)


class InMemoryVectorStore:
    def __init__(self, chunks: list[Chunk]) -> None:
        # L0 이나 임베딩이 없는 chunk 는 검색 대상에서 뺀다
        self._chunks = [c for c in chunks if c.visibility in PUBLIC_VISIBILITY and c.embedding]
        self._by_key = {(c.source_id, c.chunk_index): c for c in self._chunks}

    @classmethod
    def from_jsonl(cls, path: str | Path) -> "InMemoryVectorStore":
        with Path(path).open(encoding="utf-8") as f:
            return cls([Chunk.model_validate(json.loads(line)) for line in f if line.strip()])

    def search(self, vector: list[float], top_k: int) -> list[ScoredChunk]:
        scored = [ScoredChunk(chunk=c, score=cosine(vector, c.embedding)) for c in self._chunks]
        scored.sort(key=lambda s: s.score, reverse=True)
        return scored[:top_k]

    def get_chunks(self, source_id: str, indices: list[int]) -> list[Chunk]:
        return [self._by_key[(source_id, i)] for i in indices if (source_id, i) in self._by_key]


def _flatten_row(row: dict) -> dict:
    """chunks 테이블을 sources·people 와 함께 읽은 결과를 match_chunks 결과와 같은 모양으로 편다."""
    source = row.pop("sources", None) or {}
    person = row.pop("people", None) or {}
    return {**row, **source, "nickname": person.get("nickname", "")}


class SupabaseVectorStore:
    """SUPABASE_URL, SUPABASE_KEY(서버 전용 service_role 키) 환경변수가 필요하다. 읽기만 한다."""

    # match_chunks 결과와 같은 이름이 되게 chunks.id 는 chunk_id 로 바꿔 읽는다
    NEIGHBOR_COLUMNS = (
        "chunk_id:id, source_id, person_id, chunk_index, question, content, topics, career_paths, "
        "career_fields, visibility, sources(title, url, published_at), people(nickname)"
    )

    def __init__(self) -> None:
        from supabase import create_client  # requirements-rag.txt 를 설치해야 import 된다

        self._client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

    def search(self, vector: list[float], top_k: int) -> list[ScoredChunk]:
        rows = self._client.rpc(MATCH_FUNCTION, {"query_embedding": vector, "match_count": top_k}).execute().data
        return [ScoredChunk(chunk=Chunk.model_validate(row), score=row["similarity"]) for row in rows or []]

    def get_chunks(self, source_id: str, indices: list[int]) -> list[Chunk]:
        """검색된 chunk 의 앞뒤 chunk. 같은 글(source)이라 글의 공개 등급은 검색 때 이미 확인됐다."""
        if not indices:
            return []
        rows = (
            self._client.table("chunks")
            .select(self.NEIGHBOR_COLUMNS)
            .eq("source_id", source_id)
            .in_("chunk_index", indices)
            .in_("visibility", PUBLIC_VISIBILITY)
            .execute()
            .data
        )
        return [Chunk.model_validate(_flatten_row(dict(row))) for row in rows or []]
