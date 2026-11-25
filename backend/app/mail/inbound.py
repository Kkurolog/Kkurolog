"""
멘토·학생 답장 처리 (POST /internal/mail/inbound, Apps Script 가 5분마다 후보 메일을 넘김).

메일마다
1. 이미 처리한 메일(mail_replies.message_id)이면 → 이전 결과 그대로 (다시 전달하지 않음)
2. 문의번호 찾기 → 없거나 없는 문의면 ignored
3. 보낸 사람으로 방향 정하기
   - 그 문의 멘토의 메일 → 학생에게 전달 (멘토 답장)
   - 그 문의 학생의 메일 → 멘토에게 전달 (학생 추가 질문)
   - 둘 다 아니면 → needs_review (sender_mismatch)
   (멘토와 학생 주소가 같으면 멘토로 본다. 팀 테스트에서 같은 주소를 쓸 때)
4. 인용문·안내 문구 지우기 → 비면 needs_review (empty_body)
5. 상대에게 전달 (sendMail, Reply-To = 중계계정+문의번호 → 받은 사람도 '답장'으로 이어서 보낼 수 있음)
   → 실패하면 retry (기록 안 함 = 다음 차례에 다시)
6. mail_replies 에 기록, inquiries.replied/replied_at (멘토 첫 답장만)

관리자 문의 상세는 첫 왕복(학생 문의 + 멘토 첫 답장)만 보여 준다.
그 뒤 메일(멘토 첫 답장 이후 들어온 모든 답장)은 followup=true 로 기록하고 본문(reply_text)은 저장하지 않는다.
기록은 같은 메일을 두 번 전달하지 않기 위한 것이다.
단, 전달하지 못한 메일(needs_review)은 첫 왕복 이후라도 관리자 확인필요 목록에 나온다 (본문 없이 이유만).
"""

from __future__ import annotations

import logging

from app.mail import apps_script, store as store_module
from app.mail.apps_script import MailSendError
from app.mail.mail_settings import load_settings
from app.mail.models import InboundMessage, InboundResult
from app.mail.reply_parser import extract_reply_text, find_inquiry_id
from app.mail.store import StoreError
from app.mail.templates import mentor_followup_mail, student_forward_mail

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


def _record(
    store, message: InboundMessage, inquiry_id: str, status: str, reason: str | None, reply_text: str | None,
    *, followup: bool,
):
    store.insert_reply({
        "message_id": message.message_id,
        "inquiry_id": inquiry_id,
        "from_email": message.from_address.strip().lower(),
        "received_at": message.received_at.isoformat(),
        "status": status,
        "reason": reason,
        "reply_text": None if followup else reply_text,  # 첫 왕복 이후 메일은 내용을 저장하지 않음
        "followup": followup,
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

    followup = bool(inquiry.get("replied"))  # 멘토가 이미 한 번 답했으면 그 뒤 메일은 모두 첫 왕복 이후
    mentor = mentors.get(inquiry["mentor_id"])
    mentor_email = ((mentor or {}).get("email") or "").strip().lower()
    student_email = (inquiry.get("student_email") or "").strip().lower()
    sender = message.from_address.strip().lower()

    if mentor_email and sender == mentor_email:
        return _from_mentor(store, settings, mentor, inquiry, message, followup)
    if student_email and sender == student_email:
        return _from_student(store, settings, mentor, inquiry, message)
    logger.warning("확인필요: %s 답장을 보낸 사람이 그 문의의 멘토·학생 메일과 다름", inquiry["id"])
    _record(store, message, inquiry["id"], "needs_review", "sender_mismatch", None, followup=followup)
    return "needs_review"


def _from_mentor(store, settings, mentor: dict, inquiry: dict, message: InboundMessage, followup: bool) -> str:
    """멘토 답장 → 학생에게 전달. 첫 답장이면 replied 표시."""
    inquiry_id = inquiry["id"]
    reply_text = extract_reply_text(message.plain_body, settings)
    if not reply_text:
        logger.warning("확인필요: %s 멘토 답장에서 전달할 내용을 찾지 못함", inquiry_id)
        _record(store, message, inquiry_id, "needs_review", "empty_body", None, followup=followup)
        return "needs_review"

    mail = student_forward_mail(
        settings, inquiry_id, inquiry["student_name"], inquiry["title"], mentor["name"], reply_text
    )
    try:
        apps_script.send_mail(
            to=inquiry["student_email"], from_name=settings["senderName"], subject=mail.subject,
            text_body=mail.text_body, html_body=mail.html_body, reply_to_inquiry_id=inquiry_id,
        )
    except MailSendError as err:
        logger.warning("재시도 예정: %s 학생에게 전달 실패 (%s)", inquiry_id, err.code)
        return "retry"

    _record(store, message, inquiry_id, "forwarded", None, reply_text, followup=followup)
    store.mark_replied(inquiry_id, message.received_at)
    logger.info("멘토 답장 전달 완료: %s%s", inquiry_id, " (첫 왕복 이후)" if followup else "")
    return "forwarded"


def _from_student(store, settings, mentor: dict | None, inquiry: dict, message: InboundMessage) -> str:
    """학생 답장(추가 질문) → 멘토에게 전달. 항상 첫 왕복 이후 메일로 기록."""
    inquiry_id = inquiry["id"]
    if not mentor or not (mentor.get("email") or "").strip():
        logger.warning("확인필요: %s 학생 답장을 전달할 멘토 메일이 없음", inquiry_id)
        _record(store, message, inquiry_id, "needs_review", "no_mentor_email", None, followup=True)
        return "needs_review"
    text = extract_reply_text(message.plain_body, settings)
    if not text:
        logger.warning("확인필요: %s 학생 답장에서 전달할 내용을 찾지 못함", inquiry_id)
        _record(store, message, inquiry_id, "needs_review", "empty_body", None, followup=True)
        return "needs_review"

    mail = mentor_followup_mail(
        settings, inquiry_id, mentor["name"], inquiry["student_name"], inquiry["title"], text
    )
    try:
        apps_script.send_mail(
            to=mentor["email"].strip(), from_name=settings["senderName"], subject=mail.subject,
            text_body=mail.text_body, html_body=mail.html_body, reply_to_inquiry_id=inquiry_id,
        )
    except MailSendError as err:
        logger.warning("재시도 예정: %s 멘토에게 학생 답장 전달 실패 (%s)", inquiry_id, err.code)
        return "retry"

    _record(store, message, inquiry_id, "forwarded", None, None, followup=True)
    logger.info("학생 답장 전달 완료: %s", inquiry_id)
    return "forwarded"
