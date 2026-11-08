"""POST /ask 테스트: 응답 형식, 답변 종류(answer_type), 공개 등급 규칙, 호출 횟수 제한."""

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import config
from app.main import app
from app.rag.models import RagAnswer, RagSource
from app.rate_limit import RateLimiter
from app.schemas import Source
from app.services import answer as answer_service

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


def test_client_has_no_per_minute_limit_by_default(monkeypatch):
    """기본값: 학생별 분당 제한 없음 (하루 상한만). 연달아 10번 질문해도 막히지 않는다."""
    monkeypatch.setattr(config, "RATE_LIMIT_CLIENT_PER_MINUTE", 0)
    for _ in range(10):
        assert ask("질문", CLIENT_A).status_code == 200


def test_client_daily_limit_still_applies(monkeypatch):
    monkeypatch.setattr(config, "RATE_LIMIT_CLIENT_PER_MINUTE", 0)
    monkeypatch.setattr(config, "RATE_LIMIT_CLIENT_PER_DAY", 3)
    for _ in range(3):
        assert ask("질문", CLIENT_A).status_code == 200
    blocked = ask("질문", CLIENT_A)
    assert blocked.status_code == 429 and "오늘" in blocked.json()["detail"]


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


# ---------------------------------------------------------------------------
# 최근 60초 기준 (슬라이딩 윈도우) — 가짜 시계로 시간을 직접 움직인다
# ---------------------------------------------------------------------------

NOON_KST = 1_762_570_800.0  # 2025-11-08 12:00:00 KST


class FakeClock:
    def __init__(self, now: float = NOON_KST):
        self.now = now

    def __call__(self) -> float:
        return self.now


def blocked(limiter: RateLimiter, client: str = "client-aaaa-1111") -> bool:
    try:
        limiter.check_and_count(client, "1.1.1.1")
        return False
    except HTTPException as e:
        assert e.status_code == 429
        return True


def test_minute_limit_recovers_after_60_seconds(monkeypatch):
    monkeypatch.setattr(config, "RATE_LIMIT_CLIENT_PER_MINUTE", 2)
    clock = FakeClock()
    limiter = RateLimiter(clock=clock)
    assert not blocked(limiter) and not blocked(limiter)
    assert blocked(limiter)
    clock.now += 61
    assert not blocked(limiter)


def test_no_double_burst_at_minute_boundary(monkeypatch):
    """12:00:59 에 2번 → 12:01:00 에는 막혀야 한다 (시계의 '분'으로 자르면 통과해 버림)."""
    monkeypatch.setattr(config, "RATE_LIMIT_CLIENT_PER_MINUTE", 2)
    clock = FakeClock(NOON_KST + 59)
    limiter = RateLimiter(clock=clock)
    assert not blocked(limiter) and not blocked(limiter)
    clock.now += 1  # 12:01:00
    assert blocked(limiter)


def test_daily_limit_resets_at_kst_midnight(monkeypatch):
    monkeypatch.setattr(config, "RATE_LIMIT_CLIENT_PER_DAY", 2)
    clock = FakeClock()
    limiter = RateLimiter(clock=clock)
    assert not blocked(limiter)
    clock.now += 61
    assert not blocked(limiter)
    clock.now += 61
    assert blocked(limiter)
    clock.now = NOON_KST + 12 * 3600 + 1  # 다음 날 00:00:01 KST
    assert not blocked(limiter)


def test_forwarded_ip_used_when_trusted(monkeypatch):
    monkeypatch.setattr(config, "TRUST_PROXY_HEADERS", True)
    monkeypatch.setattr(config, "RATE_LIMIT_IP_PER_MINUTE", 1)
    assert ask("질문", {"X-Forwarded-For": "203.0.113.1, 10.0.0.1"}).status_code == 200
    assert ask("질문", {"X-Forwarded-For": "203.0.113.1, 10.0.0.1"}).status_code == 429
    assert ask("질문", {"X-Forwarded-For": "203.0.113.2, 10.0.0.1"}).status_code == 200


# ---------------------------------------------------------------------------
# RAG 연결 (RAG_ENABLED) — 실제 API 대신 가짜 파이프라인을 끼운다
# ---------------------------------------------------------------------------


