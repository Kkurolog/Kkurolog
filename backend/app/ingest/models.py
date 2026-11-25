"""
인터뷰 넣기: 초안(draft)과 API 요청·응답 형식. 프론트는 frontend/src/lib/adminApi.ts 에 같은 모양의 타입을 둔다.

초안 = AI 가 만든 결과 + 관리자가 고친 내용. import_files.draft 칸에 JSON 으로 통째로 저장한다.
  source : 글 정보 (제목, 인터뷰/에세이, 날짜, 공개 등급)
  people : 원문에서 말한 사람 (졸업생 / 인터뷰어 / 그 밖의 사람). 졸업생만 조각을 가진다
  chunks : 조각 (질문 + 답변 원문 + 주제 태그)
  pii    : 개인정보로 보이는 부분 (AI + 규칙). 관리자가 확인했다고 눌러야(pii_checked) 공개할 수 있다
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.ingest.tags import FIELD_TAGS, PATH_TAGS, TOPIC_TAGS

PERSON_ID_PATTERN = r"^p-[a-z0-9][a-z0-9-]{0,60}$"
IMPORT_ID_PATTERN = r"^imp-\d{8}-[0-9a-f]{6}$"

MAX_FILES = 20  # 한 번에 올릴 수 있는 파일 수
MAX_FILE_CHARS = 100_000  # 파일 하나의 최대 글자 수 (AI 가 한 번에 읽을 수 있게)

Role = Literal["alumni", "interviewer", "other"]
Status = Literal["analyzing", "review", "published", "failed"]


def _known(values: list[str], allowed: dict[str, str]) -> list[str]:
    """아는 태그만, 겹치지 않게 (순서 유지)."""
    return [v for v in dict.fromkeys(values) if v in allowed]


def _clean_list(values: list[str]) -> list[str]:
    return [v.strip() for v in dict.fromkeys(values) if v and v.strip()]


# ---------------------------------------------------------------- 초안
class DraftSource(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    source_type: Literal["졸업생 인터뷰", "졸업생 에세이"] = "졸업생 인터뷰"
    published_at: str | None = Field(None, description="인터뷰·글 날짜 YYYY-MM-DD (모르면 null)")
    visibility: Literal["L1", "L2", "L3"] = "L1"  # 확실하지 않으면 L1 (docs/DATA.md 2장)

    @field_validator("published_at")
    @classmethod
    def _date(cls, value: str | None) -> str | None:
        if not value:
            return None
        try:
            datetime.strptime(value, "%Y-%m-%d")
        except ValueError:
            raise ValueError("날짜는 YYYY-MM-DD 로 적어 주세요.") from None
        return value


class DraftPerson(BaseModel):
    ref: str = Field(..., min_length=1, max_length=20)  # 초안 안에서 쓰는 이름표 (S1, S2 …)
    label: str = Field("", max_length=100)  # 원문에서 이 사람을 부르는 표시 (예: "차슈", "Q") — 실명일 수 있다
    role: Role = "alumni"
    link: Literal["new", "existing"] = "new"  # 새 인물로 추가 / DB 에 있는 인물에 연결
    person_id: str = Field("", max_length=64)
    nickname: str = Field("", max_length=50)
    real_name: str = Field("", max_length=50)  # DB 에만 두고 화면·검색 결과에 내보내지 않는다
    path_summary: str = Field("", max_length=300)
    career_paths: list[str] = Field(default_factory=list)
    path_detail: list[str] = Field(default_factory=list)
    career_fields: list[str] = Field(default_factory=list)
    field_detail: list[str] = Field(default_factory=list)
    organizations: list[str] = Field(default_factory=list)
    ai_career_paths: list[str] = Field(default_factory=list)  # AI 가 처음 추천한 태그 (화면의 'AI 추천' 표시용)
    ai_career_fields: list[str] = Field(default_factory=list)
    confirmed: bool = False

    @field_validator("career_paths", "ai_career_paths")
    @classmethod
    def _paths(cls, value: list[str]) -> list[str]:
        return _known(value, PATH_TAGS)

    @field_validator("career_fields", "ai_career_fields")
    @classmethod
    def _fields(cls, value: list[str]) -> list[str]:
        return _known(value, FIELD_TAGS)

    @field_validator("path_detail", "field_detail", "organizations")
    @classmethod
    def _lists(cls, value: list[str]) -> list[str]:
        return _clean_list(value)


class DraftChunk(BaseModel):
    key: str = Field(..., min_length=1, max_length=20)  # 초안 안에서 쓰는 이름표 (c01, c02 …)
    speaker: str = Field(..., max_length=20)  # DraftPerson.ref
    question: str = Field("", max_length=2000)
    content: str = Field("", max_length=5000)
    lines: list[int] = Field(default_factory=list)  # 원문에서의 줄 번호 [시작, 끝] (화면 표시용)
    topics: list[str] = Field(default_factory=list)
    topic_detail: list[str] = Field(default_factory=list)
    ai_topics: list[str] = Field(default_factory=list)
    confirmed: bool = False

    @field_validator("topics", "ai_topics")
    @classmethod
    def _topics(cls, value: list[str]) -> list[str]:
        return _known(value, TOPIC_TAGS)

    @field_validator("topic_detail")
    @classmethod
    def _detail(cls, value: list[str]) -> list[str]:
        return _clean_list(value)


class PiiFlag(BaseModel):
    line: int  # 원문 줄 번호 (1부터)
    text: str = Field(..., max_length=200)  # 의심되는 글자
    kind: Literal["name", "school", "phone", "email", "address", "other"] = "other"
    by: Literal["ai", "rule"] = "ai"


class ImportDraft(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    source: DraftSource
    people: list[DraftPerson] = Field(default_factory=list, max_length=30)
    chunks: list[DraftChunk] = Field(default_factory=list, max_length=400)
    pii: list[PiiFlag] = Field(default_factory=list, max_length=500)
    pii_checked: bool = False  # 관리자가 개인정보 의심 부분을 모두 확인했다
    model: str = ""  # 초안을 만든 AI 모델
    note: str | None = None  # AI 가 남긴 메모 (예: "앞쪽 편집자 소개는 조각에서 뺐어요")

    def alumni_refs(self) -> set[str]:
        return {p.ref for p in self.people if p.role == "alumni"}

    def summary(self) -> dict:
        """목록 화면에 보여줄 개수 (import_files.summary)."""
        alumni = self.alumni_refs()
        chunks = [c for c in self.chunks if c.speaker in alumni]
        return {
            "people": len(alumni),
            "chunks": len(chunks),
            "confirmed": sum(1 for c in chunks if c.confirmed),
            "pii": len(self.pii),
        }


# ---------------------------------------------------------------- API
class UploadedText(BaseModel):
    filename: str = Field(..., min_length=1, max_length=200)
    text: str = Field(..., min_length=1, max_length=MAX_FILE_CHARS)


class UploadRequest(BaseModel):
    files: list[UploadedText] = Field(..., min_length=1, max_length=MAX_FILES)


class ImportItem(BaseModel):
    """목록 한 줄 (원문·초안 없이)."""

    id: str
    filename: str
    status: Status
    error: str | None = None
    summary: dict | None = None
    source_id: str | None = None
    created_at: datetime
    updated_at: datetime
    analyzed_at: datetime | None = None
    published_at: datetime | None = None


class ImportPage(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[ImportItem]


class ImportDetail(BaseModel):
    item: ImportItem
    raw_text: str  # 공개한 뒤에는 "" (원문을 지운다)
    draft: ImportDraft | None


class PersonOption(BaseModel):
    """'DB 에 있는 인물에 연결'할 때 고르는 목록 (실명 없음)."""

    id: str
    nickname: str
    path_summary: str | None = None
    career_paths: list[str] = Field(default_factory=list)
    career_fields: list[str] = Field(default_factory=list)


class PublishResult(BaseModel):
    source_id: str
    people: int
    chunks: int


def valid_person_id(value: str) -> bool:
    return bool(re.fullmatch(PERSON_ID_PATTERN, value))
