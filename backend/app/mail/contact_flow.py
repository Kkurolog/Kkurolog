"""
학생 문의 보내기 (POST /contact-requests 에서 MAIL_ENABLED=true 일 때).

순서
1. 설정 읽기 (Supabase mail_settings)
2. 같은 학생 메일 횟수 제한: 최근 rateLimitMinutes 분 안에 rateLimitPerWindow 건, 오늘(한국 자정 기준) rateLimitPerDay 건
3. 오늘 남은 Gmail 발송 수 확인 (멘토 + 학생 사본 = 2통)
4. 문의번호 만들기 (DB 함수) → inquiries 에 저장
5. 멘토에게 메일 (Reply-To = 중계계정+문의번호). 실패하면 방금 저장한 문의를 지운다
6. 학생에게 "보낸 문의 사본" (실패해도 문의는 성공. 로그만)

실패하면 HTTPException 을 던진다. 프론트 ContactModal 은 detail 문구를 그대로 학생에게 보여 준다.
"""

from __future__ import annotations

import logging
from datetime import timedelta

from fastapi import HTTPException

from app.mail import apps_script, store as store_module, timeutil
from app.mail.apps_script import MailSendError
from app.mail.config import MailNotConfigured, load_mail_config
from app.mail.mail_settings import load_settings, number
from app.mail.store import StoreError
from app.mail.templates import mentor_inquiry_mail, student_copy_mail
from app.schemas import ContactRequest, Mentor

logger = logging.getLogger("uvicorn.error")

UNAVAILABLE_MESSAGE = "지금은 문의를 보낼 수 없어요. 잠시 후 다시 시도해 주세요."
SEND_FAILED_MESSAGE = "메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요."


def mask_email(email: str) -> str:
    """로그용. abcdef@example.com → ab***@example.com"""
    local, _, domain = email.partition("@")
    return f"{local[:2]}***@{domain}"


def check_rate_limit(times: list, now, settings: dict[str, str]) -> None:
    """같은 학생 메일로 너무 자주 보냈으면 429. times 는 최근 문의의 보낸 일시 글자 목록."""
    minutes = number(settings, "rateLimitMinutes")
    per_window = number(settings, "rateLimitPerWindow")
    per_day = number(settings, "rateLimitPerDay")
    sent = [timeutil.parse_ts(t) for t in times]
    today_start = timeutil.kst_day_start(now)
    if per_day > 0 and sum(1 for t in sent if t >= today_start) >= per_day:
        raise HTTPException(
            status_code=429, detail=f"같은 메일 주소로는 하루에 {per_day}건까지 보낼 수 있어요. 내일 다시 시도해 주세요."
        )
    if minutes > 0 and per_window > 0:
        window_start = now - timedelta(minutes=minutes)
        if sum(1 for t in sent if t > window_start) >= per_window:
            raise HTTPException(
                status_code=429,
                detail=f"현재 메일 발송량이 많아 전송이 잠시 제한되었어요. {minutes}분 후 다시 시도해 주세요.",
            )


def submit_inquiry(request: ContactRequest, mentor: Mentor, mentor_email: str | None) -> str:
    """문의를 저장하고 멘토에게 보낸다. 문의번호를 돌려준다."""
    try:
        load_mail_config()  # MAIL_ENABLED=true 인데 환경변수가 빠졌으면 여기서 멈춘다
    except MailNotConfigured as err:
        logger.error("문의 실패: %s", err)
        raise HTTPException(status_code=503, detail=UNAVAILABLE_MESSAGE) from None
    if not mentor_email:
        logger.error("문의 실패: 멘토 %s 의 메일 주소가 없음", mentor.id)
        raise HTTPException(status_code=409, detail="이 선배는 지금 연락을 받지 않아요.")
    student_email = request.reply_email.strip().lower()
    try:
        store = store_module.get_store()
        settings = load_settings(store)
        now = timeutil.now()
        since = min(timeutil.kst_day_start(now), now - timedelta(minutes=max(number(settings, "rateLimitMinutes"), 0)))
        check_rate_limit(store.recent_inquiry_times(student_email, since), now, settings)
    except StoreError as err:
        logger.error("문의 실패(Supabase): %s", err)
        raise HTTPException(status_code=502, detail=UNAVAILABLE_MESSAGE) from None

    try:
        if apps_script.get_quota() < 2:
            logger.warning("문의 실패: 오늘 Gmail 발송 한도 부족")
            raise HTTPException(status_code=503, detail=SEND_FAILED_MESSAGE)
    except MailSendError as err:
        logger.error("문의 실패(메일 웹앱 getQuota): %s", err.code)
        raise HTTPException(status_code=502, detail=UNAVAILABLE_MESSAGE) from None

    try:
        inquiry_id = store.next_inquiry_id()
        saved = store.insert_inquiry({
            "id": inquiry_id,
            "mentor_id": mentor.id,
            "student_name": request.sender_name,
            "student_email": student_email,
            "title": request.subject,
            "body": request.message,
        })
    except StoreError as err:
        logger.error("문의 저장 실패(Supabase): %s", err)
        raise HTTPException(status_code=502, detail=UNAVAILABLE_MESSAGE) from None

    mail = mentor_inquiry_mail(settings, mentor.name, inquiry_id, request.sender_name, request.subject, request.message)
    try:
        apps_script.send_mail(
            to=mentor_email, from_name=settings["senderName"], subject=mail.subject,
            text_body=mail.text_body, html_body=mail.html_body, reply_to_inquiry_id=inquiry_id,
        )
    except MailSendError as err:
        logger.error("문의 %s 멘토 메일 실패(%s) → 저장한 문의를 지움", inquiry_id, err.code)
        try:
            store.delete_inquiry(inquiry_id)
        except StoreError as del_err:
            logger.error("문의 %s 지우기 실패: %s", inquiry_id, del_err)
        status = 503 if err.code in {"QUOTA_EXCEEDED", "SEND_FAILED"} else 502
        raise HTTPException(status_code=status, detail=SEND_FAILED_MESSAGE if status == 503 else UNAVAILABLE_MESSAGE) from None

    try:
        sent_at = timeutil.parse_ts(saved["created_at"]) if saved.get("created_at") else now
        copy = student_copy_mail(settings, mentor.name, request.sender_name, request.subject, request.message, sent_at)
        apps_script.send_mail(
            to=student_email, from_name=settings["senderName"], subject=copy.subject,
            text_body=copy.text_body, html_body=copy.html_body,
        )
    except MailSendError as err:
        logger.warning("문의 %s 학생 사본 실패(무시): %s", inquiry_id, err.code)

    logger.info("문의 전달 완료 inquiry=%s mentor=%s reply=%s", inquiry_id, mentor.id, mask_email(student_email))
    return inquiry_id
