"""POST /ask 테스트: 응답 형식, 답변 종류(answer_type), 공개 등급 규칙, 호출 횟수 제한."""

import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import app
from app.schemas import Source

client = TestClient(app)


def ask(question: str, headers: dict | None = None):
    return client.post("/ask", json={"question": question}, headers=headers or {})


# ---------------------------------------------------------------------------
# 응답 형식 (예전 프론트가 쓰던 필드가 그대로 있는지)
# ---------------------------------------------------------------------------


def test_ask_keeps_old_fields():
    res = ask("대학을 바로 가지 않은 선배들은 왜 그렇게 선택했어?")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data["answer"], str) and data["answer"]
    assert data["has_enough_evidence"] is True
    assert data["answer_type"] == "answer"
    for source in data["sources"]:
        assert source["alumni"] and source["interview_id"]
        assert source["excerpt"]  # L1 이 아닌 출처는 excerpt 를 계속 채운다


def test_ask_no_evidence():
    data = ask("근거없음 테스트").json()
    assert data["answer_type"] == "no_evidence"
    assert data["has_enough_evidence"] is False
    assert data["sources"] == []


def test_ask_off_topic_is_shown_as_normal_answer():
    data = ask("주제밖 질문이에요").json()
    assert data["answer_type"] == "off_topic"
    assert data["has_enough_evidence"] is True  # 지금 프론트에서 안내 문구가 보이도록
    assert data["sources"] == []


@pytest.mark.parametrize("question", ["요즘 너무 죽고 싶어", "자해를 한 적이 있어요", "집에서 학대를 당하고 있어"])
def test_ask_crisis_returns_safety_message(question):
    data = ask(question).json()
    assert data["answer_type"] == "safety"
    assert data["has_enough_evidence"] is True
    assert data["sources"] == []
    assert "109" in data["answer"]


def test_ask_rejects_empty_question():
    assert ask("").status_code == 422


# ---------------------------------------------------------------------------
# 공개 등급 (Source 가 규칙을 강제하는지)
# ---------------------------------------------------------------------------


def test_source_l1_hides_excerpt_and_url():
    source = Source(alumni="졸업생", excerpt="원문", interview_id="p-1", visibility="L1", url="https://example.com")
    assert source.excerpt is None
    assert source.url is None


def test_source_l2_keeps_excerpt_but_hides_url():
    """L2 는 익명이라 원문 링크(작성자 이름이 보임)를 주지 않는다."""
    source = Source(alumni="졸업생", excerpt="원문", interview_id="p-1", visibility="L2", url="https://example.com")
    assert source.excerpt == "원문"
    assert source.url is None


def test_source_l3_keeps_url():
    source = Source(alumni="새벽", excerpt="원문", interview_id="p-1", visibility="L3", url="https://example.com")
    assert source.excerpt == "원문"
    assert source.url == "https://example.com"


def test_source_without_visibility_hides_url():
    """공개 등급을 모르면 링크는 보수적으로 숨긴다 (excerpt 는 예전처럼 유지)."""
    source = Source(alumni="졸업생", excerpt="원문", interview_id="p-1", url="https://example.com")
    assert source.excerpt == "원문"
    assert source.url is None


def test_source_l0_is_rejected():
    with pytest.raises(ValueError):
        Source(alumni="졸업생", excerpt="원문", interview_id="p-1", visibility="L0")


# ---------------------------------------------------------------------------
# 호출 횟수 제한
# ---------------------------------------------------------------------------

CLIENT_A = {"X-Client-Id": "11111111-aaaa-bbbb-cccc-000000000001"}
CLIENT_B = {"X-Client-Id": "11111111-aaaa-bbbb-cccc-000000000002"}


def test_client_per_minute_limit(monkeypatch):
    monkeypatch.setattr(config, "RATE_LIMIT_CLIENT_PER_MINUTE", 2)
    assert ask("질문", CLIENT_A).status_code == 200
    assert ask("질문", CLIENT_A).status_code == 200
    blocked = ask("질문", CLIENT_A)
    assert blocked.status_code == 429
    assert blocked.json()["detail"]  # 한국어 안내 문구
    assert "retry-after" in blocked.headers
    # 같은 IP(학교 와이파이)의 다른 학생은 막히지 않는다
    assert ask("질문", CLIENT_B).status_code == 200


