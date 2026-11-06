"""POST /contact-requests 테스트."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

VALID = {
    "mentor_id": "mt-01",
    "sender_name": "하늘",
    "reply_email": "student@example.org",
    "subject": "창업 고민 질문드려요",
    "message": "창업을 먼저 하신 이유가 궁금해요. 이야기 들려주실 수 있을까요?",
}


def post(**changes):
    return client.post("/contact-requests", json={**VALID, **changes})


def test_contact_success():
    res = post()
    assert res.status_code == 201
    data = res.json()
    assert data["status"] == "delivered"
    assert "새벽" in data["message"]
    assert "mentor01@example.com" not in res.text  # 멘토 이메일은 응답에 없다


def test_contact_invalid_email():
    for bad in ["not-an-email", "a@b", "a b@c.com", ""]:
        assert post(reply_email=bad).status_code == 422


def test_contact_length_limits():
    assert post(sender_name="").status_code == 422
    assert post(sender_name="가" * 31).status_code == 422
    assert post(subject="   ").status_code == 422  # 공백만 있으면 빈 값
    assert post(subject="가" * 101).status_code == 422
    assert post(message="짧아요").status_code == 422
    assert post(message="가" * 2001).status_code == 422


def test_contact_unknown_mentor():
    assert post(mentor_id="mt-999").status_code == 404


def test_contact_not_consented_mentor_is_treated_as_unknown():
    assert post(mentor_id="mt-10").status_code == 404


def test_contact_unavailable_mentor():
    assert post(mentor_id="mt-05").status_code == 409
