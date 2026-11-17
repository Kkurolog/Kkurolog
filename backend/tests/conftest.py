"""모든 테스트에 공통으로 적용되는 설정."""

import pytest

from app import config
from app.rate_limit import ask_limiter
from app.services import answer as answer_service


@pytest.fixture(autouse=True)
def rag_off_by_default(monkeypatch):
    """
    테스트는 항상 demo 답변으로 시작한다. 내 .env 에 RAG_ENABLED=true 가 있어도
    pytest 가 실제 OpenAI·Claude 를 부르지 않게 한다 (느려지고 비용이 나간다).
    RAG 를 확인하는 테스트는 가짜 파이프라인을 끼우면서 직접 켠다 (test_ask.py 의 use_fake_pipeline).
    """
    monkeypatch.setattr(config, "RAG_ENABLED", False)
    monkeypatch.setattr(answer_service, "_pipeline", None)


@pytest.fixture(autouse=True)
def reset_rate_limit():
    """테스트마다 호출 횟수 카운터를 0으로 되돌린다. (앞 테스트의 호출이 뒤 테스트를 막지 않게)"""
    ask_limiter.reset()
    yield
    ask_limiter.reset()
