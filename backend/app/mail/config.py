"""
메일 기능 설정 (환경변수). 값은 .env 와 Render 환경변수에만 둔다. 코드·GitHub 에 적지 않는다.

| 이름                 | 뜻                                                                 |
| MAIL_ENABLED        | true 면 Supabase + Apps Script 로 실제 동작. 기본 false (demo)       |
| SUPABASE_URL        | Supabase 프로젝트 주소 (RAG 와 같은 값)                               |
| SUPABASE_KEY        | service_role(Secret) 키. 서버 전용 (RAG 와 같은 값)                   |
| APPS_SCRIPT_URL     | 메일 웹앱 주소 (https://script.google.com/macros/s/…/exec)            |
| APPS_SCRIPT_API_KEY | 메일 웹앱 스크립트 속성 API_KEY 와 같은 값                            |
| MAIL_WEBHOOK_SECRET | 메일 웹앱 스크립트 속성 MAIL_WEBHOOK_SECRET 와 같은 값                |

MAIL_ENABLED 를 따로 둔 이유: SUPABASE_URL/KEY 는 RAG 도 쓴다. RAG 를 켜려고 값을 넣는 순간
멘토 목록이 (아직 비어 있을 수 있는) Supabase 로 바뀌지 않게, 데이터를 옮긴 뒤 스위치를 따로 켠다.
"""

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()

REQUIRED_ENV = ("SUPABASE_URL", "SUPABASE_KEY", "APPS_SCRIPT_URL", "APPS_SCRIPT_API_KEY", "MAIL_WEBHOOK_SECRET")


class MailNotConfigured(Exception):
    """MAIL_ENABLED=true 인데 필요한 환경변수가 빠졌다."""


@dataclass(frozen=True)
class MailConfig:
    supabase_url: str
    supabase_key: str
    apps_script_url: str
    apps_script_api_key: str
    webhook_secret: str


def mail_enabled() -> bool:
    """MAIL_ENABLED 스위치. 요청마다 읽는다 (테스트에서 바꾸기 쉽게)."""
    return os.getenv("MAIL_ENABLED", "").strip().lower() in {"1", "true", "yes"}


def load_mail_config() -> MailConfig:
    """필요한 환경변수를 모두 읽는다. 하나라도 비어 있으면 MailNotConfigured (빠진 이름만 알려 줌, 값은 안 보여 줌)."""
    values = {name: os.getenv(name, "").strip() for name in REQUIRED_ENV}
    missing = [name for name, value in values.items() if not value]
    if missing:
        raise MailNotConfigured("빠진 환경변수: " + ", ".join(missing))
    return MailConfig(
        supabase_url=values["SUPABASE_URL"].rstrip("/"),
        supabase_key=values["SUPABASE_KEY"],
        apps_script_url=values["APPS_SCRIPT_URL"],
        apps_script_api_key=values["APPS_SCRIPT_API_KEY"],
        webhook_secret=values["MAIL_WEBHOOK_SECRET"],
    )
