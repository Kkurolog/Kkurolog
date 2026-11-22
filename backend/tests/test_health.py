"""GET/HEAD /health 테스트. 실행: backend 폴더에서 `pytest`"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_get():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_health_head():
    """UptimeRobot 무료 플랜은 HEAD로 핑을 보낸다. 405가 나면 '다운'으로 잡힌다."""
    res = client.head("/health")
    assert res.status_code == 200
