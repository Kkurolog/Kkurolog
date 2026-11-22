"""
RAG 본체: 질문 하나 → RagAnswer.

  1. 위기 단어가 있으면 바로 위기 안내 (검색·API 호출 없음)
  1-1. 의도 분석 (app/rag/intent.py): 인사·서비스 소개·잡담·막연한 고민이면 고정 문구로 끝낸다.
       진로 질문이거나 분석에 실패하면 아래로 계속 간다
  2. 질문 임베딩 → Top-K 검색 → 유사도 하한 미만 버림
     의도 분석이 경로·분야 태그를 뽑았으면(예: 창업), 그 태그가 있는 선배의 chunk 를 한 번 더 찾아 합친다
  3. 남은 chunk 의 앞뒤 chunk 를 붙이고, 같은 글끼리 묶어 최대 max_posts 개 글로 정리
     (태그가 맞는 선배의 글에 자리를 먼저 준다 → pick_posts)
  4. Claude 구조화 출력 → answer_type + 선배별 카드 (조각마다 근거 chunk id)
  5. 카드 조립 (app/rag/cards.py): 근거 없는 조각·카드는 버리고, 카드마다 그 카드의 출처를 붙인다
     남은 카드가 없으면 '근거 부족'으로 바꾼다 (출처 없는 답변은 내보내지 않는다)

오류 처리: 임베딩·검색·Claude 호출 중 어디서든 실패하면(429, 네트워크, 시간 초과, 이상한 응답 등)
  500 오류 대신 no_evidence + 안내 문구(TEMPORARY_ERROR_MESSAGE)로 답하고 failed=True 로 표시한다.
  → 프론트는 고칠 필요 없이 '멘토 찾아보기'로 이어진다. 원인은 서버 로그에 남긴다.
"""

import logging
import re
from dataclasses import dataclass, field

from app.rag.cards import assemble_cards, compose_text
from app.rag.config import RagSettings
from app.rag.embedding import Embedder
from app.rag.generator import ContextDoc, Generator
from app.rag.intent import (
    BUTTON_QUESTIONS,
    LISTEN_BUTTONS,
    LISTEN_MESSAGE,
    IntentAnalyzer,
    IntentResult,
    emotional_reply_for,
    fixed_reply_for,
    has_emotion_word,
    preface_for,
)
from app.rag.messages import (
    MORE_STORIES_HINT,
    NO_MORE_MESSAGE,
    NO_EVIDENCE_MESSAGE,
    OFF_TOPIC_MESSAGE,
    safety_message,
    TEMPORARY_ERROR_MESSAGE,
    looks_like_crisis,  # 위기 신호 판정은 app/services/answer.py 의 함수 하나만 쓴다
)
from app.rag.models import Chunk, RagAnswer, RagSource, ScoredChunk
from app.rag.store import PUBLIC_VISIBILITY, VectorStore

logger = logging.getLogger("uvicorn.error")


# 글 제목 끝에 붙은 글쓴이 표기: "제목 - 실명 [별명]", "제목 - 별명 실명"
_AUTHOR_TAIL = re.compile(r"\s+-\s+(?P<tail>[^-]{1,30})$")


def strip_author(title: str, nickname: str) -> str:
    """
    제목 끝의 글쓴이 표기를 지운다. 예: "나의 길 찾기 - 홍길동 [새벽]" → "나의 길 찾기"
    실명은 어떤 응답에도 넣지 않는 것이 규칙인데, gschool.kr 글 39개 중 20개는 제목 끝에 실명이 붙어 있다.
    실명은 backend 가 알지 못하므로(검색 함수가 내보내지 않는다), '끝 부분에 그 글의 별명이 들어 있으면
    그 끝 부분 전체를 글쓴이 표기로 보고' 지운다. "…하는 [새벽] 이야기"처럼 별명만 있는 제목은 그대로 둔다.
    ⚠️ 새 글을 넣으면 실명이 남는 제목이 없는지 다시 확인한다 (제목 모양이 다르면 이 규칙이 못 잡는다).
    """
    match = _AUTHOR_TAIL.search(title)
    if match and nickname and nickname in match["tail"]:
        return title[: match.start()].rstrip()
    return title


