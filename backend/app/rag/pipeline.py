"""
RAG 본체: 질문 하나 → RagAnswer.

  1. 위기 단어가 있으면 바로 위기 안내 (검색·API 호출 없음)
  2. 질문 임베딩 → Top-K 검색 → 유사도 하한 미만 버림
  3. 남은 chunk 의 앞뒤 chunk 를 붙이고, 같은 글끼리 묶어 최대 max_posts 개 글로 정리
  4. Claude 구조화 출력 → answer_type, answer, used_chunk_ids
  5. Claude 가 실제로 쓴 chunk 만 출처로 만든다 (근거에 없는 id 는 버림)
     쓴 chunk 가 하나도 없으면 '근거 부족'으로 바꾼다 (출처 없는 답변은 내보내지 않는다)

오류 처리: 임베딩·검색·Claude 호출 중 어디서든 실패하면(429, 네트워크, 시간 초과, 이상한 응답 등)
  500 오류 대신 no_evidence + 안내 문구(TEMPORARY_ERROR_MESSAGE)로 답하고 failed=True 로 표시한다.
  → 프론트는 고칠 필요 없이 '멘토 찾아보기'로 이어진다. 원인은 서버 로그에 남긴다.
"""

import logging

from app.rag.config import RagSettings
from app.rag.embedding import Embedder
from app.rag.generator import ContextDoc, Generator
from app.rag.messages import (
    NO_EVIDENCE_MESSAGE,
    OFF_TOPIC_MESSAGE,
    SAFETY_MESSAGE,
    TEMPORARY_ERROR_MESSAGE,
    looks_like_crisis,  # 위기 신호 판정은 app/services/answer.py 의 함수 하나만 쓴다
)
from app.rag.models import Chunk, RagAnswer, RagSource, ScoredChunk
from app.rag.store import PUBLIC_VISIBILITY, VectorStore

logger = logging.getLogger("uvicorn.error")


def public_title(chunk: Chunk) -> str:
    """
    글 제목. L3 만 그대로 쓰고 L1·L2 는 빈 문자열.
    인터뷰 제목에 졸업생 이름이 들어 있는 경우가 많아, 익명 글의 제목을 쓰면 누구인지 드러난다.
    (Claude 에게 넘기는 근거와 출처 모두에 적용)
    """
    return chunk.title if chunk.visibility == "L3" else ""


def to_source(chunk: Chunk) -> RagSource:
    """공개 등급에 맞춰 출처를 만든다. L1 은 원문 비공개, 글 주소와 제목은 L3 만."""
    return RagSource(
        chunk_id=chunk.chunk_id,
        source_id=chunk.source_id,
        alumni=chunk.display_name,
        title=public_title(chunk),
        excerpt=None if chunk.visibility == "L1" else chunk.content,
        visibility=chunk.visibility,
        published_at=chunk.published_at,
        url=chunk.url if chunk.visibility == "L3" else None,
    )


