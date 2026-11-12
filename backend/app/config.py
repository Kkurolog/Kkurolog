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

# 분당 상한을 0 으로 두면 '분당 제한 없음'이다.

# 브라우저(익명 ID) 한 개당
# 분당 제한은 두지 않는다 (0): 학생이 연달아 질문해도 막지 않고, 하루 상한으로만 관리한다
RATE_LIMIT_CLIENT_PER_MINUTE = _int_env("RATE_LIMIT_CLIENT_PER_MINUTE", 0)
RATE_LIMIT_CLIENT_PER_DAY = _int_env("RATE_LIMIT_CLIENT_PER_DAY", 30)

# IP 한 개당
# 익명 ID 는 브라우저가 마음대로 바꿔 보낼 수 있어서, 한 사람이 서비스 전체 하루치를 다 써 버리는 걸
# 실제로 막는 건 이 IP 기준이다. 그래서 두 조건을 같이 맞춘다:
#   - 학교 와이파이(재학생 약 70명이 IP 하나)가 막히지 않을 만큼 넉넉하게
#     (분당 120 = 70명이 1분 안에 한 번씩 물어도 통과)
#   - 그래도 서비스 전체 상한보다는 작게 → IP 하나가 막혀도 다른 곳(집·모바일)의 학생은 쓸 수 있다
RATE_LIMIT_IP_PER_MINUTE = _int_env("RATE_LIMIT_IP_PER_MINUTE", 120)
RATE_LIMIT_IP_PER_DAY = _int_env("RATE_LIMIT_IP_PER_DAY", 1500)

# 서비스 전체 하루 상한 (API 비용 안전장치)
RATE_LIMIT_GLOBAL_PER_DAY = _int_env("RATE_LIMIT_GLOBAL_PER_DAY", 2000)

# ---------------------------------------------------------------------------
# 실제 RAG 사용 여부
# ---------------------------------------------------------------------------
# false(기본): /ask 는 demo 답변을 돌려준다. API 키가 없어도 된다.
# true: app/rag 파이프라인을 쓴다. requirements-rag.txt 설치 + OPENAI_API_KEY, ANTHROPIC_API_KEY 필요.
#       RAG_LOCAL_CHUNKS 에 임베딩 포함 jsonl 경로를 주면 Supabase 대신 그 파일로 검색한다 (로컬 개발용).
#       비우면 SUPABASE_URL, SUPABASE_KEY 로 Supabase 를 쓴다.
RAG_ENABLED = _bool_env("RAG_ENABLED", False)
RAG_LOCAL_CHUNKS = os.getenv("RAG_LOCAL_CHUNKS") or None

# true 면 X-Forwarded-For 헤더에서 학생 IP를 읽는다.
# Render 같은 배포 환경은 프록시를 거치므로 true 로 둬야 한다. (로컬 개발은 false)
TRUST_PROXY_HEADERS = _bool_env("TRUST_PROXY_HEADERS", False)

# 우리 서버 앞에 있는 프록시 개수. X-Forwarded-For 는 프록시를 지날 때마다 '오른쪽 끝'에 IP가 붙는다.
# 왼쪽 값은 요청한 사람이 마음대로 적어 보낼 수 있으므로, 오른쪽에서 이 개수만큼 센 자리의 값을 쓴다.
# Render 는 1. (배포 후 로그로 실제 학생 IP가 찍히는지 한 번 확인한다)
TRUSTED_PROXY_COUNT = max(1, _int_env("TRUSTED_PROXY_COUNT", 1))