def public_title(chunk: Chunk) -> str:
    """
    글 제목. L3 만 쓰고(글쓴이 표기는 지운다) L1·L2 는 빈 문자열.
    인터뷰 제목에 졸업생 이름이 들어 있는 경우가 많아, 익명 글의 제목을 쓰면 누구인지 드러난다.
    (Claude 에게 넘기는 근거와 출처 모두에 적용)
    """
    return strip_author(chunk.title, chunk.nickname) if chunk.visibility == "L3" else ""


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

EXCLUDE_SEARCH_FACTOR = 4  # 이미 본 글을 뺄 때는 이만큼 더 넉넉히 찾는다


@dataclass
class Retrieval:
    """검색 결과."""

    hits: list[ScoredChunk] = field(default_factory=list)  # 유사도 높은 순, chunk 중복 없음
    # 질문이 찾는 경로·분야 태그가 있는 선배의 글 (태그 검색을 하지 않았으면 비어 있다)
    tagged_sources: set[str] = field(default_factory=set)


def pick_posts(
    hits: list[ScoredChunk], max_posts: int, tagged_sources: set[str] | frozenset = frozenset(), reserved: int = 0
) -> list[str]:
    """
    Claude 에게 넘길 글을 고른다 (글번호 목록, 앞에 있을수록 먼저 보여 준다).
    글의 점수 = 그 글에서 가장 점수 높은 chunk. 태그가 맞는 선배의 글에 reserved 개 자리를 먼저 주고,
    남은 자리는 태그와 상관없이 점수 순으로 채운다.
    """
    best: dict[str, float] = {}
    for h in hits:
        best[h.chunk.source_id] = max(best.get(h.chunk.source_id, 0.0), h.score)
    ranked = sorted(best, key=best.get, reverse=True)
    first = [s for s in ranked if s in tagged_sources][:reserved]
    rest = [s for s in ranked if s not in first]
    return (first + rest)[:max_posts]


