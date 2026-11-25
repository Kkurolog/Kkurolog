"""
초안 만들기 · 공개 전 검사 · 공개할 데이터 만들기. (AI·DB 를 부르지 않는 순수 함수만 둔다 → 테스트하기 쉽게)

1. build_draft(lines, ai): AI 결과(AiResult)를 초안(ImportDraft)으로 바꾼다.
   - 조각 내용은 AI 가 알려준 줄 번호로 원문에서 잘라 온다.
   - 줄 번호가 이상하면(범위 밖, 뒤집힘) 그 조각은 버린다.
   - 1,000자가 넘는 답변은 나눈다. 태그는 아는 것만 남긴다.
   - 개인정보는 AI 가 찾은 것 + 규칙(전화번호·메일)으로 찾은 것을 합친다.
2. publish_problems(draft): 공개하기 전에 남은 할 일 목록 (비어 있어야 공개할 수 있다).
3. build_rows(...): 초안 → sources·people·chunks 에 넣을 행. embed_text 형식은 scripts/build_dataset.py 와 같다.
"""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field

from app.ingest import text as textlib
from app.ingest.models import (
    DraftChunk,
    DraftPerson,
    DraftSource,
    ImportDraft,
    PiiFlag,
    valid_person_id,
)
from app.ingest.tags import FIELD_TAGS, PATH_TAGS, TOPIC_TAGS

SITE = "관리자 업로드"
MAX_TOPICS = 2


# ---------------------------------------------------------------- AI 결과 모양 (analyzer.py 의 JSON 스키마와 같다)
class AiSpeaker(BaseModel):
    ref: str
    role: Literal["alumni", "interviewer", "other"]
    label: str = ""
    nickname: str | None = None
    id_hint: str | None = None  # 별명을 로마자 소문자로 (예: "chashu") → person_id 후보
    path_summary: str | None = None
    career_paths: list[str] = Field(default_factory=list)
    path_detail: list[str] = Field(default_factory=list)
    career_fields: list[str] = Field(default_factory=list)
    field_detail: list[str] = Field(default_factory=list)
    organizations: list[str] = Field(default_factory=list)


class AiSegment(BaseModel):
    speaker: str
    question_start: int | None = None
    question_end: int | None = None
    answer_start: int
    answer_end: int
    topics: list[str] = Field(default_factory=list)
    topic_detail: list[str] = Field(default_factory=list)


class AiPii(BaseModel):
    line: int
    text: str
    kind: Literal["name", "school", "phone", "email", "address", "other"] = "other"


class AiResult(BaseModel):
    source_type: Literal["interview", "essay"] = "interview"
    title: str | None = None
    date: str | None = None
    speakers: list[AiSpeaker] = Field(default_factory=list)
    segments: list[AiSegment] = Field(default_factory=list)
    pii: list[AiPii] = Field(default_factory=list)
    note: str | None = None


# ---------------------------------------------------------------- 1. 초안 만들기
def _person_id(hint: str | None, fallback: str, used: set[str]) -> str:
    slug = re.sub(r"[^a-z0-9-]+", "-", (hint or "").lower()).strip("-")[:40]
    candidate = f"p-{slug}" if slug else fallback
    if not valid_person_id(candidate):
        candidate = fallback
    base, n = candidate, 2
    while candidate in used:
        candidate = f"{base}-{n}"
        n += 1
    used.add(candidate)
    return candidate


def _valid_date(value: str | None) -> str | None:
    try:
        return DraftSource(title="x", published_at=value).published_at
    except ValueError:
        return None


