"""
RagAnswer(RAG 내부 형식) → AskResponse(/ask 응답 형식) 변환.

응답 형식은 docs/proposals/ask-plan.md 의 제안대로 새 선택 필드를 쓴다.
  - answer_type: 그대로 넘긴다 (answer | no_evidence | off_topic | safety)
  - has_enough_evidence: no_evidence 일 때만 False (지금 프론트와의 하위 호환)
  - 출처: answer 일 때만 넣는다. L1 출처도 빼지 않고 excerpt=None 으로 넣는다
          (공개 등급 규칙은 schemas.Source 가 한 번 더 강제한다: L1 은 excerpt 없음, url 은 L3 만)
  - 같은 글의 chunk 여러 개: 프론트가 interview_id 를 key 로 쓰므로 글 하나당 출처 하나로 합친다
"""

from app.rag.models import RagAnswer, RagSource
from app.schemas import AskResponse, Source

EXCERPT_SEPARATOR = "\n…\n"


def _merge_post(post_id: str, group: list[RagSource]) -> Source:
    """같은 글에서 나온 출처들을 하나로 합친다."""
    first = group[0]
    excerpts = [s.excerpt for s in group if s.excerpt]
    return Source(
        alumni=first.alumni,
        excerpt=EXCERPT_SEPARATOR.join(excerpts) or None,
        interview_id=post_id,
        visibility=first.visibility,
        date=first.date,
        url=first.url,
    )


def to_ask_response(result: RagAnswer) -> AskResponse:
    sources: list[Source] = []
    if result.answer_type == "answer":
        by_post: dict[str, list[RagSource]] = {}
        for s in result.sources:
            by_post.setdefault(s.post_id, []).append(s)
        sources = [_merge_post(pid, group) for pid, group in by_post.items()]

    return AskResponse(
        answer=result.answer,
        sources=sources,
        has_enough_evidence=result.answer_type != "no_evidence",
        answer_type=result.answer_type,
    )