class RagPipeline:
    def __init__(
        self,
        embedder: Embedder,
        store: VectorStore,
        generator: Generator,
        settings: RagSettings,
        intent_analyzer: IntentAnalyzer | None = None,  # None 이면 의도 분석 없이 바로 검색으로 간다
    ) -> None:
        self.embedder = embedder
        self.store = store
        self.generator = generator
        self.settings = settings
        self.intent_analyzer = intent_analyzer

    # ---- 1. 의도 분석 ----
    def analyze_intent(self, question: str, previous_question: str | None = None) -> IntentResult | None:
        """분석기가 없거나 실패하면 None → 진로 질문처럼 검색으로 보낸다 (분석 때문에 답이 막히지 않게)."""
        if self.intent_analyzer is None:
            return None
        try:
            if previous_question:
                return self.intent_analyzer.analyze(question, previous_question)
            return self.intent_analyzer.analyze(question)
        except Exception:
            logger.exception("의도 분석 실패 → 기존 흐름으로 넘김")
            return None

    # ---- 2. 검색 ----
    def retrieve(
        self, question: str, intent: IntentResult | None = None, exclude_sources: set[str] | None = None
    ) -> Retrieval:
        """
        질문과 비슷한 chunk 를 찾는다.
        의도 분석이 질문에서 경로·분야 태그를 뽑았으면(intent.career_paths·career_fields),
        그 태그가 있는 선배의 chunk 만 한 번 더 찾아서 합친다 → build_context 가 그 선배들의 글을 먼저 고른다.
        """
        s = self.settings
        vector = self.embedder.embed([question])[0]
        # exclude_sources: 이미 보여 준 글 ("다른 선배 얘기도 들려줘"). 그 글을 빼도 남는 게 있게 더 넉넉히 찾는다
        exclude = exclude_sources or set()
        widen = EXCLUDE_SEARCH_FACTOR if exclude else 1
        hits = [
            h
            for h in self.store.search(vector, s.top_k * widen)
            if h.score >= s.similarity_floor
            and h.chunk.visibility in PUBLIC_VISIBILITY
            and h.chunk.source_id not in exclude
        ]
        paths = intent.career_paths if intent else []
        fields = intent.career_fields if intent else []
        if s.tag_reserved_posts <= 0 or not (paths or fields):
            return Retrieval(hits=hits)

        tagged = [
            h
            for h in self.store.search(
                vector, s.tag_top_k * widen, career_paths=paths or None, career_fields=fields or None
            )
            if h.score >= s.tag_similarity_floor
            and h.chunk.visibility in PUBLIC_VISIBILITY
            and h.chunk.source_id not in exclude
        ]
        merged = {h.chunk.chunk_id: h for h in [*tagged, *hits]}  # 같은 chunk 는 한 번만
        return Retrieval(
            hits=sorted(merged.values(), key=lambda h: h.score, reverse=True),
            tagged_sources={h.chunk.source_id for h in tagged},
        )

    # ---- 3. 앞뒤 chunk 붙이고 글 단위로 묶기 ----
    def build_context(self, found: Retrieval | list[ScoredChunk]) -> list[ContextDoc]:
        if not isinstance(found, Retrieval):
            found = Retrieval(hits=list(found))
        hits = found.hits
        hit_indices: dict[str, set[int]] = {}
        first_chunk: dict[str, Chunk] = {}
        for h in hits:
            pid = h.chunk.source_id
            hit_indices.setdefault(pid, set()).add(h.chunk.chunk_index)
            first_chunk.setdefault(pid, h.chunk)

        top_posts = pick_posts(hits, self.settings.max_posts, found.tagged_sources, self.settings.tag_reserved_posts)
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
    def answer(
        self,
        question: str,
        previous_question: str | None = None,
        previous_answer: str | None = None,
        seen_source_ids: list[str] | None = None,
        safety_notice_shown: bool = False,
        crisis_notice_shown: bool = False,
        more_hint_shown: bool = False,
    ) -> RagAnswer:
        """
        previous_question: 같은 대화의 바로 앞 질문. "더 자세히 알려줘" 같은 이어지는 질문을 이해하는 데 쓴다.
        previous_answer: 그 질문에 꾸로록이 한 답. 이어지는 질문일 때만 답변 모델에 보여 줘서 같은 말을 되풀이하지 않게 한다.
        seen_source_ids: 이 대화에서 이미 보여 준 글 번호. "다른 선배 얘기도 들려줘"일 때 그 글을 빼고 찾는다.
        safety_notice_shown: 이 대화에서 상담 번호를 이미 보여 줬는지. true 면 가벼운 안내(T1)의 번호 줄을 되풀이하지 않는다.
        crisis_notice_shown: 이 대화에서 위기 안내 전체 문구를 이미 보여 줬는지. true 일 때만 위기 안내를 짧게 준다.
        more_hint_shown: 이 대화에서 "다른 선배 이야기도 더 있어요"를 이미 보여 줬는지. 대화당 한 번만 붙인다.
        """
        meta: dict = {}

        def safety() -> RagAnswer:
            # 위기 안내는 항상 고정 문구다 (모델이 쓰지 않는다). 전체 문구를 이미 보여 줬을 때만 번호만 짧게 다시 준다
            return RagAnswer(
                answer_type="safety",
                answer=safety_message(crisis_notice_shown),
                safety_notice=True,
                crisis_notice=True,
                **meta,
            )

        is_follow_up = False
        seen = set(seen_source_ids or [])

        def no_evidence() -> RagAnswer:
            # 방금 답을 받고 이어서 물은 학생에게는 "자료가 없어요"가 아니라 "여기까지예요"로 안내한다
            if is_follow_up:
                return RagAnswer(answer_type="no_evidence", answer=NO_MORE_MESSAGE, no_more=True, **meta)
            return RagAnswer(answer_type="no_evidence", answer=NO_EVIDENCE_MESSAGE, **meta)

        # T0 (급박한 위기): 정규식에 걸리면 모델을 부르지 않고 바로 안내한다 (모델이 실패해도 작동해야 한다)
        if looks_like_crisis(question):
            return safety()

        # 감정 안내의 버튼을 누른 경우 (app/rag/intent.py 의 BTN_*)
        pressed = question.strip()
        if pressed in LISTEN_BUTTONS:  # 한 번 적어 달라고만 한다. 적어 준 말은 다시 단계 판정을 거친다
            return RagAnswer(answer_type="off_topic", answer=LISTEN_MESSAGE)
        if pressed in BUTTON_QUESTIONS:  # "선배들 이야기 들어볼래요" → 정해 둔 질문으로 찾는다
            question, previous_question, previous_answer = BUTTON_QUESTIONS[pressed], None, None

        intent = self.analyze_intent(question, previous_question)
        if intent is None and self.intent_analyzer is not None and has_emotion_word(question):
            # 분석이 실패했는데 감정 낱말이 있다 → 안전한 쪽(T1: 어른 연결 권유)으로 답한다
            intent = IntentResult(intent="unclear", emotional_state="T1")
        meta = {"intent": intent.intent, "user_context": intent.user_context} if intent else {}
        if intent is not None and intent.safety_concern:
            # 정규식이 놓친 돌려 말한 위기 표현("요즘 다 그만두고 싶어")도 T0 → 다른 어떤 문구보다 먼저 본다
            return safety()
        # T1·T2·T3·T5: 감정을 받아 주는 고정 문구 (검색·큰 모델 호출 없음). T4 는 아래에서 선배 이야기로 답한다
        emotional = emotional_reply_for(intent, safety_notice_shown) if intent is not None else None
        if emotional is not None:
            return RagAnswer(
                answer_type="off_topic",
                answer=emotional.text,
                follow_ups=emotional.follow_ups,
                safety_notice=emotional.safety_notice,
                **meta,
            )
        preface = preface_for(intent) if intent is not None else None
        if intent is not None and intent.standalone_question:
            question = intent.standalone_question  # 이어지는 질문은 앞 질문과 합쳐 고쳐 쓴 것으로 찾고 답한다
            is_follow_up = True
        # 인사·서비스 소개·잡담·막연한 고민은 고정 문구로 끝낸다 (검색·큰 모델 호출 없음)
        if intent is not None:
            fixed = fixed_reply_for(intent)
            if fixed is not None:
                return RagAnswer(
                    answer_type="off_topic",
                    answer=fixed.text,
                    about_aspect=fixed.about_aspect,
                    follow_ups=fixed.follow_ups,
                    emphasis=fixed.emphasis,
                    **meta,
                )

        try:
            # '다른 선배'를 찾는 말이면 이미 보여 준 글은 빼고 찾는다 ("더 자세히"는 같은 글을 다시 써야 하므로 빼지 않는다)
            wants_other = bool(is_follow_up and intent and intent.wants_other and seen)
            found = self.retrieve(question, intent, exclude_sources=seen if wants_other else None)
            if not found.hits and (wants_other or not self.settings.classify_when_no_hits):
                return no_evidence()
            docs = self.build_context(found)
            if intent is None:
                output = self.generator.generate(question, docs)
            elif is_follow_up and previous_answer:
                output = self.generator.generate(question, docs, intent=intent, previous_answer=previous_answer)
            else:
                output = self.generator.generate(question, docs, intent=intent)
        except Exception:
            # 학생에게는 안내 문구만, 원인(전체 오류 내용)은 서버 로그에
            logger.exception("RAG 답변 실패 → 임시 안내로 대신 답함")
            return RagAnswer(answer_type="no_evidence", answer=TEMPORARY_ERROR_MESSAGE, failed=True, **meta)

        if output.answer_type == "safety":
            return safety()
        if output.answer_type == "off_topic":
            return RagAnswer(answer_type="off_topic", answer=OFF_TOPIC_MESSAGE, **meta)
        if output.answer_type == "no_evidence" or not docs:
            return no_evidence()

        # ---- 5. 카드 조립: 근거 없는 조각·카드를 버리고, 카드마다 출처를 붙인다 (app/rag/cards.py) ----
        given = {c.chunk_id: c for doc in docs for c in doc.chunks}
        structured = assemble_cards(output, given, to_source, greeted=bool(intent and intent.has_greeting))
        if structured is None:  # 근거가 확인된 카드가 한 장도 없다 → 출처 없는 답변은 내보내지 않는다
            return no_evidence()

        # 맺음말의 "다른 선배 이야기도 더 있어요"는 시스템이 붙인다 (모델은 더 있는지 알 수 없다). 세 조건을 모두 만족할 때만:
        #   1) 질문이 특정 길·분야의 선배를 찾는다 (의도 분석이 태그를 뽑았다)
        #   2) 그 태그에 맞는 선배의 글이 아직 보여 주지 않은 채로 남아 있다
        #   3) 이 대화에서 아직 이 말을 한 적이 없다
        # (예전 기준 '안 쓴 글이 하나라도 있으면'은 답변의 97% 에 붙어서 의미가 없었다 → 2026-11-23 측정)
        shown = seen | {s.source_id for card in structured.cards for s in card.sources}
        has_more = not more_hint_shown and bool(found.tagged_sources - shown)
        structured.closing = with_more_hint(structured.closing, has_more)

        # 전체 출처 = 카드들의 출처를 순서대로 모은 것 (같은 chunk 는 한 번만)
        all_sources = {s.chunk_id: s for card in structured.cards for s in card.sources}
        return RagAnswer(
            answer_type="answer",
            answer="\n\n".join(filter(None, [preface, compose_text(structured)])),
            preface=preface,
            sources=list(all_sources.values()),
            structured=structured,
            more_hint=has_more,
            **meta,
        )


