"""
/ask 호출 횟수 제한 (rate limit).

왜 필요한가: /ask 는 로그인 없이 누구나 부를 수 있고, 나중에는 유료 API(OpenAI·Claude)를 쓴다.
           누군가 반복 호출하면 팀의 API 예산이 바닥난다.

세 가지 기준으로 센다 (수치는 app/config.py):
  1. 브라우저별 익명 ID (X-Client-Id 헤더) — 학생 한 명 기준. 학교 와이파이는 IP가 같아서 IP로는 구분 못 한다
     단, 이 ID 는 브라우저가 마음대로 바꿔 보낼 수 있다 → 평범한 학생용 기준일 뿐, 악용은 못 막는다
  2. IP — 악용 방지의 실제 기준. 학교 와이파이가 막히지 않게 넉넉하되, 서비스 전체 상한보다는 작게
     (IP는 X-Forwarded-For 의 오른쪽 끝에서 읽는다. 왼쪽은 꾸밀 수 있다 → client_ip 참고)
  3. 서비스 전체 하루 상한

- '분당'은 **최근 60초** 기준이다 (슬라이딩 윈도우). 시계의 '분'으로 자르면 12:00:59 에 5번,
  12:01:00 에 5번처럼 경계에서 2배가 몰릴 수 있어서다.
- '하루'는 한국 시간 자정 기준이다.
- 카운터는 서버 메모리에만 있다. 서버가 재시작되면 0으로 돌아간다. (MVP라 충분, DB·Redis 안 씀)
- 서버를 여러 대 띄우면 서버마다 따로 센다. 지금(Render 1대)은 문제없다.
- X-Client-Id 가 없는 요청(옛 프론트 등)은 IP·전체 기준만 적용한다. 그래서 프론트가 헤더를 보내기 전에도 안 깨진다.
"""

import re
import threading
import time
from collections import deque
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request

from app import config

KST = timezone(timedelta(hours=9))  # 하루 기준은 한국 시간 자정
WINDOW_SECONDS = 60

# 익명 ID로 받아들일 형식: 영문·숫자·하이픈 8~64자 (보통 UUID). 이상한 값은 없는 것으로 친다.
CLIENT_ID_PATTERN = re.compile(r"^[A-Za-z0-9-]{8,64}$")

LIMIT_MESSAGE = "질문을 너무 많이 보냈어요. 잠시 후 다시 시도해 주세요."
DAILY_LIMIT_MESSAGE = "오늘 질문할 수 있는 횟수를 다 썼어요. 내일 다시 이용해 주세요."
GLOBAL_LIMIT_MESSAGE = "오늘은 꾸로록 이용량이 많아 질문을 받을 수 없어요. 내일 다시 이용해 주세요."
# IP 기준은 같은 와이파이를 쓰는 여러 학생이 함께 세어진다. 질문을 거의 안 한 학생에게
# '횟수를 다 썼어요'라고 하면 틀린 말이라 문구를 따로 둔다.
IP_LIMIT_MESSAGE = "지금 같은 인터넷(와이파이)에서 질문이 몰리고 있어요. 잠시 후 다시 시도해 주세요."
IP_DAILY_LIMIT_MESSAGE = (
    "오늘은 같은 인터넷(와이파이)에서 질문이 너무 많아 더 받을 수 없어요. "
    "다른 인터넷으로 접속하거나 내일 다시 이용해 주세요."
)


