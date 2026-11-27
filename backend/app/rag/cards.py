"""
카드형 답변 조립: Claude 가 쓴 카드를 검증해서 학생에게 보여줄 모양으로 만든다. (LLM 이 아니라 코드가 한다)

  1. 인용 검증 (조각 단위)
     - 근거 chunk 가 없거나, Claude 에게 준 적 없는 id 만 단 조각은 버린다
     - 조각이 하나도 안 남은 카드는 통째로 버린다
     - 카드가 0장이면 호출한 쪽(pipeline)이 '근거 부족'으로 바꾼다
  2. 카드별 출처: 살아남은 조각이 인용한 chunk 만 그 카드의 출처가 된다 (하단에 하나로 뭉치지 않는다)
  3. 별명: 공개 등급 L3 인 선배만 별명을 보여 준다. 그 외에는 None → 화면에는 길 이름(label)만 보인다
     - 별명은 식별자가 아니다. 같은 별명을 쓰는 다른 사람이 있을 수 있다 (내부 식별은 person_id)
     - 서로 다른 사람이 같은 별명으로 함께 나오면, 구분할 기수 정보가 아직 없어서 둘 다 None 으로 둔다
  4. 선배 수·인사: headline 의 {n} 을 실제 카드 수로 바꾸고, 학생이 인사했으면 인사 한마디를 앞에 붙인다
  5. 아바타: 선배마다 고정된 번호(avatar-1~7)를 붙인다 (app/avatars.py). 화면이 번호에 맞는 그림을 보여 준다
     - 한 답변 안에서 서로 다른 선배끼리 그림이 겹치면 뒤쪽 선배를 다음 번호로 바꾼다
  6. 글로 풀어 쓰기: 카드를 그리지 못하는 화면도 읽을 수 있게 answer 문자열을 만든다
"""

import json
import logging
import re
from pathlib import Path

from app.avatars import avatar_id_for_key, avatar_ids_without_repeats
from app.rag.models import Chunk, GeneratedCard, GeneratorOutput, RagCard, RagSource, RagStructured

logger = logging.getLogger("uvicorn.error")

MAX_CARDS = 4
MAX_PARAGRAPHS = 2  # 카드 한 장의 본문 문단 수. 문단이 길어진 만큼 수를 줄였다 (지시문 6번과 같다)


# 인터뷰 당시의 상태를 짧게 적은 표: {글번호: "대학 재학 · 프로젝트 활동"}. 사람이 검토해서 넣은 값이다.
# 규칙: 명사형, 15자 이내, 회사·학교 이름 없이 직무나 분야만.
# 표에 없는 글은 답변 모델이 같은 규칙으로 쓴 one_liner 를 대신 쓴다.
STATUS_SHORT_PATH = Path(__file__).resolve().parent.parent / "data" / "status_short.json"
STATUS_SHORT_MAX_CHARS = 15


def load_status_short(path: Path = STATUS_SHORT_PATH) -> dict[str, str]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        logger.exception("status_short.json 을 읽지 못했어요. 답변 모델이 쓴 상태를 대신 씁니다.")
        return {}
    return {str(k): v.strip() for k, v in data.items() if isinstance(v, str) and v.strip()}


STATUS_SHORT = load_status_short()


def interview_year(sources: list[RagSource]) -> int | None:
    """카드의 첫 출처가 쓰인 해. 화면이 "2022년 인터뷰" 배지로 보여 준다. 날짜를 모르면 None."""
    for s in sources:
        match = re.match(r"(\d{4})", s.published_at or "")
        if match:
            return int(match.group(1))
    return None


def status_short_for(sources: list[RagSource], written: str | None) -> str | None:
    """검토된 표에 그 글의 상태가 있으면 그 값, 없으면 답변 모델이 쓴 것(written)."""
    for s in sources:
        if s.source_id in STATUS_SHORT:
            return STATUS_SHORT[s.source_id]
    return (written or "").strip() or None


GREETING_PREFIX = "안녕하세요! "


def _avatar_key(chunk: Chunk) -> str:
    """아바타를 정할 때 쓰는 사람 key: person_id, 없으면 글번호. 밖으로 내보내지 않는다."""
    return chunk.person_id or chunk.source_id


def avatar_id_for(chunk: Chunk) -> str:
    """
    선배마다 고정된 아바타 번호 ('avatar-1'~'avatar-7'). 같은 선배는 어느 답변에서든 같은 값이 나온다.
    내부 ID(person_id, 없으면 글번호)로 정한다. 내부 ID 자체는 내보내지 않는다. (계산은 app/avatars.py)
    한 답변 안의 겹침 피하기는 compose 에서 avatar_ids_without_repeats 로 한다.
    """
    return avatar_id_for_key(_avatar_key(chunk))


def fill_headline(headline: str, count: int, greeted: bool) -> str:
    """
    headline 의 {n} 자리를 실제 카드 수로 바꾼다 (근거 검증에서 카드가 빠질 수 있어서 Claude 가 세지 않는다).
    학생이 인사했으면 인사 한마디를 앞에 붙인다.
    """
    text = headline.strip().replace("{n}", str(count))
    return GREETING_PREFIX + text if greeted and text else text


