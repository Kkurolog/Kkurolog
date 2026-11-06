"""
멘토 데이터를 읽고 다루는 곳.

지금은 가짜(demo) 멘토가 담긴 JSON 파일(app/data/mentors_demo.json)을 읽는다.
나중에 Supabase 같은 DB로 옮기면 `_load_all_mentors` 함수 안쪽만 바꾸면 된다.

중요한 규칙 (docs/DATA.md):
  - 멘토 참여에 동의(consent=true)한 졸업생만 밖으로 내보낸다.
  - 이메일 같은 연락처는 학생에게 보여주지 않는다. (schemas.Mentor 에 email 필드가 없다)
"""

import json
from pathlib import Path

from app.schemas import Mentor

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "mentors_demo.json"


def _load_all_mentors() -> list[dict]:
    """JSON 파일의 멘토를 전부 읽는다. (동의하지 않은 멘토, 이메일 포함 = 내부 전용)"""
    with DATA_FILE.open(encoding="utf-8") as f:
        return json.load(f)


def _consented_mentors() -> list[dict]:
    """참여에 동의한 멘토만 남긴다. 밖으로 나가는 모든 멘토는 이 함수를 거친다."""
    return [m for m in _load_all_mentors() if m.get("consent") is True]


def _to_public(raw: dict) -> Mentor:
    """내부 데이터를 공개용 형태로 바꾼다. Mentor 에 없는 필드(email 등)는 버려진다."""
    return Mentor.model_validate(raw)


def list_mentors() -> list[Mentor]:
    """학생에게 보여줄 멘토 목록 (동의한 멘토만)."""
    return [_to_public(m) for m in _consented_mentors()]


def get_mentor(mentor_id: str) -> Mentor | None:
    """ID로 멘토 한 명을 찾는다. 없거나 동의하지 않은 멘토면 None."""
    for m in _consented_mentors():
        if m["id"] == mentor_id:
            return _to_public(m)
    return None


def get_mentor_email(mentor_id: str) -> str | None:
    """
    멘토의 이메일 주소. **서버 안에서만** 쓴다 (나중에 실제 메일을 보낼 때).
    절대 API 응답에 넣지 않는다.
    """
    for m in _consented_mentors():
        if m["id"] == mentor_id:
            return m.get("email")
    return None
