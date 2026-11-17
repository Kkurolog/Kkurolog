"""
메일 웹앱(Apps Script) 호출: sendMail, getQuota. 형식은 apps-script/docs/API.md v1.0 1장.

- POST, Content-Type: text/plain, 본문은 JSON 글자 (apiKey + action + 값)
- 웹앱은 한 번 리다이렉트(302)한 뒤 답한다 → follow_redirects=True
- HTTP 상태는 항상 200 → 성공 여부는 응답의 ok 로 판단
- 웹앱 주소·키는 로그에 남기지 않는다 (httpx 오류 문구에는 주소가 들어 있어 종류만 남김)
"""

from __future__ import annotations

import json

import httpx

from app.mail.config import load_mail_config

TIMEOUT_SECONDS = 30  # 메일 발송은 몇 초 걸린다


class MailSendError(Exception):
    """웹앱 호출 실패. code 는 웹앱 에러 코드 또는 UNREACHABLE(연결 실패·시간 초과·이상한 응답)."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def _call(action: str, values: dict) -> dict:
    config = load_mail_config()
    payload = {"apiKey": config.apps_script_api_key, "action": action, **values}
    try:
        response = httpx.post(
            config.apps_script_url,
            content=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "text/plain; charset=utf-8"},
            follow_redirects=True,
            timeout=TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        result = response.json()
    except (httpx.HTTPError, ValueError):
        raise MailSendError("UNREACHABLE") from None
    if not isinstance(result, dict):
        raise MailSendError("UNREACHABLE")
    if result.get("ok") is True:
        return result.get("data") or {}
    error = result.get("error") or {}
    raise MailSendError(str(error.get("code") or "INTERNAL_ERROR"))


def send_mail(
    *,
    to: str,
    from_name: str,
    subject: str,
    text_body: str,
    html_body: str | None = None,
    reply_to_inquiry_id: str | None = None,
) -> None:
    """메일 한 통. reply_to_inquiry_id 를 주면 웹앱이 Reply-To 를 중계계정+문의번호 로 만든다 (멘토에게 보낼 때)."""
    values: dict = {"to": to, "fromName": from_name, "subject": subject, "textBody": text_body}
    if html_body:
        values["htmlBody"] = html_body
    if reply_to_inquiry_id:
        values["replyToInquiryId"] = reply_to_inquiry_id
    _call("sendMail", values)


def get_quota() -> int:
    """오늘 남은 Gmail 발송 수."""
    data = _call("getQuota", {})
    try:
        return int(data.get("remaining"))
    except (TypeError, ValueError):
        raise MailSendError("UNREACHABLE") from None