def assemble_cards(
    output: GeneratorOutput, given: dict[str, Chunk], to_source, greeted: bool = False
) -> RagStructured | None:
    """
    given: Claude 에게 넘긴 chunk (id → Chunk). to_source: 공개 등급 규칙을 적용해 출처로 바꾸는 함수.
    greeted: 학생이 인사를 했는지 (1차 의도 분석). 보여줄 카드가 하나도 없으면 None.
    """
    kept: list[tuple[GeneratedCard, list[str], list[str]]] = []  # (카드, 살아남은 조각, 인용한 chunk id)
    unknown: list[str] = []
    for card in output.cards:
        pieces: list[str] = []
        ids: list[str] = []
        for piece in card.body:
            text = piece.text.strip()
            valid = [i for i in piece.chunk_ids if i in given]
            unknown += [i for i in piece.chunk_ids if i not in given]
            if text and valid:
                if len(pieces) == MAX_PARAGRAPHS:  # 넘치는 문단은 버린다 (그 문단의 출처도 붙이지 않는다)
                    logger.warning("문단이 %d개보다 많이 왔어요. 앞의 것만 씁니다.", MAX_PARAGRAPHS)
                    break
                pieces.append(text)
                ids += valid
        if pieces and card.label.strip():
            kept.append((card, pieces, list(dict.fromkeys(ids))))
    if unknown:
        logger.warning("Claude 가 근거에 없는 chunk id 를 냈어요: %s", unknown)
    if len(kept) > MAX_CARDS:
        logger.warning("카드가 %d장 왔어요. 앞의 %d장만 씁니다.", len(kept), MAX_CARDS)
        kept = kept[:MAX_CARDS]
    if not kept:
        return None

    people = [_public_person(ids, given) for _, _, ids in kept]
    # 한 답변 안에서 서로 다른 선배끼리 같은 그림이 나오지 않게 한다 (같은 선배는 같은 그림)
    avatars = avatar_ids_without_repeats([_avatar_key(given[ids[0]]) for _, _, ids in kept])
    cards = []
    for (card, pieces, ids), person, avatar in zip(kept, people, avatars):
        sources = [to_source(given[i]) for i in ids]
        status = status_short_for(sources, card.one_liner)
        cards.append(
            RagCard(
                nickname=_nickname(person, people),
                label=card.label.strip(),
                one_liner=status,  # 예전 화면이 읽는 칸. status_short 와 같은 값을 넣는다
                status_short=status,
                interview_year=interview_year(sources),
                body=pieces,
                sources=sources,
                avatar_id=avatar,
            )
        )
    return RagStructured(
        headline=fill_headline(output.headline, len(cards), greeted),
        compare=(output.compare or "").strip() or None if len(cards) > 1 else None,
        cards=cards,
        closing=(output.closing or "").strip() or None,
    )


def _public_person(ids: list[str], given: dict[str, Chunk]) -> tuple[str, str] | None:
    """
    카드가 인용한 chunk 가 모두 같은 사람의 것이고 전부 L3 일 때만 (person_id, 별명).
    한 조각이라도 익명 글에서 왔으면 None (별명을 붙이면 익명 글의 주인이 드러난다).
    """
    chunks = [given[i] for i in ids]
    person_ids = {c.person_id for c in chunks}
    if len(person_ids) != 1 or any(c.visibility != "L3" for c in chunks):
        return None
    nickname = chunks[0].nickname.strip()
    return (chunks[0].person_id, nickname) if nickname else None


def _nickname(person: tuple[str, str] | None, people: list[tuple[str, str] | None]) -> str | None:
    if person is None:
        return None
    same_name_other_person = any(p is not None and p[1] == person[1] and p[0] != person[0] for p in people)
    return None if same_name_other_person else person[1]


# ---------------------------------------------------------------------------
# 글로 풀어 쓰기
# ---------------------------------------------------------------------------
_DATE = re.compile(r"^(\d{4})(?:-(\d{1,2}))?")


def format_when(published_at: str | None) -> str | None:
    """'2024-11-06' → '2024년 11월', '2022' → '2022년'. 모르면 None."""
    match = _DATE.match(published_at or "")
    if not match:
        return None
    return f"{match[1]}년 {int(match[2])}월" if match[2] else f"{match[1]}년"


def source_text(sources: list[RagSource]) -> str:
    """카드 한 장의 출처를 한 줄로. 같은 글은 한 번만. 예: '2024년 11월 글', '2024년 4월, 「글 제목」'"""
    seen: dict[str, str] = {}
    for s in sources:
        when = format_when(s.published_at)
        if s.title:
            label = f"{when}, 「{s.title}」" if when else f"「{s.title}」"
        else:
            label = f"{when} 글" if when else "선배 글"
        seen.setdefault(s.source_id, label)
    return " · ".join(seen.values())


def card_title(card: RagCard) -> str:
    return f"{card.nickname} 선배 · {card.label}" if card.nickname else card.label


def compose_text(structured: RagStructured) -> str:
    """카드형 답변을 문단형 글로 푼다. 문단 사이는 빈 줄 (화면이 빈 줄로 문단을 나눈다)."""
    parts = [structured.headline] if structured.headline else []
    if structured.compare:
        parts.append(structured.compare)
    for n, card in enumerate(structured.cards, start=1):
        lines = [f"{n}. {card_title(card)}"]
        badge = f"[{card.interview_year}년 인터뷰]" if card.interview_year else ""
        status_line = " ".join(filter(None, [badge, card.status_short]))
        if status_line:
            lines.append(status_line)
        lines += card.body
        lines.append(f"({source_text(card.sources)})")
        parts.append("\n".join(lines))
    if structured.closing:
        parts.append(structured.closing)
    return "\n\n".join(parts)
