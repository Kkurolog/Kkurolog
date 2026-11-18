"""한국 시간 도구. 한국은 서머타임이 없어서 +09:00 고정으로 쓴다 (Windows 에 tzdata 가 없어도 동작)."""

import re
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9), "KST")


def now() -> datetime:
    """지금 시각 (한국 시간). 테스트에서 바꿔 끼울 수 있게 함수로 둔다."""
    return datetime.now(KST)


def kst_day_start(moment: datetime) -> datetime:
    """그 시각이 속한 한국 날짜의 0시."""
    local = moment.astimezone(KST)
    return local.replace(hour=0, minute=0, second=0, microsecond=0)


def to_iso(moment: datetime) -> str:
    """ISO 8601 한국 시간 문자열. 예: 2026-11-17T14:03:00+09:00"""
    return moment.astimezone(KST).replace(microsecond=0).isoformat()


_FRACTION = re.compile(r"\.(\d+)")


def parse_ts(text: str) -> datetime:
    """Supabase 가 돌려주는 시각 글자를 datetime 으로. 소수점 자리 수가 달라도 읽는다."""
    value = text.strip().replace("Z", "+00:00")
    value = _FRACTION.sub(lambda m: "." + (m.group(1) + "000000")[:6], value, count=1)
    if " " in value and "T" not in value:
        value = value.replace(" ", "T", 1)
    moment = datetime.fromisoformat(value)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment
