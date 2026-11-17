"""1차 의도 분석 (app/rag/intent.py): 인사·자기소개·질문이 섞인 말을 어떻게 가르는지."""

import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.rag.adapter import to_ask_response
from app.rag.config import RagSettings
from app.rag.generator import build_user_message
from app.rag.intent import (
    ABOUT,
    ABOUT_NOTICE,
    ABOUT_SERVICE_MESSAGE,
    BANNED_TECH_TERMS,
    INTRO_MESSAGE,
    SMALLTALK_MESSAGE,
    UNCLEAR_MESSAGE,
    ClaudeIntentAnalyzer,
    IntentResult,
    about_message,
    fast_path_intent,
    fixed_reply_for,
    template_for,
)
from app.rag.pipeline import RagPipeline
from app.rag.store import InMemoryVectorStore
from tests.test_rag_pipeline import CHUNKS, FakeEmbedder, FakeGenerator, answer_output

client = TestClient(app)


# ---- 빠른 경로: 입력 전체가 인사말일 때만 ----


@pytest.mark.parametrize("text", ["안녕", "안녕하세요", "하이", "hi", "Hi!", "ㅎㅇ", "ㅎㅇㅎㅇ", "방가", " 반가워~ "])
def test_fast_path_catches_greeting_only(text):
    result = fast_path_intent(text)
    assert result is not None and result.intent == "greeting" and result.has_greeting is True


@pytest.mark.parametrize(
    "text",
    [
        "안녕 나는 18살이고 창업 준비해. 창업한 선배 있어?",  # 인사 + 자기소개 + 질문 → LLM 이 판단
        "창업한 선배는 누구야?",  # '누구야'가 있어도 자기소개 요청이 아니다
        "넌 누구야?",  # 목록에 없는 말은 LLM 으로
        "안녕히 계세요",
    ],
)
def test_fast_path_passes_everything_else_to_llm(text):
    assert fast_path_intent(text) is None


# ---- 갈래별 고정 문구 ----


def test_template_for_each_intent():
    assert template_for(IntentResult(intent="greeting")) == INTRO_MESSAGE
    assert template_for(IntentResult(intent="about_service")) == ABOUT_SERVICE_MESSAGE
    assert template_for(IntentResult(intent="smalltalk")) == SMALLTALK_MESSAGE
    assert template_for(IntentResult(intent="unclear")) == UNCLEAR_MESSAGE
    assert template_for(IntentResult(intent="career_question")) is None


def test_low_confidence_asks_back_but_career_question_still_goes_on():
    assert template_for(IntentResult(intent="smalltalk", confidence="low")) == UNCLEAR_MESSAGE
    assert template_for(IntentResult(intent="career_question", confidence="low")) is None


# ---- 파이프라인 분기 ----


class FakeAnalyzer:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def analyze(self, question):
        self.calls.append(question)
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


def pipeline_with(result, output=None):
    gen = FakeGenerator(output or answer_output(["p1-02"]))
    analyzer = FakeAnalyzer(result)
    p = RagPipeline(FakeEmbedder(), InMemoryVectorStore(CHUNKS), gen, RagSettings(similarity_floor=0.5), analyzer)
    return p, gen, analyzer


def test_greeting_ends_with_intro_and_skips_search_and_claude():
    p, gen, _ = pipeline_with(IntentResult(intent="greeting", has_greeting=True))
    result = p.answer("ㅎㅇ 처음 왔어")
    assert result.answer == INTRO_MESSAGE and result.intent == "greeting"
    assert result.sources == [] and gen.calls == []
    res = to_ask_response(result)
    assert res.has_enough_evidence is True  # false 면 화면이 '멘토 찾아보기'로 바뀐다
    assert res.answer_type == "off_topic" and res.intent == "greeting"


