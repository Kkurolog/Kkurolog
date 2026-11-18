"""
Apps Script → 백엔드 내부 API 의 요청·응답 형식 (apps-script/docs/API.md v1.0 2장).
학생 화면(프론트)과 주고받는 형식이 아니라서 app/schemas.py · frontend/src/lib/api.ts 와는 상관없다.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class InboundMessage(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    message_id: str = Field(..., alias="messageId", min_length=1, max_length=200)
    received_at: datetime = Field(..., alias="receivedAt")
    from_address: str = Field(..., alias="from", max_length=320)
    recipients: list[str] = Field(default_factory=list, max_length=50)
    subject: str = Field(default="", max_length=1000)
    plain_body: str = Field(default="", alias="plainBody", max_length=30000)


class InboundRequest(BaseModel):
    messages: list[InboundMessage] = Field(default_factory=list, max_length=20)


InboundResultValue = Literal["forwarded", "needs_review", "ignored", "retry"]


class InboundResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    message_id: str = Field(..., serialization_alias="messageId")
    result: InboundResultValue


class InboundResponse(BaseModel):
    results: list[InboundResult]


class RemindersResponse(BaseModel):
    summary: str