def build_draft(lines: list[str], ai: AiResult, *, filename: str, id_suffix: str, model: str) -> ImportDraft:
    """id_suffix: 이 업로드만의 글자 (예: 20261125-a1b2c3). 인물 id 후보가 겹치지 않게 쓴다."""
    total = len(lines)
    used_ids: set[str] = set()

    people: list[DraftPerson] = []
    for i, sp in enumerate(ai.speakers, start=1):
        paths = [t for t in sp.career_paths if t in PATH_TAGS]
        fields = [t for t in sp.career_fields if t in FIELD_TAGS]
        is_alumni = sp.role == "alumni"
        people.append(DraftPerson(
            ref=sp.ref[:20] or f"S{i}",
            label=sp.label[:100],
            role=sp.role,
            person_id=_person_id(sp.id_hint, f"p-up-{id_suffix}-{i}", used_ids) if is_alumni else "",
            nickname=(sp.nickname or "")[:50],
            path_summary=(sp.path_summary or "")[:300],
            career_paths=paths,
            path_detail=sp.path_detail,
            career_fields=fields,
            field_detail=sp.field_detail,
            organizations=sp.organizations,
            ai_career_paths=paths,
            ai_career_fields=fields,
        ))
    refs = {p.ref for p in people}
    labels = [p.label for p in people if p.label]

    chunks: list[DraftChunk] = []
    segments = sorted(ai.segments, key=lambda s: s.answer_start)
    for seg in segments:
        if seg.speaker not in refs or not (1 <= seg.answer_start <= seg.answer_end <= total):
            continue  # 없는 사람·이상한 줄 번호 → 버림 (관리자가 원문을 보고 직접 더할 수 있다)
        question = ""
        if seg.question_start and seg.question_end and 1 <= seg.question_start <= seg.question_end <= total:
            question = textlib.take_lines(lines, seg.question_start, seg.question_end, labels)
        content = textlib.take_lines(lines, seg.answer_start, seg.answer_end, labels)
        if not content:
            continue
        topics = [t for t in dict.fromkeys(seg.topics) if t in TOPIC_TAGS][:MAX_TOPICS]
        for part in textlib.split_long(content):
            chunks.append(DraftChunk(
                key=f"c{len(chunks) + 1:02d}",
                speaker=seg.speaker,
                question=question[:2000],
                content=part[:5000],
                lines=[seg.answer_start, seg.answer_end],
                topics=topics,
                topic_detail=seg.topic_detail if "etc" in topics else [],
                ai_topics=topics,
            ))

    pii: list[PiiFlag] = []
    seen: set[tuple[int, str]] = set()
    for flag in [*({**f.model_dump(), "by": "ai"} for f in ai.pii), *({**f, "by": "rule"} for f in textlib.find_pii(lines))]:
        key = (flag["line"], flag["text"])
        if key in seen or not (1 <= flag["line"] <= total) or not flag["text"].strip():
            continue
        seen.add(key)
        pii.append(PiiFlag(**{**flag, "text": flag["text"][:200]}))
    pii.sort(key=lambda f: f.line)

    title = (ai.title or "").strip() or re.sub(r"\.txt$", "", filename, flags=re.IGNORECASE)
    return ImportDraft(
        source=DraftSource(
            title=title[:200] or "제목 없음",
            source_type="졸업생 에세이" if ai.source_type == "essay" else "졸업생 인터뷰",
            published_at=_valid_date(ai.date),
        ),
        people=people,
        chunks=chunks,
        pii=pii,
        model=model,
        note=(ai.note or None),
    )


# ---------------------------------------------------------------- 2. 공개 전 검사
def publish_problems(draft: ImportDraft, existing_ids: set[str]) -> list[str]:
    """공개하기 전에 남은 할 일. existing_ids: DB 에 이미 있는 인물 id."""
    problems: list[str] = []
    alumni = [p for p in draft.people if p.role == "alumni"]
    refs = {p.ref for p in alumni}
    chunks = [c for c in draft.chunks if c.speaker in refs]

    if not draft.pii_checked:
        problems.append("개인정보 의심 부분을 확인해 주세요.")
    if not chunks:
        problems.append("졸업생이 말한 조각이 하나도 없어요.")

    new_ids: set[str] = set()
    for p in alumni:
        name = p.nickname or p.label or p.ref
        if not p.confirmed:
            problems.append(f"'{name}' 인물 정보를 확인해 주세요.")
        if p.link == "existing":
            if p.person_id not in existing_ids:
                problems.append(f"'{name}': 연결할 인물을 골라 주세요.")
            continue
        if not p.nickname:
            problems.append(f"'{name}': 별명을 적어 주세요.")
        if not valid_person_id(p.person_id):
            problems.append(f"'{name}': 인물 ID는 p- 로 시작하고 영어 소문자·숫자·'-'만 쓸 수 있어요.")
        elif p.person_id in existing_ids:
            problems.append(f"'{name}': 인물 ID {p.person_id} 는 이미 있어요. 다른 ID를 쓰거나 '있는 인물에 연결'을 골라 주세요.")
        elif p.person_id in new_ids:
            problems.append(f"'{name}': 인물 ID {p.person_id} 가 이 파일 안에서 겹쳐요.")
        new_ids.add(p.person_id)
        if not p.career_paths:
            problems.append(f"'{name}': 진로 경로 태그를 하나 이상 골라 주세요 (맞는 게 없으면 기타).")
        if "etc" in p.career_paths and not p.path_detail:
            problems.append(f"'{name}': 경로가 기타면 상세 내용을 적어 주세요.")
        if "etc" in p.career_fields and not p.field_detail:
            problems.append(f"'{name}': 분야가 기타면 상세 내용을 적어 주세요.")

    unconfirmed = sum(1 for c in chunks if not c.confirmed)
    if unconfirmed:
        problems.append(f"아직 확인하지 않은 조각이 {unconfirmed}개 있어요.")
    for c in chunks:
        if not c.content.strip():
            problems.append(f"조각 {c.key}: 내용이 비어 있어요.")
        if not 1 <= len(c.topics) <= MAX_TOPICS:
            problems.append(f"조각 {c.key}: 주제 태그를 1~2개 골라 주세요.")
        if "etc" in c.topics and not c.topic_detail:
            problems.append(f"조각 {c.key}: 주제가 기타면 상세 내용을 적어 주세요.")
    return problems