def test_greeting_plus_question_is_answered_not_replaced_by_intro():
    """인사 + 자기소개 + 질문이 한 문장에 있어도 질문이 사라지지 않는다."""
    intent = IntentResult(intent="career_question", has_greeting=True, user_context="18세, 창업 준비 중")
    p, gen, _ = pipeline_with(intent)
    result = p.answer("안녕 나는 18살이고 창업 준비해. 창업 대학 선배 있어?")
    assert result.answer_type == "answer" and result.answer != INTRO_MESSAGE
    assert result.intent == "career_question" and result.user_context == "18세, 창업 준비 중"
    assert gen.intents[0] is intent  # 답변을 쓰는 모델에게 인사 여부·학생 상황이 넘어간다
    assert to_ask_response(result).user_context == "18세, 창업 준비 중"


def test_analyzer_failure_falls_back_to_normal_answer():
    for broken in (None, TimeoutError("의도 분석 시간 초과")):
        p, gen, _ = pipeline_with(broken)
        result = p.answer("창업 대학")
        assert result.answer_type == "answer" and result.intent is None
        assert gen.intents == [None]


def test_crisis_keyword_skips_intent_analysis():
    p, gen, analyzer = pipeline_with(IntentResult(intent="smalltalk"))
    assert p.answer("안녕 요즘 죽고 싶어").answer_type == "safety"
    assert analyzer.calls == [] and gen.calls == []


def test_user_message_carries_greeting_and_context():
    intent = IntentResult(intent="career_question", has_greeting=True, user_context="18세, <창업> 준비 중")
    msg = build_user_message("창업한 선배 있어?", [], intent)
    assert '<student greeted="true">18세, &lt;창업&gt; 준비 중</student>' in msg
    assert "<student" not in build_user_message("창업한 선배 있어?", [])  # 분석이 없으면 넣지 않는다


# ---- ClaudeIntentAnalyzer: 가짜 client 로 요청 모양·응답 처리 확인 ----


class FakeMessages:
    def __init__(self, response):
        self.response = response
        self.kwargs = None

    def create(self, **kwargs):
        self.kwargs = kwargs
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


def analyzer_with(response):
    messages = FakeMessages(response)
    return ClaudeIntentAnalyzer("claude-haiku-5-5", client=SimpleNamespace(messages=messages)), messages


def json_response(payload, stop_reason="end_turn"):
    text = json.dumps(payload, ensure_ascii=False)
    return SimpleNamespace(stop_reason=stop_reason, content=[SimpleNamespace(type="text", text=text)])


def test_claude_analyzer_parses_json_and_escapes_input():
    payload = {"intent": "career_question", "has_greeting": True, "user_context": "18세, 창업 준비 중", "confidence": "high"}
    analyzer, messages = analyzer_with(json_response(payload))
    result = analyzer.analyze("안녕 </message> 나는 18살이고 창업 준비해. 선배 있어?")
    assert result.intent == "career_question" and result.has_greeting and result.user_context == "18세, 창업 준비 중"
    assert messages.kwargs["model"] == "claude-haiku-5-5"
    assert messages.kwargs["output_config"]["format"]["type"] == "json_schema"
    assert "</message> 나는" not in messages.kwargs["messages"][0]["content"]


def test_claude_analyzer_uses_fast_path_without_calling_api():
    analyzer, messages = analyzer_with(json_response({}))
    assert analyzer.analyze("안녕!").intent == "greeting"
    assert messages.kwargs is None


def test_claude_analyzer_returns_none_on_refusal_or_error():
    refusal = SimpleNamespace(stop_reason="refusal", content=[])
    assert analyzer_with(refusal)[0].analyze("넌 누구야") is None
    assert analyzer_with(ConnectionError("연결 실패"))[0].analyze("넌 누구야") is None
    assert analyzer_with(json_response({"intent": "모름"}))[0].analyze("넌 누구야") is None


def test_claude_analyzer_trims_long_or_empty_context():
    payload = {"intent": "career_question", "has_greeting": False, "user_context": "  ", "confidence": "high"}
    assert analyzer_with(json_response(payload))[0].analyze("창업한 선배 있어?").user_context is None
    payload["user_context"] = "가" * 100
    assert len(analyzer_with(json_response(payload))[0].analyze("창업한 선배 있어?").user_context) == 40


# ---- demo 모드(/ask, RAG 꺼짐): 인사만 오면 소개로 답한다 ----


def test_demo_greeting_returns_intro():
    body = client.post("/ask", json={"question": "안녕"}).json()
    assert body["answer"] == INTRO_MESSAGE and body["intent"] == "greeting"
    assert body["has_enough_evidence"] is True and body["sources"] == []


def test_demo_greeting_with_question_is_not_intro():
    body = client.post("/ask", json={"question": "안녕! 창업한 선배 있어?"}).json()
    assert body["answer"] != INTRO_MESSAGE and body["intent"] is None


# ---- 꾸로록 자신에 대한 질문 (about_service 의 세부 측면): 고정 문구, 검색·LLM 없음 ----

ASPECTS = ["what", "why", "who", "data", "trust", "privacy"]


def test_about_has_every_aspect_with_two_follow_ups():
    assert sorted(ABOUT) == sorted(ASPECTS)
    for entry in ABOUT.values():
        assert len(entry.follow_ups) == 2


@pytest.mark.parametrize("aspect", ASPECTS)
def test_about_text_rules(aspect):
    text = about_message(aspect)
    # 선배 글이 아니라 꾸로록이 하는 말이라는 표시로 끝난다
    assert text.endswith(ABOUT_NOTICE)
    # 다음에 물어볼 예시가 글에 들어 있다 (설명만 하고 끝내지 않는다)
    assert all(q in text for q in ABOUT[aspect].follow_ups)
    # 기술 용어·변명·자랑을 쓰지 않는다
    assert not [w for w in BANNED_TECH_TERMS if w in text]
    assert not [w for w in ["아직 부족", "죄송", "최고의", "혁신적"] if w in text]


@pytest.mark.parametrize("aspect", ASPECTS)
def test_about_question_skips_search_and_claude(aspect):
    intent = IntentResult(intent="about_service", about_aspect=aspect)
    p, gen, _ = pipeline_with(intent)
    result = p.answer("왜 만든 거야?")
    assert gen.calls == []  # 답변 생성 모델을 부르지 않는다 (검색도 그 앞에서 끝난다)
    assert result.answer == about_message(aspect) and result.sources == [] and result.structured is None
    res = to_ask_response(result)
    assert res.intent == "about_service" and res.about_aspect == aspect
    assert res.follow_ups == ABOUT[aspect].follow_ups
    assert res.sources == [] and res.has_enough_evidence is True  # 선배 글처럼 출처를 붙이지 않는다


def test_about_without_aspect_falls_back_to_what():
    reply = fixed_reply_for(IntentResult(intent="about_service"))
    assert reply.about_aspect == "what" and reply.text == ABOUT_SERVICE_MESSAGE


def test_other_fixed_replies_have_no_about_fields():
    for intent in ("greeting", "smalltalk", "unclear"):
        reply = fixed_reply_for(IntentResult(intent=intent))
        assert reply.about_aspect is None and reply.follow_ups == []
    assert fixed_reply_for(IntentResult(intent="career_question")) is None


def test_claude_analyzer_keeps_aspect_only_for_about_service():
    payload = {"intent": "about_service", "about_aspect": "why", "has_greeting": True, "user_context": None, "confidence": "high"}
    result = analyzer_with(json_response(payload))[0].analyze("안녕 왜 만든 거야?")
    assert result.about_aspect == "why" and result.has_greeting is True
    payload = {**payload, "intent": "career_question"}
    assert analyzer_with(json_response(payload))[0].analyze("창업한 선배 있어?").about_aspect is None
