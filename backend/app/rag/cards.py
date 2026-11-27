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
                nickname=None,  # 별명은 보여 주지 않는다. 화면에는 '선배 A' 라벨(senior_label)이 나온다 → apply_senior_labels
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


_LABEL = re.compile(r"선배 ([A-Z])(?![A-Za-z])")


def apply_senior_labels(structured: RagStructured, doc_labels: dict[str, str]) -> RagStructured:
    """
    별명 대신 '선배 A/B/C' 라벨을 붙인다. 화면에 나오는 순서대로 A 부터 다시 매긴다.
    doc_labels: 답변 모델에게 글을 줄 때 붙인 라벨 {글번호: '선배 B'}. 모델은 글에서 이 라벨로 선배를 부른다.
    답변에 실제로 쓰인 글만 남으므로(예: B·C 만 쓰임), 보이는 순서(카드 → 문단 출처)대로 A·B 로 바꿔 붙이고
    본문·머리말·맺음말 속 라벨도 같이 바꾼다. 카드 제목, 출처, 본문의 라벨이 서로 같은 선배를 가리키게 된다.
    """
    order = [s.source_id for card in structured.cards for s in card.sources[:1]]
    order += [s.source_id for s in structured.summary_sources]
    order = list(dict.fromkeys(order))
    final = {sid: f"선배 {chr(ord('A') + i)}" for i, sid in enumerate(order)}
    # 모델이 쓴 라벨(글 순서 기준) → 화면 라벨. 답변에 안 쓰인 글의 라벨은 뒤쪽 글자로 밀어 겹치지 않게 한다
    mapping = {doc_labels[sid][-1]: final[sid][-1] for sid in order if sid in doc_labels}
    spare = [chr(ord("A") + i) for i in range(len(order), 26)]
    for sid, label in doc_labels.items():
        if sid not in final and spare:
            mapping[label[-1]] = spare.pop(0)

    def relabel(text: str | None) -> str | None:
        return _LABEL.sub(lambda m: f"선배 {mapping.get(m.group(1), m.group(1))}", text) if text else text

    structured.headline = relabel(structured.headline) or ""
    structured.compare = relabel(structured.compare)
    structured.sub_headline = relabel(structured.sub_headline)
    structured.closing = relabel(structured.closing)
    structured.summary = [relabel(p) for p in structured.summary]
    for card in structured.cards:
        card.body = [relabel(p) for p in card.body]
        card.senior_label = final.get(card.sources[0].source_id, "") if card.sources else ""
        for src in card.sources:
            src.senior_label = final.get(src.source_id, card.senior_label)
    for src in structured.summary_sources:
        src.senior_label = final.get(src.source_id, "")
    return structured


def valid_summary(output: GeneratorOutput, given: dict[str, Chunk], limit: int) -> tuple[list[str], list[str]]:
    """근거가 확인된 summary 문단과, 그 문단들이 인용한 chunk id (최대 limit 문단)."""
    paragraphs: list[str] = []
    ids: list[str] = []
    for piece in output.summary:
        text = piece.text.strip()
        valid = [i for i in piece.chunk_ids if i in given]
        if text and valid and len(paragraphs) < limit:
            paragraphs.append(text)
            ids += valid
    return paragraphs, list(dict.fromkeys(ids))


_INSTEAD = re.compile(r"^(대신\s[^.!?]*?있어요[.!]?)\s*")


def lift_sub_headline(structured: RagStructured, compare: str | None) -> RagStructured:
    """
    글이 물은 주제를 직접 다루지 않을 때(유형 F) "대신 ~ 이야기가 있어요."를 머리말 아래의 작은 제목으로 올린다.
    모델이 compare 에 썼으면 그것을, 첫 문단의 첫 문장으로 썼으면 그 문장을 떼어 온다 (본문에 두 번 나오지 않게).
    """
    text = (compare or "").strip()
    if structured.summary:
        match = _INSTEAD.match(structured.summary[0])
        if match:
            text = text or match.group(1)
            rest = structured.summary[0][match.end():].strip()
            structured.summary = ([rest] if rest else []) + structured.summary[1:]
    if text:
        structured.sub_headline = text
        if structured.compare and structured.compare.strip() == text:
            structured.compare = None  # 같은 문장을 회색 한 줄로 또 보여 주지 않는다
    return structured


MAX_MIXED_SUMMARY_PARAGRAPHS = 1  # 혼합형 답변에서 카드 위에 두는 공통 방법 문단 수
MAX_SUMMARY_PARAGRAPHS = 3  # 정리형 답변의 문단 수 (지시문 17번과 같다)


def assemble_summary(output: GeneratorOutput, given: dict[str, Chunk], to_source, greeted: bool) -> RagStructured | None:
    """
    정리형 답변(방법·팁 질문) 조립. 선배별 카드로 나누지 않고 문단 글로 답한다.
    카드와 같은 규칙으로 검증한다: 근거 chunk 가 없는 문단은 버리고, 하나도 안 남으면 None (→ 근거 부족).
    출처는 살아남은 문단이 인용한 chunk 만 모아 답변 맨 아래에 한 번 보여 준다.
    """
    paragraphs: list[str] = []
    ids: list[str] = []
    unknown: list[str] = []
    for piece in output.summary:
        text = piece.text.strip()
        valid = [i for i in piece.chunk_ids if i in given]
        unknown += [i for i in piece.chunk_ids if i not in given]
        if text and valid and len(paragraphs) < MAX_SUMMARY_PARAGRAPHS:
            paragraphs.append(text)
            ids += valid
    if unknown:
        logger.warning("Claude 가 근거에 없는 chunk id 를 냈어요: %s", unknown)
    if not paragraphs:
        return None
    return RagStructured(
        headline=fill_headline(output.headline, len(paragraphs), greeted),
        compare=None,
        cards=[],
        summary=paragraphs,
        summary_sources=[to_source(given[i]) for i in dict.fromkeys(ids)],
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
    return f"{card.senior_label} · {card.label}" if card.senior_label else card.label


def compose_text(structured: RagStructured) -> str:
    """카드형 답변을 문단형 글로 푼다. 문단 사이는 빈 줄 (화면이 빈 줄로 문단을 나눈다)."""
    parts = [structured.headline] if structured.headline else []
    if structured.sub_headline:
        parts.append(structured.sub_headline)
    if structured.compare:
        parts.append(structured.compare)
    parts += structured.summary  # 문단형이면 문단들만, 혼합형이면 공통 방법 문단이 카드 위에 온다
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
    if structured.summary_sources:  # 정리형 답변의 출처는 맨 아래에 한 번
        parts.append(f"({source_text(structured.summary_sources)})")
    return "\n\n".join(parts)
