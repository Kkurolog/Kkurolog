"""모든 테스트에 공통으로 적용되는 설정."""

import pytest

from app.rate_limit import ask_limiter


@pytest.fixture(autouse=True)
def reset_rate_limit():
    """테스트마다 호출 횟수 카운터를 0으로 되돌린다. (앞 테스트의 호출이 뒤 테스트를 막지 않게)"""
    ask_limiter.reset()
    yield
    ask_limiter.reset()
