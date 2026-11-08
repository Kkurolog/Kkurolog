"""
/ask 호출 횟수 제한 (rate limit).

왜 필요한가: /ask 는 로그인 없이 누구나 부를 수 있고, 나중에는 유료 API(OpenAI·Claude)를 쓴다.
           누군가 반복 호출하면 팀의 API 예산이 바닥난다.

세 가지 기준으로 센다 (수치는 app/config.py):
  1. 브라우저별 익명 ID (X-Client-Id 헤더) — 학생 한 명 기준. 학교 와이파이는 IP가 같아서 IP로는 구분 못 한다
  2. IP — 봇 방지용 (느슨하게)
  3. 서비스 전체 하루 상한

- 카운터는 서버 메모리에만 있다. 서버가 재시작되면 0으로 돌아간다. (MVP라 충분, DB·Redis 안 씀)
- 서버를 여러 대 띄우면 서버마다 따로 센다. 지금(Render 1대)은 문제없다.
- X-Client-Id 가 없는 요청(옛 프론트 등)은 IP·전체 기준만 적용한다. 그래서 프론트가 헤더를 보내기 전에도 안 깨진다.
"""

import re
import threading
import time
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request

from app import config

KST = timezone(timedelta(hours=9))  # 하루 기준은 한국 시간 자정

# 익명 ID로 받아들일 형식: 영문·숫자·하이픈 8~64자 (보통 UUID). 이상한 값은 없는 것으로 친다.
CLIENT_ID_PATTERN = re.compile(r"^[A-Za-z0-9-]{8,64}$")

LIMIT_MESSAGE = "질문을 너무 많이 보냈어요. 잠시 후 다시 시도해 주세요."
DAILY_LIMIT_MESSAGE = "오늘 질문할 수 있는 횟수를 다 썼어요. 내일 다시 이용해 주세요."
GLOBAL_LIMIT_MESSAGE = "오늘은 꾸로록 이용량이 많아 질문을 받을 수 없어요. 내일 다시 이용해 주세요."


class RateLimiter:
    """시간 구간(1분, 하루)마다 횟수를 세는 단순한 카운터."""

    def __init__(self) -> None:
        self._counts: dict[tuple[str, str], int] = {}  # (구간, 대상) → 횟수
        self._lock = threading.Lock()  # FastAPI 가 요청을 동시에 처리할 수 있어서 잠금을 건다

    def reset(self) -> None:
        """카운터를 모두 지운다. (테스트용)"""
        with self._lock:
            self._counts.clear()

    def check_and_count(self, client_id: str | None, ip: str) -> None:
        """
        제한을 넘었으면 429 오류를 낸다. 통과하면 횟수를 1 올린다.
        (하나라도 막히면 아무것도 세지 않는다 → 막힌 요청이 다른 카운터를 깎지 않는다)
        """
        now = time.time()
        minute = f"m{int(now // 60)}"
        day = "d" + datetime.fromtimestamp(now, KST).strftime("%Y%m%d")

        # (구간, 대상, 상한, 막혔을 때 문구, 다시 시도까지 초)
        rules: list[tuple[str, str, int, str, int]] = [
            (day, "global", config.RATE_LIMIT_GLOBAL_PER_DAY, GLOBAL_LIMIT_MESSAGE, _seconds_until_midnight(now)),
            (minute, f"ip:{ip}", config.RATE_LIMIT_IP_PER_MINUTE, LIMIT_MESSAGE, 60),
            (day, f"ip:{ip}", config.RATE_LIMIT_IP_PER_DAY, DAILY_LIMIT_MESSAGE, _seconds_until_midnight(now)),
        ]
        if client_id:
            rules += [
                (minute, f"client:{client_id}", config.RATE_LIMIT_CLIENT_PER_MINUTE, LIMIT_MESSAGE, 60),
                (day, f"client:{client_id}", config.RATE_LIMIT_CLIENT_PER_DAY, DAILY_LIMIT_MESSAGE,
                 _seconds_until_midnight(now)),
            ]

        with self._lock:
            self._drop_old_windows(minute, day)
            for window, target, limit, message, retry_after in rules:
                if self._counts.get((window, target), 0) >= limit:
                    raise HTTPException(status_code=429, detail=message, headers={"Retry-After": str(retry_after)})
            for window, target, _, _, _ in rules:
                self._counts[(window, target)] = self._counts.get((window, target), 0) + 1

    def _drop_old_windows(self, minute: str, day: str) -> None:
        """지난 구간의 카운터를 지워 메모리가 계속 늘지 않게 한다."""
        stale = [key for key in self._counts if key[0] not in (minute, day)]
        for key in stale:
            del self._counts[key]


def _seconds_until_midnight(now: float) -> int:
    current = datetime.fromtimestamp(now, KST)
    midnight = (current + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return max(1, int((midnight - current).total_seconds()))


def client_ip(request: Request) -> str:
    """
    요청한 사람의 IP.
    배포 환경(Render)은 프록시를 거쳐서, 진짜 IP가 X-Forwarded-For 헤더의 맨 앞에 들어 있다.
    (주의: 이 헤더는 클라이언트가 꾸밀 수 있다. 그래도 서비스 전체 상한이 마지막 안전장치가 된다)
    """
    if config.TRUST_PROXY_HEADERS:
        forwarded = request.headers.get("x-forwarded-for", "")
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    return request.client.host if request.client else "unknown"


def client_id(request: Request) -> str | None:
    """프론트가 보낸 브라우저별 익명 ID. 형식이 이상하면 None."""
    value = request.headers.get("x-client-id", "").strip()
    return value if CLIENT_ID_PATTERN.match(value) else None


ask_limiter = RateLimiter()


def limit_ask(request: Request) -> None:
    """/ask 라우트에 붙이는 FastAPI 의존성(Depends). 제한을 넘으면 429."""
    ask_limiter.check_and_count(client_id(request), client_ip(request))
