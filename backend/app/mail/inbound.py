"""
멘토 답장 처리 (POST /internal/mail/inbound, Apps Script 가 5분마다 후보 메일을 넘김).

메일마다
1. 이미 처리한 메일(mail_replies.message_id)이면 → 이전 결과 그대로 (다시 전달하지 않음)
2. 문의번호 찾기 → 없거나 없는 문의면 ignored
3. 보낸 사람 = 그 문의 멘토의 메일인지 → 아니면 needs_review (기록)
4. 인용문·안내 문구 지우기 → 비면 needs_review (기록)
5. 학생에게 전달 (sendMail, Reply-To 없음) → 실패하면 retry (기록 안 함 = 다음 차례에 다시)
6. mail_replies 에 forwarded 기록, inquiries.replied/replied_at (첫 답장만)
"""

from __future__ import annotations

import logging

from app.mail import apps_script, store as store_module
from app.mail.apps_script import MailSendError
from app.mail.mail_settings import load_settings
from app.mail.models import InboundMessage, InboundResult
from app.mail.reply_parser import extract_reply_text, find_inquiry_id
from app.mail.store import StoreError
from app.mail.templates import student_forward_mail

logger = logging.getLogger("uvicorn.error")

# 예전에 기록한 상태 → Apps Script 에 돌려줄 결과
_PREVIOUS = {"forwarded": "forwarded", "needs_review": "needs_review", "failed": "needs_review"}


def process_inbound(messages: list[InboundMessage]) -> list[InboundResult]:
    if not messages:
        return []
    store = store_module.get_store()
    settings = load_settings(store)  # StoreError 는 라우터가 503 으로 바꿈 (Apps Script 가 다음에 다시 보냄)
    mentors = {m["id"]: m for m in store.list_mentors()}
    results = []
    for message in messages:
        try:
            result = _handle_one(store, settings, mentors, message)
        except StoreError as err:
            logger.error("답장 처리 실패(Supabase) message=%s: %s", message.message_id, err)
            result = "retry"
        results.append(InboundResult(message_id=message.message_id, result=result))
    return results


def _record(store, message: InboundMessage, inquiry_id: str, status: str, reason: str | None, reply_text: str | None):
    store.insert_reply({
        "message_id": message.message_id,
        "inquiry_id": inquiry_id,
        "from_email": message.from_address.strip().lower(),
        "received_at": message.received_at.isoformat(),
        "status": status,
        "reason": reason,
        "reply_text": reply_text,
    })


def _handle_one(store, settings: dict[str, str], mentors: dict[str, dict], message: InboundMessage) -> str:
    previous = store.get_reply(message.message_id)
    if previous:
        return _PREVIOUS.get(previous.get("status"), "needs_review")

    inquiry_id = find_inquiry_id(message.recipients, message.plain_body)
    if not inquiry_id:
        return "ignored"
    inquiry = store.get_inquiry(inquiry_id)
    if not inquiry:
        logger.info("답장 무시: 없는 문의번호 %s", inquiry_id)
        return "ignored"

    mentor = mentors.get(inquiry["mentor_id"])
    sender = message.from_address.strip().lower()
    if not mentor or (mentor.get("email") or "").strip().lower() != sender:
        logger.warning("확인필요: %s 답장을 보낸 사람이 등록된 멘토 메일과 다름", inquiry_id)
        _record(store, message, inquiry_id, "needs_review", "sender_mismatch", None)
        return "needs_review"

    reply_text = extract_reply_text(message.plain_body, settings)
    if not reply_text:
        logger.warning("확인필요: %s 답장에서 전달할 내용을 찾지 못함", inquiry_id)
        _record(store, message, inquiry_id, "needs_review", "empty_body", None)
        return "needs_review"

    mail = student_forward_mail(settings, inquiry["student_name"], inquiry["title"], mentor["name"], reply_text)
    try:
        apps_script.send_mail(
            to=inquiry["student_email"], from_name=settings["senderName"], subject=mail.subject,
            text_body=mail.text_body, html_body=mail.html_body,
        )
    except MailSendError as err:
        logger.warning("재시도 예정: %s 학생에게 전달 실패 (%s)", inquiry_id, err.code)
        return "retry"

    _record(store, message, inquiry_id, "forwarded", None, reply_text)
    store.mark_replied(inquiry_id, message.received_at)
    logger.info("답장 전달 완료: %s", inquiry_id)
    return "forwarded"
