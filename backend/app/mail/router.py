"""
Apps Script → 백엔드 내부 API. 학생 화면에서 부르는 API 가 아니다 (/docs 목록에도 안 보이게 함).

- 헤더 X-Kkurolog-Mail-Secret 이 환경변수 MAIL_WEBHOOK_SECRET 과 같아야 한다 (다르면 401).
- MAIL_ENABLED 가 꺼져 있거나 설정이 빠졌으면 503 → Apps Script 는 처리하지 않은 것으로 보고 다음에 다시 보낸다.
- Supabase 가 응답하지 않아도 503 (같은 이유).
"""

from __future__ import annotations

import hmac
import logging

from fastapi import APIRouter, Depends, Header, HTTPException

from app.mail.config import MailNotConfigured, load_mail_config, mail_enabled
from app.mail.inbound import process_inbound
from app.mail.models import InboundRequest, InboundResponse, RemindersResponse
from app.mail.reminders import run_reminders
from app.mail.store import StoreError

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/internal/mail", include_in_schema=False)


def require_mail_secret(x_kkurolog_mail_secret: str | None = Header(default=None)) -> None:
    if not mail_enabled():
        raise HTTPException(status_code=503, detail="mail disabled")
    try:
        secret = load_mail_config().webhook_secret
    except MailNotConfigured as err:
        logger.error("내부 메일 API: %s", err)
        raise HTTPException(status_code=503, detail="mail not configured") from None
    if not x_kkurolog_mail_secret or not hmac.compare_digest(x_kkurolog_mail_secret.encode(), secret.encode()):
        raise HTTPException(status_code=401, detail="unauthorized")


@router.post("/inbound", response_model=InboundResponse, response_model_by_alias=True)
def inbound(body: InboundRequest, _: None = Depends(require_mail_secret)) -> InboundResponse:
    try:
        return InboundResponse(results=process_inbound(body.messages))
    except StoreError as err:
        logger.error("답장 처리 중단(Supabase): %s", err)
        raise HTTPException(status_code=503, detail="store unavailable") from None


@router.post("/reminders", response_model=RemindersResponse)
def reminders(_: None = Depends(require_mail_secret)) -> RemindersResponse:
    try:
        return RemindersResponse(summary=run_reminders())
    except StoreError as err:
        logger.error("리마인드 중단(Supabase): %s", err)
        raise HTTPException(status_code=503, detail="store unavailable") from None
