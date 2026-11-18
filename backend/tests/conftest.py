"""모든 테스트에 공통으로 적용되는 설정."""

import pytest

from app.admin.auth import login_limiter
from app.rate_limit import ask_limiter


@pytest.fixture(autouse=True)
def reset_rate_limit():
    """테스트마다 호출 횟수 카운터를 0으로 되돌린다. (앞 테스트의 호출이 뒤 테스트를 막지 않게)"""
    ask_limiter.reset()
    login_limiter.reset()
    yield
    ask_limiter.reset()
    login_limiter.reset()


@pytest.fixture(autouse=True)
def mail_disabled_by_default(monkeypatch):
    """
    내 .env 에 MAIL_ENABLED=true 와 실제 키가 있어도, 테스트는 기본으로 demo 모드(JSON 멘토, 메일 안 보냄)로 돈다.
    진짜 Supabase·메일 웹앱은 절대 부르지 않는다. 메일 기능 테스트(test_mail_*.py)는 가짜를 끼워서 따로 켠다.
    """
    for name in ("MAIL_ENABLED", "SUPABASE_URL", "SUPABASE_KEY", "APPS_SCRIPT_URL", "APPS_SCRIPT_API_KEY",
                 "MAIL_WEBHOOK_SECRET", "ADMIN_PASSWORD"):
        monkeypatch.delenv(name, raising=False)