class FakePipeline:
    def __init__(self, result: RagAnswer):
        self.result = result
        self.questions: list[str] = []

    def answer(self, question: str) -> RagAnswer:
        self.questions.append(question)
        return self.result


def use_fake_pipeline(monkeypatch, result: RagAnswer) -> FakePipeline:
    fake = FakePipeline(result)
    monkeypatch.setattr(config, "RAG_ENABLED", True)
    monkeypatch.setattr(answer_service, "_pipeline", fake)
    return fake


def test_rag_answer_is_used_when_enabled(monkeypatch):
    source = RagSource(chunk_id="p1#0", post_id="p1", alumni="새벽", excerpt="원문", visibility="L3",
                       url="https://example.com/p1", date="2023-05-10")
    fake = use_fake_pipeline(monkeypatch, RagAnswer(answer_type="answer", answer="RAG 답변", sources=[source]))
    data = ask("창업 이야기").json()
    assert fake.questions == ["창업 이야기"]
    assert data["answer"] == "RAG 답변" and data["answer_type"] == "answer"
    assert data["sources"][0]["interview_id"] == "p1" and data["sources"][0]["url"] == "https://example.com/p1"


def test_demo_keywords_do_not_apply_when_rag_enabled(monkeypatch):
    use_fake_pipeline(monkeypatch, RagAnswer(answer_type="answer", answer="RAG 답변"))
    assert ask("주제밖 질문").json()["answer"] == "RAG 답변"  # demo 트리거 단어는 RAG 에서는 무시


def test_crisis_is_checked_before_rag(monkeypatch):
    fake = use_fake_pipeline(monkeypatch, RagAnswer(answer_type="answer", answer="RAG 답변"))
    assert ask("요즘 너무 죽고 싶어").json()["answer_type"] == "safety"
    assert fake.questions == []  # 위기 질문은 RAG(유료 API)를 부르지 않는다


def test_rag_build_failure_returns_temporary_message(monkeypatch):
    """패키지 미설치·API 키 없음 등으로 파이프라인을 못 만들면 500 대신 안내 문구."""
    monkeypatch.setattr(config, "RAG_ENABLED", True)
    monkeypatch.setattr(answer_service, "_pipeline", None)

    def broken(*args, **kwargs):
        raise RuntimeError("OPENAI_API_KEY 없음")

    monkeypatch.setattr("app.rag.pipeline.build_pipeline_from_env", broken)
    res = ask("창업 이야기")
    assert res.status_code == 200
    data = res.json()
    assert data["answer_type"] == "no_evidence" and data["has_enough_evidence"] is False
    assert data["answer"] == answer_service.TEMPORARY_ERROR_MESSAGE


# ---------------------------------------------------------------------------
# 위기 신호 판정: 오탐(진로 질문이 위기로 분류)·미탐(위기를 놓침) 문장
# 패턴을 바꿀 때마다 이 테스트가 통과하는지 확인한다.
# ---------------------------------------------------------------------------

NOT_CRISIS = [
    # 띄어쓰기를 지우면 '자해'·'학대' 조각이 생기던 진로 질문들
    "서울시립대학교 전자전기컴퓨터공학부를 가고자 해 관련하여 조언을 줄 선배가 있을까?",
    "디자인을 배우고자 해요",
    "창업을 하고자해",
    "의학대학 가고 싶어",
    "공학대학원 진학 고민",
    "약학대학 준비",
    "대학원 생활 어때?",
]

CRISIS = [
    "요즘 자해를 해요",
    "자해했어",
    "죽고 싶어",
    "죽고싶다",
    "살기 싫어",
    "그냥 사라지고 싶어",
    "자살 생각이 들어",
    "집에서 학대를 당하고 있어",
    "아동학대 같아",
    "가정에서학대받아",
    "학교에서 폭행당했어",
]


@pytest.mark.parametrize("question", NOT_CRISIS)
def test_career_questions_are_not_crisis(question):
    assert answer_service.looks_like_crisis(question) is False
    assert ask(question).json()["answer_type"] != "safety"


@pytest.mark.parametrize("question", CRISIS)
def test_crisis_questions_are_caught(question):
    assert answer_service.looks_like_crisis(question) is True
    assert ask(question).json()["answer_type"] == "safety"
