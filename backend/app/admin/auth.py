"""
관리자 로그인 (공용 비밀번호 + 로그인 표).

- POST /admin/login 에 비밀번호를 보내면, 맞을 때 12시간 쓸 수 있는 로그인 표(token)를 준다.
- 관리자 페이지는 이후 요청마다 헤더 Authorization: Bearer <token> 을 붙인다.
- 표는 서버만 아는 열쇠로 서명한 글자다 (DB 에 저장하지 않음). 열쇠는 ADMIN_PASSWORD 에서 만든다.
  → ADMIN_PASSWORD 를 바꾸면 이전에 받은 표는 모두 쓸 수 없게 된다 (유출이 의심되면 비밀번호만 바꾸면 됨).
- 비밀번호 맞히기 공격을 막으려고, 같은 IP 에서 10분에 10번까지만 로그인을 시도할 수 있다 (서버 메모리 기준).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import threading
import time
from collections import deque

from fastapi import Header, HTTPException, Request

from app.rate_limit import client_ip

TOKEN_TTL_SECONDS = 12 * 60 * 60
LOGIN_WINDOW_SECONDS = 10 * 60
LOGIN_MAX_ATTEMPTS = 10
MIN_PASSWORD_LENGTH = 12


class AdminNotConfigured(Exception):
    pass


def _password() -> str:
    password = os.getenv("ADMIN_PASSWORD", "")
    if len(password) < MIN_PASSWORD_LENGTH:
        # 비어 있거나 너무 짧으면 관리자 기능을 아예 막는다 (약한 비밀번호로 열리는 일이 없게)
        raise AdminNotConfigured(f"ADMIN_PASSWORD 가 없거나 {MIN_PASSWORD_LENGTH}자보다 짧음")
    return password


def _signing_key() -> bytes:
    return hashlib.sha256(b"kkurolog-admin-token:" + _password().encode()).digest()


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def issue_token(now: float | None = None) -> tuple[str, int]:
    """로그인 표와 만료 시각(유닉스 초)."""
    expires = int((now or time.time()) + TOKEN_TTL_SECONDS)
    payload = _b64(json.dumps({"exp": expires}).encode())
    signature = _b64(hmac.new(_signing_key(), payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{signature}", expires


def verify_token(token: str, now: float | None = None) -> bool:
    try:
        payload, signature = token.split(".", 1)
        expected = _b64(hmac.new(_signing_key(), payload.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            return False
        expires = int(json.loads(_unb64(payload))["exp"])
    except (ValueError, KeyError, TypeError):
        return False
    return (now or time.time()) < expires


def password_matches(candidate: str) -> bool:
    return hmac.compare_digest(candidate.encode(), _password().encode())


class LoginLimiter:
    """IP 별 로그인 시도 횟수 (최근 10분)."""

    def __init__(self) -> None:
        self._attempts: dict[str, deque] = {}
        self._lock = threading.Lock()

    def hit(self, ip: str, now: float | None = None) -> bool:
        """이번 시도를 세고, 허용되면 True."""
        now = now or time.time()
        with self._lock:
            attempts = self._attempts.setdefault(ip, deque())
            while attempts and now - attempts[0] > LOGIN_WINDOW_SECONDS:
                attempts.popleft()
            if len(attempts) >= LOGIN_MAX_ATTEMPTS:
                return False
            attempts.append(now)
            return True

    def reset(self) -> None:
        with self._lock:
            self._attempts.clear()


login_limiter = LoginLimiter()


def check_login_allowed(request: Request) -> None:
    if not login_limiter.hit(client_ip(request)):
        raise HTTPException(status_code=429, detail="로그인 시도가 너무 많아요. 10분 후 다시 시도해 주세요.")


def require_admin(authorization: str | None = Header(default=None)) -> None:
    """관리자 API 에 붙이는 확인. 표가 없거나 틀리거나 만료되면 401."""
    try:
        _password()
    except AdminNotConfigured:
        raise HTTPException(status_code=503, detail="관리자 기능이 아직 설정되지 않았어요.") from None
    token = authorization[7:].strip() if authorization and authorization.lower().startswith("bearer ") else ""
    if not token or not verify_token(token):
        raise HTTPException(status_code=401, detail="다시 로그인해 주세요.")
