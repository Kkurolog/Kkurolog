"""
바꿀 수 있는 설정값을 한 곳에 모아둔 파일.

숫자를 바꾸고 싶으면 이 파일의 기본값을 고치거나, .env 에 같은 이름의 환경변수를 넣으면 된다.
(.env 값이 있으면 그 값을 쓴다. 예: RATE_LIMIT_CLIENT_PER_DAY=50)

⚠️ 아래 수치는 docs/proposals/ask-plan.md 의 '제안' 값이다. 팀 논의 후 확정한다.
"""

import os

from dotenv import load_dotenv

load_dotenv()


def _int_env(name: str, default: int) -> int:
    """환경변수를 정수로 읽는다. 없거나 숫자가 아니면 기본값."""
    try:
        return int(os.getenv(name, default))
    except ValueError:
        return default


def _bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes"}


# ---------------------------------------------------------------------------
# /ask 호출 횟수 제한 (rate limit)
# ---------------------------------------------------------------------------
# 학교 와이파이는 학생 모두가 같은 IP를 쓰므로, 학생 한 명 기준은 IP가 아니라
# 브라우저별 익명 ID(X-Client-Id 헤더)로 센다. IP 기준은 봇 방지용으로 느슨하게 둔다.

# 브라우저(익명 ID) 한 개당
RATE_LIMIT_CLIENT_PER_MINUTE = _int_env("RATE_LIMIT_CLIENT_PER_MINUTE", 5)
RATE_LIMIT_CLIENT_PER_DAY = _int_env("RATE_LIMIT_CLIENT_PER_DAY", 30)

# IP 한 개당 (봇 방지용)
RATE_LIMIT_IP_PER_MINUTE = _int_env("RATE_LIMIT_IP_PER_MINUTE", 60)
RATE_LIMIT_IP_PER_DAY = _int_env("RATE_LIMIT_IP_PER_DAY", 1000)

# 서비스 전체 하루 상한 (API 비용 안전장치)
RATE_LIMIT_GLOBAL_PER_DAY = _int_env("RATE_LIMIT_GLOBAL_PER_DAY", 2000)

# true 면 X-Forwarded-For 헤더에서 학생 IP를 읽는다.
# Render 같은 배포 환경은 프록시를 거치므로 true 로 둬야 한다. (로컬 개발은 false)
TRUST_PROXY_HEADERS = _bool_env("TRUST_PROXY_HEADERS", False)