class RateLimiter:
    """
    대상(익명 ID, IP, 전체)마다 최근 60초 동안의 요청 시각과 오늘 횟수를 기억한다.
    clock 은 테스트에서 시간을 직접 움직이려고 바꿔 끼울 수 있게 했다.
    """

    def __init__(self, clock=time.time) -> None:
        self._clock = clock
        self._lock = threading.Lock()  # FastAPI 가 요청을 동시에 처리할 수 있어서 잠금을 건다
        self._recent: dict[str, deque[float]] = {}  # 대상 → 최근 60초 안의 요청 시각들
        self._today: dict[str, int] = {}  # 대상 → 오늘 횟수
        self._day = ""  # _today 가 어느 날짜의 기록인지

    def reset(self) -> None:
        """카운터를 모두 지운다. (테스트용)"""
        with self._lock:
            self._recent.clear()
            self._today.clear()
            self._day = ""

    def check_and_count(self, client_id: str | None, ip: str) -> None:
        """
        제한을 넘었으면 429 오류를 낸다. 통과하면 횟수를 1 올린다.
        (하나라도 막히면 아무것도 세지 않는다 → 막힌 요청이 다른 카운터를 깎지 않는다)
        """
        now = self._clock()

        # (대상, 60초 상한, 하루 상한, 60초 상한 문구, 하루 상한 문구). 60초 상한 0 은 '분당 제한 없음'
        rules: list[tuple[str, int, int, str, str]] = [
            ("global", 0, config.RATE_LIMIT_GLOBAL_PER_DAY, LIMIT_MESSAGE, GLOBAL_LIMIT_MESSAGE),
            (f"ip:{ip}", config.RATE_LIMIT_IP_PER_MINUTE, config.RATE_LIMIT_IP_PER_DAY,
             IP_LIMIT_MESSAGE, IP_DAILY_LIMIT_MESSAGE),
        ]
        if client_id:
            rules.append(
                (f"client:{client_id}", config.RATE_LIMIT_CLIENT_PER_MINUTE, config.RATE_LIMIT_CLIENT_PER_DAY,
                 LIMIT_MESSAGE, DAILY_LIMIT_MESSAGE)
            )

        with self._lock:
            self._start_new_day_if_needed(now)
            self._drop_old_requests(now)

            for target, per_minute, per_day, minute_message, day_message in rules:
                if self._today.get(target, 0) >= per_day:
                    raise _too_many(day_message, _seconds_until_midnight(now))
                recent = self._recent.get(target)
                if per_minute and recent and len(recent) >= per_minute:
                    # 가장 오래된 요청이 60초 창에서 빠지는 시각까지 기다리면 된다
                    raise _too_many(minute_message, max(1, int(recent[0] + WINDOW_SECONDS - now) + 1))

            for target, per_minute, *_ in rules:
                if per_minute:
                    self._recent.setdefault(target, deque()).append(now)
                self._today[target] = self._today.get(target, 0) + 1

    def _start_new_day_if_needed(self, now: float) -> None:
        today = datetime.fromtimestamp(now, KST).strftime("%Y%m%d")
        if today != self._day:
            self._day, self._today = today, {}

    def _drop_old_requests(self, now: float) -> None:
        """60초가 지난 요청 시각을 지우고, 빈 대상은 통째로 지운다 (메모리가 계속 늘지 않게)."""
        for target in list(self._recent):
            recent = self._recent[target]
            while recent and recent[0] <= now - WINDOW_SECONDS:
                recent.popleft()
            if not recent:
                del self._recent[target]


def _too_many(message: str, retry_after: int) -> HTTPException:
    return HTTPException(status_code=429, detail=message, headers={"Retry-After": str(retry_after)})


def _seconds_until_midnight(now: float) -> int:
    current = datetime.fromtimestamp(now, KST)
    midnight = (current + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return max(1, int((midnight - current).total_seconds()))


def client_ip(request: Request) -> str:
    """
    요청한 사람의 IP.
    배포 환경(Render)은 프록시를 거친다. 프록시는 자기가 본 IP를 X-Forwarded-For 의 '오른쪽 끝'에 붙인다.
    맨 앞(왼쪽) 값은 요청한 사람이 마음대로 적어 보낼 수 있어서 쓰면 안 된다
    (그러면 요청마다 IP를 바꿔 적어 IP 제한을 피하고, 서비스 전체 하루치를 혼자 다 쓸 수 있다).
    그래서 오른쪽에서 TRUSTED_PROXY_COUNT 번째 값 = 우리 프록시가 직접 본 IP 를 쓴다.
    """
    if config.TRUST_PROXY_HEADERS:
        hops = [h.strip() for h in request.headers.get("x-forwarded-for", "").split(",") if h.strip()]
        if len(hops) >= config.TRUSTED_PROXY_COUNT:
            return hops[-config.TRUSTED_PROXY_COUNT]
    return request.client.host if request.client else "unknown"


def client_id(request: Request) -> str | None:
    """프론트가 보낸 브라우저별 익명 ID. 형식이 이상하면 None."""
    value = request.headers.get("x-client-id", "").strip()
    return value if CLIENT_ID_PATTERN.match(value) else None


ask_limiter = RateLimiter()


def limit_ask(request: Request) -> None:
    """/ask 라우트 안에서 부른다 (입력 검사·위기 신호 검사 다음). 제한을 넘으면 429."""
    ask_limiter.check_and_count(client_id(request), client_ip(request))