class RagPipeline:
    def __init__(self, embedder: Embedder, store: VectorStore, generator: Generator, settings: RagSettings) -> None:
        self.embedder = embedder
        self.store = store
        self.generator = generator
        self.settings = settings

    # ---- 2. 검색 ----
    def retrieve(self, question: str) -> list[ScoredChunk]:
        vector = self.embedder.embed([question])[0]
        hits = self.store.search(vector, self.settings.top_k)
        return [h for h in hits if h.score >= self.settings.similarity_floor and h.chunk.visibility in PUBLIC_VISIBILITY]

    # ---- 3. 앞뒤 chunk 붙이고 글 단위로 묶기 ----
    def build_context(self, hits: list[ScoredChunk]) -> list[ContextDoc]:
        best_score: dict[str, float] = {}
        hit_indices: dict[str, set[int]] = {}
        first_chunk: dict[str, Chunk] = {}
        for h in hits:
            pid = h.chunk.source_id
            best_score[pid] = max(best_score.get(pid, 0.0), h.score)
            hit_indices.setdefault(pid, set()).add(h.chunk.chunk_index)
            first_chunk.setdefault(pid, h.chunk)

        top_posts = sorted(best_score, key=best_score.get, reverse=True)[: self.settings.max_posts]
        window = self.settings.neighbor_window
        docs = []
        for pid in top_posts:
            wanted = sorted({i + d for i in hit_indices[pid] for d in range(-window, window + 1) if i + d >= 1})
            chunks = {c.chunk_index: c for c in self.store.get_chunks(pid, wanted)}
            for h in hits:  # 검색된 chunk 는 저장소 결과와 상관없이 꼭 넣는다
                if h.chunk.source_id == pid:
                    chunks.setdefault(h.chunk.chunk_index, h.chunk)
            ordered = [chunks[i] for i in sorted(chunks) if chunks[i].visibility in PUBLIC_VISIBILITY]
            head = first_chunk[pid]
            docs.append(
                ContextDoc(
                    source_id=pid,
                    title=public_title(head),  # L1·L2 는 제목을 넘기지 않는다
                    display_name=head.display_name,
                    published_at=head.published_at,
                    chunks=ordered,
                )
            )
        return docs

    # ---- 전체 ----
    def answer(self, question: str) -> RagAnswer:
        if looks_like_crisis(question):
            return RagAnswer(answer_type="safety", answer=SAFETY_MESSAGE)

        try:
            hits = self.retrieve(question)
            if not hits and not self.settings.classify_when_no_hits:
                return RagAnswer(answer_type="no_evidence", answer=NO_EVIDENCE_MESSAGE)
            docs = self.build_context(hits)
            output = self.generator.generate(question, docs)
        except Exception:
            # 학생에게는 안내 문구만, 원인(전체 오류 내용)은 서버 로그에
            logger.exception("RAG 답변 실패 → 임시 안내로 대신 답함")
            return RagAnswer(answer_type="no_evidence", answer=TEMPORARY_ERROR_MESSAGE, failed=True)

        if output.answer_type == "safety":
            return RagAnswer(answer_type="safety", answer=SAFETY_MESSAGE)
        if output.answer_type == "off_topic":
            return RagAnswer(answer_type="off_topic", answer=OFF_TOPIC_MESSAGE)
        if output.answer_type == "no_evidence" or not docs:
            return RagAnswer(answer_type="no_evidence", answer=NO_EVIDENCE_MESSAGE)

        # ---- 5. 실제로 쓴 chunk 만 출처로 ----
        given = {c.chunk_id: c for doc in docs for c in doc.chunks}
        used_ids = list(dict.fromkeys(i for i in output.used_chunk_ids if i in given))
        unknown = [i for i in output.used_chunk_ids if i not in given]
        if unknown:
            logger.warning("Claude 가 근거에 없는 chunk id 를 냈어요: %s", unknown)
        if not used_ids:
            return RagAnswer(answer_type="no_evidence", answer=NO_EVIDENCE_MESSAGE)

        return RagAnswer(
            answer_type="answer",
            answer=output.answer,
            sources=[to_source(given[i]) for i in used_ids],
        )


def build_pipeline_from_env(settings: RagSettings | None = None, local_chunks_path: str | None = None) -> RagPipeline:
    """
    실제 서비스용 파이프라인을 만든다. (API 키가 .env 에 있어야 한다)
    local_chunks_path 를 주면 Supabase 대신 그 jsonl 파일(임베딩 포함)을 메모리에 올려 검색한다.
    """
    from app.rag.embedding import OpenAIEmbedder
    from app.rag.generator import ClaudeGenerator
    from app.rag.store import InMemoryVectorStore, SupabaseVectorStore

    s = settings or RagSettings.from_env()
    store = InMemoryVectorStore.from_jsonl(local_chunks_path) if local_chunks_path else SupabaseVectorStore()
    return RagPipeline(
        embedder=OpenAIEmbedder(s.embedding_model, timeout=s.embedding_timeout_seconds),
        store=store,
        generator=ClaudeGenerator(
            s.claude_model,
            s.claude_effort,
            s.claude_max_tokens,
            s.claude_use_fallbacks,
            timeout=s.claude_timeout_seconds,
        ),
        settings=s,
    )
