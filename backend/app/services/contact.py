"""
학생 → 꾸로록 → 멘토 로 첫 연락을 전달하는 곳.

- MAIL_ENABLED=true: app/mail/contact_flow.py 가 Supabase 에 기록하고 메일 웹앱(Apps Script)으로 보낸다.
  실패하면 HTTPException(429 너무 자주 / 503 발송 실패 / 502 연결 문제)을 던지고, 프론트는 detail 문구를 보여 준다.
- 꺼져 있으면(기본): **실제 메일을 보내지 않는다.** 서버 로그에만 남기고 "전달 완료"라고 답한다 (demo).
(main.py, schemas.py, 프론트는 그대로 둔다)

개인정보 주의:
  - 멘토 이메일은 이 서버 안에서만 쓰고, 응답에도 로그에도 남기지 않는다.
  - 학생 답장 이메일은 로그에 가려서(ab***@example.com) 남긴다. 재학생 상당수가 미성년자다.
"""

import logging

from app.mail.config import mail_enabled
from app.schemas import ContactRequest, Mentor

# uvicorn 이 화면에 출력해 주는 로거를 같이 쓴다 (따로 설정하지 않아도 터미널에 보인다)
logger = logging.getLogger("uvicorn.error")


def _mask_email(email: str) -> str:
    """로그용으로 이메일 앞부분을 가린다. 예: abcdef@example.com → ab***@example.com"""
    local, _, domain = email.partition("@")
    return f"{local[:2]}***@{domain}"


def deliver_contact_request(request: ContactRequest, mentor: Mentor) -> None:
    """연락 요청을 멘토에게 전달한다."""
    if mail_enabled():
        # 순환 import 를 피하려고 여기서 불러온다 (mentors.py 도 app.mail 을 쓴다)
        from app.mail.contact_flow import submit_inquiry
        from app.services.mentors import get_mentor_email

        submit_inquiry(request, mentor, get_mentor_email(mentor.id))
        return

    logger.info(
        "[demo] 연락 요청 (실제 메일은 보내지 않음) mentor=%s from=%s reply=%s subject=%r message_len=%d",
        mentor.id,
        request.sender_name,
        _mask_email(request.reply_email),
        request.subject,
        len(request.message),
    )
