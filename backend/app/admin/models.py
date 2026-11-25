"""
관리자 API 요청·응답 형식. 관리자 페이지(프론트)를 만들 때 frontend/src/lib 에 같은 모양의 타입을 만든다.
(학생 화면용 app/schemas.py 와 분리: 학생 응답에 관리자용 필드(메일 주소 등)가 섞이지 않게)
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_validator

from app.mail.timeutil import KST

EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


def _to_kst(moment: datetime) -> datetime:
    """시각을 한국 시간(+09:00)으로. Supabase 는 UTC(Z)로 돌려주지만 관리자에게는 한국 시간으로 보여 준다.
    시간대가 없는 값은 UTC 로 본다. 초 아래 자리는 버린다."""
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(KST).replace(microsecond=0)


# 관리자 응답의 모든 시각에 쓴다. 예: 2026-11-20T22:15:01+09:00
KstDatetime = Annotated[datetime, AfterValidator(_to_kst)]


class LoginRequest(BaseModel):
    password: str = Field(..., min_length=1, max_length=200)


class LoginResponse(BaseModel):
    token: str
    expires_at: KstDatetime


# ---------------------------------------------------------------- 문의
class InquiryItem(BaseModel):
    """관리자 화면 8개 항목 + 문의번호·멘토 ID·리마인드 시각."""

    id: str
    created_at: KstDatetime            # 보낸 일시
    mentor_id: str
    mentor_name: str | None         # 멘토 이름 (멘토가 지워졌으면 null)
    student_name: str               # 학생 이름
    student_email: str              # 학생 메일
    title: str                      # 메일 제목
    body: str                       # 메일 내용
    replied: bool                   # 멘토 답변 여부
    replied_at: KstDatetime | None     # 멘토 답변 일시 (첫 답장)
    reminded_at: KstDatetime | None    # 리마인드 보낸 시각


class InquiryPage(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[InquiryItem]


class ReplyItem(BaseModel):
    """멘토 답장 한 통의 처리 기록 (mail_replies)."""

    message_id: str
    inquiry_id: str | None
    from_email: str
    received_at: KstDatetime
    status: Literal["forwarded", "needs_review", "failed"]
    reason: str | None              # sender_mismatch(보낸 사람이 멘토 아님), empty_body(내용 없음) 등
    reply_text: str | None          # 학생에게 전달한 본문


class InquiryDetail(BaseModel):
    item: InquiryItem
    replies: list[ReplyItem]


class ReviewItem(ReplyItem):
    followup: bool = False          # true = 첫 왕복(멘토 첫 답장) 이후 대화에서 생긴 것. 본문(reply_text)은 저장 안 됨
    inquiry_title: str | None
    student_name: str | None
    mentor_id: str | None


class ReviewPage(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[ReviewItem]


# ---------------------------------------------------------------- 멘토
class AdminMentor(BaseModel):
    """관리자에게만 보이는 멘토 정보 (메일 주소 포함)."""

    id: str
    name: str
    exit_year: int | None
    career_paths: list[str]
    path_summary: str
    summary: str
    tags: list[str]
    topics: list[str]
    consent: bool                   # 멘토 참여 동의 (false 면 어디에도 안 보임)
    available: bool                 # 지금 문의를 받는지
    email: str | None


class MentorCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    id: str = Field(..., pattern=r"^[a-z0-9][a-z0-9-]{0,49}$", description="예: mt-11. 정하면 바꾸지 않는다")
    name: str = Field(..., min_length=1, max_length=50)
    exit_year: int | None = Field(default=None, ge=1990, le=2100)
    career_paths: list[str] = Field(default_factory=list, max_length=20)
    path_summary: str = Field(default="", max_length=300)
    summary: str = Field(default="", max_length=1000)
    tags: list[str] = Field(default_factory=list, max_length=30)
    topics: list[str] = Field(default_factory=list, max_length=30)
    consent: bool = False
    available: bool = False
    email: str | None = Field(default=None, max_length=254, pattern=EMAIL_PATTERN)

    @field_validator("email", mode="before")
    @classmethod
    def _blank_email_is_none(cls, value):
        return None if isinstance(value, str) and not value.strip() else value


class MentorUpdate(BaseModel):
    """보낸 칸만 바꾼다. id 는 바꿀 수 없다. email 에 빈 글자나 null 을 보내면 메일 주소를 지운다."""

    model_config = ConfigDict(str_strip_whitespace=True)

    name: str | None = Field(default=None, min_length=1, max_length=50)
    exit_year: int | None = Field(default=None, ge=1990, le=2100)
    career_paths: list[str] | None = Field(default=None, max_length=20)
    path_summary: str | None = Field(default=None, max_length=300)
    summary: str | None = Field(default=None, max_length=1000)
    tags: list[str] | None = Field(default=None, max_length=30)
    topics: list[str] | None = Field(default=None, max_length=30)
    consent: bool | None = None
    available: bool | None = None
    email: str | None = Field(default=None, max_length=254, pattern=EMAIL_PATTERN)

    @field_validator("email", mode="before")
    @classmethod
    def _blank_email_is_none(cls, value):
        return None if isinstance(value, str) and not value.strip() else value


# ---------------------------------------------------------------- 설정
class SettingItem(BaseModel):
    key: str
    value: str
    description: str


class SettingsUpdate(BaseModel):
    values: dict[str, str] = Field(..., min_length=1, max_length=50)
