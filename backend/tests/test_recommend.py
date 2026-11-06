"""POST /mentors/recommend 테스트."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def recommend(question: str) -> dict:
    res = client.post("/mentors/recommend", json={"question": question})
    assert res.status_code == 200
    return res.json()


def test_recommend_matches_keywords():
    data = recommend("창업하다가 대학에 다시 가게 된 이야기가 궁금해")
    assert data["is_fallback"] is False
    ids = [r["mentor"]["id"] for r in data["recommendations"]]
    assert ids[0] == "mt-01"  # 창업 후 진학 멘토가 가장 먼저
    assert all(r["reason"] for r in data["recommendations"])


def test_recommend_at_most_three_and_only_available():
    data = recommend("해외 대학 유학 영어 에세이 장학금")
    assert 1 <= len(data["recommendations"]) <= 3
    for r in data["recommendations"]:
        assert r["mentor"]["available"] is True  # mt-05 (연락 불가)는 추천하지 않는다


def test_recommend_fallback_when_no_match():
    data = recommend("오늘 점심 뭐 먹지")
    assert data["is_fallback"] is True
    assert 1 <= len(data["recommendations"]) <= 3
    assert "다양한" in data["recommendations"][0]["reason"]


def test_recommend_never_exposes_hidden_data():
    # mt-10 은 동의하지 않은 멘토. 태그가 많아도 절대 나오면 안 된다
    for question in ["취업 창업 개발 디자인", "아무 말"]:
        res = client.post("/mentors/recommend", json={"question": question})
        assert "mt-10" not in res.text
        assert "@example.com" not in res.text


def test_recommend_rejects_empty_question():
    res = client.post("/mentors/recommend", json={"question": ""})
    assert res.status_code == 422
