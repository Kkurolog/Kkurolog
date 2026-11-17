"""
관리자 API (/admin/*). 로그인을 뺀 모든 주소에 로그인 표가 필요하다 (auth.require_admin).
형식: apps-script/docs/ADMIN_API.md

| 주소                              | 하는 일                                          |
| POST  /admin/login               | 공용 비밀번호 → 로그인 표 (12시간)                  |
| GET   /admin/inquiries           | 문의 목록 (최신순, replied 필터, 20건씩)           |
| GET   /admin/inquiries/{id}      | 문의 상세 + 멘토 답장 내역                          |
| GET   /admin/replies/review      | 확인필요 답장 목록 (학생에게 전달하지 못한 것)        |
| GET   /admin/mentors             | 멘토 전체 (메일 주소 포함)                          |
| POST  /admin/mentors             | 멘토 추가                                        |
| PATCH /admin/mentors/{id}        | 멘토 수정 (보낸 칸만)                              |
| GET   /admin/settings            | 메일 문구·숫자 설정                                |
| PATCH /admin/settings            | 설정 값 수정 (바로 다음 메일부터 적용)               |
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.admin.auth import (
    AdminNotConfigured,
    check_login_allowed,
    issue_token,
    password_matches,
    require_admin,
)
from app.admin.models import (
    AdminMentor,
    InquiryDetail,
    InquiryItem,
    InquiryPage,
    LoginRequest,
    LoginResponse,
    MentorCreate,
    MentorUpdate,
    ReplyItem,
    ReviewItem,
    ReviewPage,
    SettingItem,
    SettingsUpdate,
)
from app.mail import store as store_module
from app.mail.config import MailNotConfigured, mail_enabled
from app.mail.mail_settings import DEFAULTS, NUMBER_KEYS
from app.mail.reply_parser import INQUIRY_ID_PATTERN
from app.mail.store import StoreError

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/admin", tags=["admin"])

UNAVAILABLE = "데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
AVAILABLE_RULE = "연락 가능으로 두려면 참여 동의와 메일 주소가 모두 있어야 해요."
SETTING_VALUE_MAX = 1000


def _store():
    if not mail_enabled():
        raise HTTPException(status_code=503, detail="메일 기능(MAIL_ENABLED)이 꺼져 있어요.")
    try:
        return store_module.get_store()
    except MailNotConfigured as err:
        logger.error("관리자 API: %s", err)
        raise HTTPException(status_code=503, detail="메일 기능 설정이 빠져 있어요.") from None


def _store_error(err: StoreError) -> HTTPException:
    if err.code == "23514":  # check 규칙 위반 (mentors_available_needs_consent_and_email 등)
        return HTTPException(status_code=422, detail=AVAILABLE_RULE)
    if err.code == "23505":  # 같은 id 가 이미 있음
        return HTTPException(status_code=409, detail="같은 id의 멘토가 이미 있어요.")
    logger.error("관리자 API Supabase 오류: %s", err)
    return HTTPException(status_code=502, detail=UNAVAILABLE)


def _inquiry_item(row: dict) -> InquiryItem:
    mentor = row.get("mentors") or {}
    return InquiryItem(**{**row, "mentor_name": mentor.get("name")})


# ---------------------------------------------------------------- 로그인
@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, request: Request) -> LoginResponse:
    check_login_allowed(request)
    try:
        if not password_matches(body.password):
            raise HTTPException(status_code=401, detail="비밀번호가 맞지 않아요.")
        token, expires = issue_token()
    except AdminNotConfigured:
        raise HTTPException(status_code=503, detail="관리자 기능이 아직 설정되지 않았어요.") from None
    return LoginResponse(token=token, expires_at=datetime.fromtimestamp(expires, tz=timezone.utc))


# ---------------------------------------------------------------- 문의
@router.get("/inquiries", response_model=InquiryPage, dependencies=[Depends(require_admin)])
def inquiries(
    replied: bool | None = Query(default=None, description="true=답장 받음, false=답장 전, 생략=전체"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> InquiryPage:
    store = _store()
    try:
        rows, total = store.list_inquiries(replied, (page - 1) * page_size, page_size)
    except StoreError as err:
        raise _store_error(err) from None
    return InquiryPage(total=total, page=page, page_size=page_size, items=[_inquiry_item(r) for r in rows])


@router.get("/inquiries/{inquiry_id}", response_model=InquiryDetail, dependencies=[Depends(require_admin)])
def inquiry_detail(inquiry_id: str) -> InquiryDetail:
    inquiry_id = inquiry_id.strip().lower()
    if not re.fullmatch(INQUIRY_ID_PATTERN, inquiry_id):
        raise HTTPException(status_code=422, detail="문의번호 형식을 확인해 주세요. 예: q20261117-0001")
    store = _store()
    try:
        row = store.get_inquiry_with_mentor(inquiry_id)
        if not row:
            raise HTTPException(status_code=404, detail="문의를 찾을 수 없어요.")
        replies = store.list_replies(inquiry_id)
    except StoreError as err:
        raise _store_error(err) from None
    return InquiryDetail(item=_inquiry_item(row), replies=[ReplyItem(**r) for r in replies])


@router.get("/replies/review", response_model=ReviewPage, dependencies=[Depends(require_admin)])
def review_replies(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> ReviewPage:
    store = _store()
    try:
        rows, total = store.list_review_replies((page - 1) * page_size, page_size)
    except StoreError as err:
        raise _store_error(err) from None
    items = []
    for row in rows:
        inquiry = row.pop("inquiries", None) or {}
        items.append(ReviewItem(**row, inquiry_title=inquiry.get("title"), student_name=inquiry.get("student_name"),
                                mentor_id=inquiry.get("mentor_id")))
    return ReviewPage(total=total, page=page, page_size=page_size, items=items)


# ---------------------------------------------------------------- 멘토
@router.get("/mentors", response_model=list[AdminMentor], dependencies=[Depends(require_admin)])
def admin_mentors() -> list[AdminMentor]:
    store = _store()
    try:
        return [AdminMentor(**row) for row in store.list_mentors()]
    except StoreError as err:
        raise _store_error(err) from None


@router.post("/mentors", response_model=AdminMentor, status_code=201, dependencies=[Depends(require_admin)])
def create_mentor(body: MentorCreate) -> AdminMentor:
    store = _store()
    try:
        return AdminMentor(**store.insert_mentor(body.model_dump()))
    except StoreError as err:
        raise _store_error(err) from None


# 비워도(null) 되는 칸. 나머지 칸에 null 을 보내면 "안 바꿈"으로 본다
_NULLABLE_MENTOR_FIELDS = {"email", "exit_year"}


@router.patch("/mentors/{mentor_id}", response_model=AdminMentor, dependencies=[Depends(require_admin)])
def update_mentor(mentor_id: str, body: MentorUpdate) -> AdminMentor:
    values = {k: v for k, v in body.model_dump(exclude_unset=True).items()
              if v is not None or k in _NULLABLE_MENTOR_FIELDS}
    if not values:
        raise HTTPException(status_code=422, detail="바꿀 내용이 없어요.")
    store = _store()
    try:
        row = store.update_mentor(mentor_id, values)
    except StoreError as err:
        raise _store_error(err) from None
    if not row:
        raise HTTPException(status_code=404, detail="멘토를 찾을 수 없어요.")
    return AdminMentor(**row)


# ---------------------------------------------------------------- 설정
@router.get("/settings", response_model=list[SettingItem], dependencies=[Depends(require_admin)])
def settings() -> list[SettingItem]:
    store = _store()
    try:
        return [SettingItem(**row) for row in store.list_settings()]
    except StoreError as err:
        raise _store_error(err) from None


@router.patch("/settings", response_model=list[SettingItem], dependencies=[Depends(require_admin)])
def update_settings(body: SettingsUpdate) -> list[SettingItem]:
    unknown = sorted(set(body.values) - set(DEFAULTS))
    if unknown:
        raise HTTPException(status_code=422, detail=f"없는 설정 키예요: {', '.join(unknown)}")
    cleaned = {}
    for key, value in body.values.items():
        value = value.strip()
        if len(value) > SETTING_VALUE_MAX:
            raise HTTPException(status_code=422, detail=f"{key} 값은 {SETTING_VALUE_MAX}자까지 쓸 수 있어요.")
        if key in NUMBER_KEYS and not value.isdigit():
            raise HTTPException(status_code=422, detail=f"{key} 값은 0 이상의 정수로 적어 주세요.")
        cleaned[key] = value
    store = _store()
    try:
        store.upsert_settings(cleaned)
        return [SettingItem(**row) for row in store.list_settings()]
    except StoreError as err:
        raise _store_error(err) from None
