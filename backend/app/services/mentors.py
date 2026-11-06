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

from app.schemas import Mentor, MentorRecommendation, RecommendResponse

MAX_RECOMMENDATIONS = 3

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


# ---------------------------------------------------------------------------
# 멘토 추천
# ---------------------------------------------------------------------------

# 너무 흔해서 매칭에 쓰면 엉뚱한 멘토가 나오는 단어 (demo 데이터 기준으로 고른 것)
STOP_WORDS = {"준비", "생활", "선택", "경험", "보내는", "다루기", "구하기", "공부"}


def _keywords(mentor: dict) -> list[str]:
    """멘토의 태그·답변 가능 주제·진로 경로를 매칭용 키워드로 모은다."""
    return mentor["tags"] + mentor["topics"] + mentor["career_paths"]


def _match(question: str, keyword: str) -> tuple[int, str] | None:
    """
    키워드가 질문과 겹치는지 보고 (점수, 질문 속에서 찾은 말)을 돌려준다. 안 겹치면 None.
    - 키워드 전체가 질문에 있으면 2점 (띄어쓰기 무시: '창업 후 진학' ↔ '창업후진학')
    - 아니면 키워드를 이루는 단어(2글자 이상) 중 하나라도 질문에 있으면 1점
      (예: '해외 대학' 의 '해외' ↔ 질문 '해외로 가고 싶어')
    """
    if keyword.replace(" ", "") in question.replace(" ", ""):
        return 2, keyword
    for word in keyword.replace("·", " ").split():
        if len(word) >= 2 and word not in STOP_WORDS and word in question:
            return 1, word
    return None


def _fallback(mentors: list[dict]) -> list[MentorRecommendation]:
    """매칭되는 멘토가 없을 때: 진로 경로가 서로 다른 멘토를 골라 보여준다."""
    picked: list[dict] = []
    seen_paths: set[str] = set()
    for m in mentors:
        if m["career_paths"][0] not in seen_paths:
            picked.append(m)
            seen_paths.add(m["career_paths"][0])
        if len(picked) == MAX_RECOMMENDATIONS:
            break
    return [
        MentorRecommendation(mentor=_to_public(m), reason="다양한 경험을 가진 선배예요. 편하게 물어봐도 괜찮아요")
        for m in picked
    ]


def recommend_mentors(question: str) -> RecommendResponse:
    """
    질문에 맞는 멘토를 최대 3명 추천한다. 연락 가능한 멘토만 추천한다.

    지금 방식: 질문 속 단어와 멘토의 태그·주제·경로가 몇 개 겹치는지 세서, 많이 겹치는 순으로 고른다.
    나중에: 이 함수 안쪽만 임베딩 기반(질문 벡터 ↔ 멘토 프로필/인터뷰 벡터 유사도)으로 바꾸면 된다.
            (main.py, schemas.py, 프론트는 그대로 둔다)
    """
    candidates = [m for m in _consented_mentors() if m.get("available")]

    scored: list[tuple[int, dict, list[str], str]] = []
    for m in candidates:
        score = 0
        found_words: list[str] = []  # 질문 속에서 찾은 말 (추천 이유에 쓴다)
        best_keyword = ""  # 가장 잘 맞은 멘토 키워드 (추천 이유에 태그로 붙인다)
        best_point = 0
        for keyword in _keywords(m):
            result = _match(question, keyword)
            if result is None:
                continue
            point, word = result
            score += point
            if word not in found_words:
                found_words.append(word)
            if point > best_point:
                best_point, best_keyword = point, keyword
        if score > 0:
            scored.append((score, m, found_words, best_keyword))

    if not scored:
        return RecommendResponse(recommendations=_fallback(candidates), is_fallback=True)

    # 점수가 높은 순으로 정렬 (같으면 원래 순서 유지)
    scored.sort(key=lambda item: item[0], reverse=True)
    recommendations = [
        MentorRecommendation(
            mentor=_to_public(m),
            reason="질문 속 " + "·".join(f"'{w}'" for w in words[:2]) + f" 관련 경험이 있어요 (#{keyword})",
        )
        for _, m, words, keyword in scored[:MAX_RECOMMENDATIONS]
    ]
    return RecommendResponse(recommendations=recommendations, is_fallback=False)