def test_ip_limit_applies_without_client_id(monkeypatch):
    monkeypatch.setattr(config, "RATE_LIMIT_IP_PER_MINUTE", 3)
    for _ in range(3):
        assert ask("질문").status_code == 200  # 헤더가 없어도(옛 프론트) 동작한다
    assert ask("질문").status_code == 429


def test_global_daily_limit(monkeypatch):
    monkeypatch.setattr(config, "RATE_LIMIT_GLOBAL_PER_DAY", 2)
    assert ask("질문", CLIENT_A).status_code == 200
    assert ask("질문", CLIENT_B).status_code == 200
    assert ask("질문", {"X-Client-Id": "11111111-aaaa-bbbb-cccc-000000000003"}).status_code == 429


def test_blocked_request_is_not_counted(monkeypatch):
    """막힌 요청은 다른 카운터를 깎지 않는다."""
    monkeypatch.setattr(config, "RATE_LIMIT_CLIENT_PER_MINUTE", 1)
    monkeypatch.setattr(config, "RATE_LIMIT_IP_PER_MINUTE", 3)
    assert ask("질문", CLIENT_A).status_code == 200
    assert ask("질문", CLIENT_A).status_code == 429
    assert ask("질문", CLIENT_A).status_code == 429
    # IP 카운터는 1만 올라갔으므로 다른 학생 2명은 통과
    assert ask("질문", CLIENT_B).status_code == 200
    assert ask("질문", {"X-Client-Id": "11111111-aaaa-bbbb-cccc-000000000003"}).status_code == 200


def test_crisis_question_is_answered_even_after_limit(monkeypatch):
    """A1: 질문 횟수를 다 쓴 학생도 위기 질문에는 상담 안내를 받는다."""
    monkeypatch.setattr(config, "RATE_LIMIT_CLIENT_PER_MINUTE", 1)
    assert ask("질문", CLIENT_A).status_code == 200
    assert ask("질문", CLIENT_A).status_code == 429
    res = ask("요즘 너무 죽고 싶어", CLIENT_A)
    assert res.status_code == 200
    assert res.json()["answer_type"] == "safety"


def test_crisis_question_is_not_counted(monkeypatch):
    """위기 질문은 횟수에 세지 않는다 (API 비용이 들지 않으므로)."""
    monkeypatch.setattr(config, "RATE_LIMIT_CLIENT_PER_MINUTE", 1)
    assert ask("자해를 한 적이 있어요", CLIENT_A).status_code == 200
    assert ask("질문", CLIENT_A).status_code == 200


def test_invalid_request_is_not_counted(monkeypatch):
    """A3: 형식이 틀린 요청(422)은 질문 횟수를 깎지 않는다."""
    monkeypatch.setattr(config, "RATE_LIMIT_CLIENT_PER_MINUTE", 1)
    assert ask("", CLIENT_A).status_code == 422
    assert ask("", CLIENT_A).status_code == 422
    assert client.post("/ask", json={}, headers=CLIENT_A).status_code == 422
    assert ask("질문", CLIENT_A).status_code == 200


def test_invalid_client_id_is_ignored(monkeypatch):
    monkeypatch.setattr(config, "RATE_LIMIT_CLIENT_PER_MINUTE", 1)
    bad = {"X-Client-Id": "x"}  # 형식이 이상하면 없는 것으로 친다 → 학생 기준 제한 대신 IP 기준만
    assert ask("질문", bad).status_code == 200
    assert ask("질문", bad).status_code == 200


def test_forwarded_ip_used_when_trusted(monkeypatch):
    monkeypatch.setattr(config, "TRUST_PROXY_HEADERS", True)
    monkeypatch.setattr(config, "RATE_LIMIT_IP_PER_MINUTE", 1)
    assert ask("질문", {"X-Forwarded-For": "203.0.113.1, 10.0.0.1"}).status_code == 200
    assert ask("질문", {"X-Forwarded-For": "203.0.113.1, 10.0.0.1"}).status_code == 429
    assert ask("질문", {"X-Forwarded-For": "203.0.113.2, 10.0.0.1"}).status_code == 200
