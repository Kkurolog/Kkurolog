"""
RagAnswer(RAG 내부 형식) → AskResponse(/ask 응답 형식) 변환.

응답 형식은 docs/proposals/ask-plan.md 의 제안대로 새 선택 필드를 쓴다.
  - answer_type: 그대로 넘긴다 (answer | no_evidence | off_topic | safety)
  - has_enough_evidence: no_evidence 일 때만 False (지금 프론트와의 하위 호환)
  - 출처: answer 일 때만 넣는다. L1 출처도 빼지 않고 excerpt=None 으로 넣는다
          (공개 등급 규칙은 schemas.Source 가 한 번 더 강제한다: L1 은 excerpt 없음, url·title 은 L3 만)
  - 같은 글의 chunk 여러 개: 프론트가 interview_id 를 key 로 쓰므로 글 하나당 출처 하나로 합친다
  - structured: 카드형 답변. 카드마다 그 카드가 인용한 글만 sources 로 붙는다
"""

from app.rag.models import RagAnswer, RagSource, RagStructured
from app.schemas import AnswerCard, AskResponse, Source, StructuredAnswer

EXCERPT_SEPARATOR = "\n…\n"


def _merge_source(source_id: str, group: list[RagSource]) -> Source:
    """같은 글에서 나온 출처들을 하나로 합친다."""
    first = group[0]
    excerpts = [s.excerpt for s in group if s.excerpt]
    return Source(
        alumni=first.alumni,
        excerpt=EXCERPT_SEPARATOR.join(excerpts) or None,
        interview_id=source_id,
        visibility=first.visibility,
        date=first.published_at,
        url=first.url,
        title=first.title,  # L3 가 아니면 pipeline.public_title 이 이미 비웠고, Source 가 한 번 더 막는다
    )


def _merge_sources(sources: list[RagSource]) -> list[Source]:
    """chunk 단위 출처를 글 단위로 묶는다 (처음 나온 순서 유지)."""
    by_source: dict[str, list[RagSource]] = {}
    for s in sources:
        by_source.setdefault(s.source_id, []).append(s)
    return [_merge_source(sid, group) for sid, group in by_source.items()]


def _to_structured(structured: RagStructured) -> StructuredAnswer:
    return StructuredAnswer(
        headline=structured.headline,
        compare=structured.compare,
        cards=[
            AnswerCard(
                id=f"card-{n}",
                nickname=card.nickname,
                label=card.label,
                one_liner=card.one_liner,
                body=card.body,
                sources=_merge_sources(card.sources),
                avatar_id=card.avatar_id,
            )
            for n, card in enumerate(structured.cards, start=1)
        ],
        closing=structured.closing,
    )


def to_ask_response(result: RagAnswer) -> AskResponse:
    is_answer = result.answer_type == "answer"
    return AskResponse(
        answer=result.answer,
        structured=_to_structured(result.structured) if is_answer and result.structured else None,
        sources=_merge_sources(result.sources) if is_answer else [],
        has_enough_evidence=result.answer_type != "no_evidence",
        answer_type=result.answer_type,
        intent=result.intent,
        user_context=result.user_context,
        about_aspect=result.about_aspect,
        follow_ups=result.follow_ups,
    )
