"""
학생 → 꾸로록 → 멘토 로 첫 연락을 전달하는 곳.

지금은 **실제 메일을 보내지 않는다.** 서버 로그에만 남기고 "전달 완료"라고 답한다.
나중에 실제 이메일 발송(예: Resend 무료 플랜)을 붙일 때는 `deliver_contact_request` 안쪽만 바꾸면 된다.
(main.py, schemas.py, 프론트는 그대로 둔다)

개인정보 주의:
  - 멘토 이메일은 이 서버 안에서만 쓰고, 응답에도 로그에도 남기지 않는다.
  - 학생 답장 이메일은 로그에 가려서(ab***@example.com) 남긴다. 재학생 상당수가 미성년자다.
"""

import logging

from app.schemas import ContactRequest, Mentor

# uvicorn 이 화면에 출력해 주는 로거를 같이 쓴다 (따로 설정하지 않아도 터미널에 보인다)
logger = logging.getLogger("uvicorn.error")


def _mask_email(email: str) -> str:
    """로그용으로 이메일 앞부분을 가린다. 예: abcdef@example.com → ab***@example.com"""
    local, _, domain = email.partition("@")
    return f"{local[:2]}***@{domain}"


def deliver_contact_request(request: ContactRequest, mentor: Mentor) -> None:
    """연락 요청을 멘토에게 전달한다. (지금은 로그만 남김)"""

    # TODO(실제 이메일 발송): 여기서 Resend 같은 서비스로 메일을 보낸다.
    #   - 받는 사람: services.mentors.get_mentor_email(mentor.id) (학생에게는 절대 보여주지 않는다)
    #   - 답장 주소(reply-to): request.reply_email → 멘토가 답장하면 학생에게 바로 간다
    #   - 제목/본문: request.subject, request.sender_name, request.message
    #   - API 키는 .env 의 RESEND_API_KEY 같은 환경변수로 읽는다 (코드에 넣지 않는다)

    logger.info(
        "[demo] 연락 요청 (실제 메일은 보내지 않음) mentor=%s from=%s reply=%s subject=%r message_len=%d",
        mentor.id,
        request.sender_name,
        _mask_email(request.reply_email),
        request.subject,
        len(request.message),
    )