_MORE_CLAIM = re.compile(r"[^.!?]*(다른|또 다른)[^.!?]*더 있[^.!?]*[.!?]?\s*")


def with_more_hint(closing: str | None, has_more: bool) -> str | None:
    """모델이 쓴 '더 있어요' 문장은 지우고, 실제로 남은 글이 있을 때만 시스템 문구를 붙인다."""
    text = _MORE_CLAIM.sub("", closing or "").strip()
    if has_more:
        text = f"{text} {MORE_STORIES_HINT}".strip()
    return text or None


def build_pipeline_from_env(settings: RagSettings | None = None, local_chunks_path: str | None = None) -> RagPipeline:
    """
    실제 서비스용 파이프라인을 만든다. (API 키가 .env 에 있어야 한다)
    local_chunks_path 를 주면 Supabase 대신 그 jsonl 파일(임베딩 포함)을 메모리에 올려 검색한다.
    """
    from app.rag.embedding import OpenAIEmbedder
    from app.rag.generator import ClaudeGenerator
    from app.rag.intent import ClaudeIntentAnalyzer
    from app.rag.store import InMemoryVectorStore, SupabaseVectorStore

    s = settings or RagSettings.from_env()
    store = InMemoryVectorStore.from_jsonl(local_chunks_path) if local_chunks_path else SupabaseVectorStore()
    analyzer = ClaudeIntentAnalyzer(s.intent_model, timeout=s.intent_timeout_seconds) if s.intent_enabled else None
    return RagPipeline(
        intent_analyzer=analyzer,
        embedder=OpenAIEmbedder(
            s.embedding_model, timeout=s.embedding_timeout_seconds, max_retries=s.embedding_max_retries
        ),
        store=store,
        generator=ClaudeGenerator(
            s.claude_model,
            s.claude_effort,
            s.claude_max_tokens,
            s.claude_use_fallbacks,
            timeout=s.claude_timeout_seconds,
            max_retries=s.claude_max_retries,
        ),
        settings=s,
    )
