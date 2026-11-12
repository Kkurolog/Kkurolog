"""
RAG 가 쓰는 위기 신호 판정과 안내 문구.

새로 정의하지 않고 app/services/answer.py 의 것을 그대로 가져온다.
판정 규칙과 문구가 두 곳에 따로 있으면 한쪽만 고쳐져 서로 달라지기 때문이다.
→ 패턴이나 문구를 바꾸려면 app/services/answer.py 를 고친다. (초안이며, 코치진 확인 필요)
"""

from app.services.answer import (
    NO_EVIDENCE_MESSAGE,
    OFF_TOPIC_MESSAGE,
    SAFETY_MESSAGE,
    TEMPORARY_ERROR_MESSAGE,
    looks_like_crisis,
)

__all__ = [
    "looks_like_crisis",
    "SAFETY_MESSAGE",
    "OFF_TOPIC_MESSAGE",
    "NO_EVIDENCE_MESSAGE",
    "TEMPORARY_ERROR_MESSAGE",
]
