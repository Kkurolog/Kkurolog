"""
메일 문구·숫자 설정 (Supabase mail_settings, 관리자 페이지에서 고침).

- 메일을 보낼 때마다 읽으므로 값을 고치면 바로 다음 메일부터 적용된다.
- 값이 비어 있거나 키가 없으면 아래 기본값을 쓴다. (0002_mail_tables.sql + 0003_mail_followup.sql 의 기본값과 같음)
- 숫자 키는 0 이상의 정수 글자. 숫자가 아니면 기본값.
"""

from __future__ import annotations

import logging

logger = logging.getLogger("uvicorn.error")

DEFAULTS: dict[str, str] = {
    "serviceName": "꾸로록",
    "senderName": "꾸로록",
    "mentorSubjectPrefix": "[꾸로록 문의]",
    "mentorFooter": "답장을 보내실 때, 반드시 해당 메일 주소로 '답장' 기능을 활용해 보내주세요!",
    "studentSubjectPrefix": "[꾸로록 답장]",
    "studentForwardIntro": "멘토님이 보내주신 답장을 전달해 드려요.",
    "studentForwardFooter": "이 메일에 답장하면 멘토님께 전달돼요.",
    "rateLimitMinutes": "10",
    "rateLimitPerWindow": "3",
    "rateLimitPerDay": "5",
    "studentCopySubjectPrefix": "[꾸로록 보낸 문의]",
    "studentCopyIntro": "멘토님께 아래 문의를 보냈어요. 답장이 오면 이 메일 주소로 전달해 드려요.",
    "studentCopyFooter": "이 메일은 보낸 문의의 사본이에요. 이 메일에 답장해도 멘토에게 전달되지 않아요.",
    "reminderDays": "10",
    "mentorReminderSubjectPrefix": "[꾸로록 리마인드]",
    "mentorReminderIntro": "열흘 전 꾸로록에 들어온 문의가 멘토님을 기다리고 있어요. 해당 메일의 '답장' 버튼으로 회신해 주세요!",
    "mentorFollowupSubjectPrefix": "[꾸로록 추가 질문]",
    "mentorFollowupIntro": "학생이 멘토님의 답장에 이어서 메시지를 보냈어요.",
}

NUMBER_KEYS = ("rateLimitMinutes", "rateLimitPerWindow", "rateLimitPerDay", "reminderDays")


def merge_settings(stored: dict[str, str]) -> dict[str, str]:
    """DB 값 + 기본값. 비어 있는 값은 기본값으로 채운다."""
    merged = dict(DEFAULTS)
    for key, value in stored.items():
        text = str(value if value is not None else "").strip()
        if text:
            merged[key] = text
    return merged


def number(settings: dict[str, str], key: str) -> int:
    raw = str(settings.get(key, "")).strip()
    if raw.isdigit():
        return int(raw)
    logger.warning("mail_settings 의 %s 값이 0 이상의 정수가 아니라 기본값 %s 를 씀", key, DEFAULTS[key])
    return int(DEFAULTS[key])


def load_settings(store) -> dict[str, str]:
    return merge_settings(store.get_settings())