# ---------------------------------------------------------------- 3. 공개할 행 만들기
def embed_text(nickname: str, path_summary: str, organizations: list[str], question: str, content: str) -> str:
    """scripts/build_dataset.py 의 embed_text 와 같은 형식 (실명 없음)."""
    head = [nickname, path_summary]
    if organizations:
        head.append("기관: " + ", ".join(organizations))
    if question:
        head.append("질문: " + question)
    return "[" + " | ".join(h for h in head if h) + "]\n" + content


def build_rows(source_id: str, draft: ImportDraft, existing: dict[str, dict]) -> tuple[dict, list[dict], list[dict]]:
    """
    source_id: 새 글 번호 (예: up-20261125-a1b2c3)
    existing: '있는 인물에 연결'한 인물의 DB 행 {id: row} (별명·진로 요약·태그를 DB 값으로 쓴다)
    → (source, people, chunks). chunks 에는 아직 embedding 이 없다 (router 가 임베딩을 만들어 붙인다).
    """
    source = {
        "id": source_id,
        "title": draft.source.title,
        "url": "",
        "published_at": draft.source.published_at,
        "source_type": draft.source.source_type,
        "site": SITE,
        "visibility": draft.source.visibility,
    }

    alumni = {p.ref: p for p in draft.people if p.role == "alumni"}
    people_rows: list[dict] = []
    person_info: dict[str, dict] = {}  # ref → embed_text·태그에 쓸 인물 정보
    for ref, p in alumni.items():
        if p.link == "existing":
            row = existing[p.person_id]
            people_rows.append({"id": p.person_id, "is_new": False})
            person_info[ref] = {
                "id": p.person_id,
                "nickname": row.get("nickname") or "",
                "path_summary": row.get("path_summary") or "",
                "organizations": row.get("organizations") or [],
                "career_paths": row.get("career_paths") or [],
                "career_fields": row.get("career_fields") or [],
            }
        else:
            people_rows.append({
                "id": p.person_id,
                "is_new": True,
                "nickname": p.nickname,
                "real_name": p.real_name,
                "speaker_type": "alumni",
                "path_summary": p.path_summary,
                "career_paths": p.career_paths,
                "path_detail": p.path_detail,
                "career_fields": p.career_fields,
                "field_detail": p.field_detail,
                "organizations": p.organizations,
                "as_of_date": draft.source.published_at,
            })
            person_info[ref] = {
                "id": p.person_id,
                "nickname": p.nickname,
                "path_summary": p.path_summary,
                "organizations": p.organizations,
                "career_paths": p.career_paths,
                "career_fields": p.career_fields,
            }

    chunk_rows: list[dict] = []
    for c in draft.chunks:
        info = person_info.get(c.speaker)
        if not info:
            continue  # 인터뷰어·그 밖의 사람의 말은 넣지 않는다
        index = len(chunk_rows) + 1
        content = c.content.strip()
        chunk_rows.append({
            "id": f"{source_id}-{index:02d}",
            "person_id": info["id"],
            "chunk_index": index,
            "question": c.question.strip(),
            "content": content,
            "embed_text": embed_text(info["nickname"], info["path_summary"], info["organizations"], c.question.strip(), content),
            "topics": c.topics,
            "topic_detail": c.topic_detail if "etc" in c.topics else [],
            "career_paths": info["career_paths"],
            "career_fields": info["career_fields"],
            "speaker_type": "alumni",
            "char_count": len(content),
        })
    return source, people_rows, chunk_rows
