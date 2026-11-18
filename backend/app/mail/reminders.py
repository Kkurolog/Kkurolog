"""
리마인드 (POST /internal/mail/reminders, Apps Script 가 매일 10~11시에 부름).

대상: 답장 없음 + 리마인드 안 함 + 보낸 날짜(한국)로부터 reminderDays 일째가 됐거나 지남. 한 문의에 한 번만.
- reminderDays 가 0 이면 보내지 않는다.
- 멘토가 지금 비활성(available=false)이면 건너뛴다 (다시 활성화하면 다음 날 보낼 수 있음).
- 한 번에 최대 MAX_PER_RUN 통. 남은 것과 발송 한도가 모자란 것은 다음 날.
- 메일은 원래 문의 메일과 같고, 말머리만 리마인드용 + 맨 위 리마인드 문구. Reply-To 는 같은 문의번호
  → 멘토가 리마인드 메일에 답장해도 학생에게 그대로 전달된다.
"""

from __future__ import annotations

import logging
from datetime import timedelta

from app.mail import apps_script, store as store_module, timeutil
from app.mail.apps_script import MailSendError
from app.mail.mail_settings import load_settings, number
from app.mail.templates import mentor_inquiry_mail

logger = logging.getLogger("uvicorn.error")

MAX_PER_RUN = 30


def reminder_cutoff(now, days: int):
    """이 시각보다 먼저 보낸 문의가 대상. 예: days=10, 오늘 11/11 → 11/02 0시 (= 11/01 이전 날짜에 보낸 문의)."""
    return timeutil.kst_day_start(now) - timedelta(days=days - 1)


def run_reminders() -> str:
    store = store_module.get_store()
    settings = load_settings(store)
    days = number(settings, "reminderDays")
    if days <= 0:
        return "reminderDays 가 0 이라 리마인드를 보내지 않음"

    now = timeutil.now()
    due = store.due_reminders(reminder_cutoff(now, days), MAX_PER_RUN)
    if not due:
        return "보낼 리마인드 없음"
    mentors = {m["id"]: m for m in store.list_mentors()}
    try:
        quota = apps_script.get_quota()
    except MailSendError as err:
        logger.error("리마인드 중단: 메일 웹앱 getQuota 실패 (%s)", err.code)
        return f"메일 웹앱 연결 실패로 중단 (대상 {len(due)}건은 다음에)"

    sent = skipped = failed = later = 0
    for inquiry in due:
        mentor = mentors.get(inquiry["mentor_id"])
        if not mentor or not mentor.get("available") or not mentor.get("email"):
            skipped += 1
            continue
        if quota < 1:
            later += 1
            continue
        mail = mentor_inquiry_mail(
            settings, mentor["name"], inquiry["id"], inquiry["student_name"], inquiry["title"], inquiry["body"],
            reminder=True,
        )
        try:
            apps_script.send_mail(
                to=mentor["email"], from_name=settings["senderName"], subject=mail.subject,
                text_body=mail.text_body, html_body=mail.html_body, reply_to_inquiry_id=inquiry["id"],
            )
        except MailSendError as err:
            logger.warning("리마인드 실패(다음에 다시) %s: %s", inquiry["id"], err.code)
            failed += 1
            if err.code == "QUOTA_EXCEEDED":
                quota = 0
            continue
        quota -= 1
        store.mark_reminded(inquiry["id"], now)
        sent += 1
    return f"리마인드 {sent}건 보냄, 비활성 멘토 {skipped}건 건너뜀, 실패 {failed}건, 한도 부족으로 다음에 {later}건"
