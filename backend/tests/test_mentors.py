"""GET /mentors 테스트. 실행: backend 폴더에서 `pytest`"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_mentors_returns_list():
    res = client.get("/mentors")
    assert res.status_code == 200
    mentors = res.json()
    assert len(mentors) >= 8
    assert {"id", "name", "exit_year", "career_paths", "tags", "topics", "available"} <= mentors[0].keys()


def test_mentors_hides_email_and_consent():
    for mentor in client.get("/mentors").json():
        assert "email" not in mentor
        assert "consent" not in mentor
    # 응답 전체 어디에도 이메일 주소가 섞여 있지 않아야 한다
    assert "@example.com" not in client.get("/mentors").text


def test_mentors_excludes_not_consented():
    ids = [m["id"] for m in client.get("/mentors").json()]
    assert "mt-10" not in ids  # mt-10 은 참여 동의 false
