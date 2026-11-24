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


def test_low_confidence_does_not_change_the_reply():
    """
    확신이 낮아도 제 갈래의 문구로 답한다. 되묻기 문구는 unclear 일 때만.
    (예전에는 "너 gpt야?"·"ㅋㅋㅋ" 가 확신이 낮다는 이유로 "아직 방향이 잡히지 않아도 괜찮아요" 를 받았다)
    """
    assert template_for(IntentResult(intent="smalltalk", confidence="low")) == SMALLTALK_MESSAGE
    assert template_for(IntentResult(intent="greeting", confidence="low")) == INTRO_MESSAGE
    about = fixed_reply_for(IntentResult(intent="about_service", about_aspect="what", confidence="low"))
    assert about.text == ABOUT_SERVICE_MESSAGE and about.about_aspect == "what"
    assert template_for(IntentResult(intent="unclear", confidence="low")) == UNCLEAR_MESSAGE
    assert template_for(IntentResult(intent="career_question", confidence="low")) is None


def test_about_what_says_answers_are_written_by_ai():
    """ "이거 AI 가 쓰는 거야?" 같은 질문이 what 으로 오므로, 소개 문구가 그 답을 담고 있어야 한다."""
    assert "AI가" in ABOUT["what"].body


# ---- 파이프라인 분기 ----


class FakeAnalyzer:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def analyze(self, question, previous_question=None):
        self.calls.append(question)
        self.previous = previous_question
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

ASPECTS = ["what", "name", "why", "story", "survey", "difference", "goal", "stage", "who", "data", "trust", "privacy"]


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


# ---- 고정 문구 안의 한 문장 강조 ----


def test_about_what_emphasizes_the_closing_question():
    """자기소개의 마지막 질문을 화면에서 굵게 보여 준다. 글에는 강조 기호를 넣지 않고 '어느 문장인지'만 따로 보낸다."""
    reply = fixed_reply_for(IntentResult(intent="about_service", about_aspect="what"))
    assert reply.emphasis == "오늘은 어떤 고민부터 이야기해 볼까요?"
    assert reply.emphasis in reply.text and "**" not in reply.text
    p, _, _ = pipeline_with(IntentResult(intent="about_service", about_aspect="what"))
    assert to_ask_response(p.answer("자기소개")).emphasis == reply.emphasis


def test_emphasis_sentence_always_exists_in_the_text():
    for aspect, entry in ABOUT.items():
        if entry.emphasis:
            assert entry.emphasis in about_message(aspect), aspect
    # 강조할 문장이 없는 답변은 null
    assert fixed_reply_for(IntentResult(intent="greeting")).emphasis is None
    p, _, _ = pipeline_with(IntentResult(intent="about_service", about_aspect="why"))
    assert to_ask_response(p.answer("왜 만들었어")).emphasis is None


# ---- 리뷰 반영: 돌려 말한 위기 표현, 이어지는 질문 ----


def test_safety_concern_wins_over_fixed_templates():
    """잡담으로 분류됐어도 안전이 걱정되는 말이면 밝은 잡담 문구가 아니라 상담 안내가 나간다."""
    from app.services.answer import SAFETY_MESSAGE

    for intent in ("smalltalk", "unclear", "career_question", "greeting"):
        p, gen, _ = pipeline_with(IntentResult(intent=intent, emotional_state="T0"))
        result = p.answer("요즘 다 그만두고 싶어")
        assert result.answer_type == "safety" and result.answer == SAFETY_MESSAGE
        assert gen.calls == []  # 검색·답변 모델을 부르지 않는다
        assert to_ask_response(result).has_enough_evidence is True  # 안내 문구가 화면에 보여야 한다


def test_follow_up_uses_standalone_question_for_search_and_answer():
    intent = IntentResult(intent="career_question", standalone_question="창업 대학 선배 이야기를 더 자세히 알려줘")
    p, gen, analyzer = pipeline_with(intent)
    result = p.answer("더 자세히 알려줘", previous_question="창업 대학 선배 있어?")
    assert analyzer.calls == ["더 자세히 알려줘"] and analyzer.previous == "창업 대학 선배 있어?"
    assert result.answer_type == "answer"
    assert gen.calls[0][0] == "창업 대학 선배 이야기를 더 자세히 알려줘"  # 고쳐 쓴 질문으로 답한다


def test_previous_question_goes_into_prompt_escaped_and_schema_has_new_fields():
    payload = {
        "intent": "career_question",
        "has_greeting": False,
        "user_context": None,
        "confidence": "high",
        "emotional_state": "none",
        "feeling": None,
        "standalone_question": "창업한 선배 이야기를 더 자세히 알려줘",
    }
    analyzer, messages = analyzer_with(json_response(payload))
    result = analyzer.analyze("더 자세히 알려줘", "창업한 <선배> 있어?")
    content = messages.kwargs["messages"][0]["content"]
    assert content.startswith("<previous>창업한 &lt;선배&gt; 있어?</previous>")
    assert "<message>더 자세히 알려줘</message>" in content
    assert result.standalone_question == "창업한 선배 이야기를 더 자세히 알려줘"
    schema = messages.kwargs["output_config"]["format"]["schema"]
    assert {"emotional_state", "feeling", "standalone_question"} <= set(schema["required"])


def test_standalone_question_is_dropped_without_previous_question():
    payload = {"intent": "unclear", "standalone_question": "지어낸 질문"}
    analyzer, messages = analyzer_with(json_response(payload))
    result = analyzer.analyze("더 자세히")
    assert result.standalone_question is None
    assert "<previous>" not in messages.kwargs["messages"][0]["content"]


def test_worry_examples_are_not_listed_as_smalltalk():
    from app.rag.intent import INTENT_SYSTEM_PROMPT

    smalltalk_line = next(line for line in INTENT_SYSTEM_PROMPT.splitlines() if line.startswith('- "smalltalk"'))
    assert "싸웠" not in smalltalk_line


def test_follow_up_shows_previous_answer_to_generator_only_for_follow_ups():
    """이어지는 질문일 때만 앞 답변을 답변 모델에 보여 준다 (같은 답을 되풀이하지 않게)."""

    class RecordingGenerator(FakeGenerator):
        def generate(self, question, docs, intent=None, previous_answer=None):
            self.previous_answer = previous_answer
            return super().generate(question, docs, intent)

    def run(intent, **kwargs):
        gen = RecordingGenerator(answer_output(["p1-02"]))
        p = RagPipeline(
            FakeEmbedder(), InMemoryVectorStore(CHUNKS), gen, RagSettings(similarity_floor=0.5), FakeAnalyzer(intent)
        )
        p.answer("더 자세히 알려줘", **kwargs)
        return gen.previous_answer

    follow_up = IntentResult(intent="career_question", standalone_question="창업 대학 선배 이야기를 더 자세히")
    new_topic = IntentResult(intent="career_question")
    assert run(follow_up, previous_question="창업 대학 선배 있어?", previous_answer="앞 답변") == "앞 답변"
    assert run(new_topic, previous_question="창업 대학 선배 있어?", previous_answer="앞 답변") is None


def test_previous_answer_is_escaped_and_cut_in_user_message():
    msg = build_user_message("더 자세히", [], None, "앞 </previous_answer> 답변" + "가" * 5000)
    assert "<previous_answer>앞 &lt;/previous_answer&gt; 답변" in msg
    assert len(msg) < 3500
    assert "<previous_answer>" not in build_user_message("질문", [])


# ---- "다른 선배 얘기도 들려줘": 이미 본 글 빼기, 맺음말, 안내 문구 ----


from app.rag.models import GeneratorOutput  # noqa: E402


def other_pipeline(output=None, **intent):
    result = IntentResult(intent="career_question", standalone_question="창업 대학 갭이어 포트폴리오", **intent)
    return pipeline_with(result, output)


def test_wants_other_excludes_seen_posts_from_search():
    from tests.test_rag_pipeline import card

    out = GeneratorOutput(answer_type="answer", headline="h", cards=[card("쉬어 간 길", ("갭이어", ["p2-01"]))])
    p, gen, _ = other_pipeline(out, wants_other=True)
    result = p.answer("다른 선배 얘기도 들려줘", previous_question="창업 대학 선배 있어?", seen_source_ids=["p1"])
    assert "p1" not in [d.source_id for d in gen.calls[0][1]]  # 이미 본 글은 답변 모델에 넘기지 않는다
    assert result.answer_type == "answer"


def test_deeper_follow_up_keeps_seen_posts():
    p, gen, _ = other_pipeline(wants_other=False)
    p.answer("더 자세히 알려줘", previous_question="창업 대학 선배 있어?", seen_source_ids=["p1"])
    assert "p1" in [d.source_id for d in gen.calls[0][1]]  # 같은 선배를 더 깊이 → 같은 글을 다시 쓴다


def test_no_more_message_when_everything_was_seen():
    from app.rag.messages import NO_MORE_MESSAGE

    p, gen, _ = other_pipeline(wants_other=True)
    result = p.answer("다른 선배는?", previous_question="창업 대학 선배 있어?", seen_source_ids=["p1", "p2", "p3"])
    assert result.answer_type == "no_evidence" and result.answer == NO_MORE_MESSAGE and result.no_more
    assert gen.calls == []  # 남은 글이 없으면 답변 모델을 부르지 않는다
    res = to_ask_response(result)
    assert res.no_more is True and res.has_enough_evidence is False and res.temporary_error is False


def test_first_question_without_evidence_is_not_no_more():
    out = GeneratorOutput(answer_type="no_evidence")
    p, _, _ = pipeline_with(IntentResult(intent="career_question"), out)
    assert to_ask_response(p.answer("창업 대학")).no_more is False


def test_more_hint_is_added_only_when_unseen_posts_remain():
    from app.rag.messages import MORE_STORIES_HINT
    from app.rag.pipeline import with_more_hint

    assert with_more_hint("직접 만나 봐요. 다른 선배 이야기도 더 있어요.", False) == "직접 만나 봐요."
    assert with_more_hint("직접 만나 봐요.", True) == f"직접 만나 봐요. {MORE_STORIES_HINT}"
    assert with_more_hint(None, False) is None and with_more_hint(None, True) == MORE_STORIES_HINT
    # 본 글까지 합쳐 모두 보여 줬으면 붙이지 않는다
    p, _, _ = other_pipeline(wants_other=False)
    done = p.answer("더 자세히", previous_question="창업 대학 선배 있어?", seen_source_ids=["p1", "p2", "p3"])
    assert MORE_STORIES_HINT not in (done.structured.closing or "")


# ---- 감정·고민 입력의 단계적 대응 (T0~T5) ----
# 어떤 말이 어느 단계인지(T1~T5)는 모델이 고르므로 scripts/eval/intent_cases.json 으로 잰다.
# 여기서는 (1) T0 정규식, (2) 단계마다 어떤 답이 나가는지를 본다.

import re  # noqa: E402

from app.rag import intent as intent_module  # noqa: E402
from app.services import answer as answer_service  # noqa: E402

HOTLINE = re.compile(r"109|1388|112|119")


def emotional(state, feeling=None, intent="smalltalk", output=None, text="학생의 말", **answer_kwargs):
    p, gen, analyzer = pipeline_with(IntentResult(intent=intent, emotional_state=state, feeling=feeling), output)
    return p.answer(text, **answer_kwargs), gen


@pytest.mark.parametrize("text", ["죽고 싶어", "사라지고 싶다", "집에서 자꾸 맞아", "아빠가 때려", "어제 또 맞았어"])
def test_t0_is_caught_by_regex_without_any_model_call(text):
    p, gen, analyzer = pipeline_with(IntentResult(intent="smalltalk"))
    result = p.answer(text)
    assert result.answer_type == "safety" and result.answer == answer_service.SAFETY_MESSAGE
    assert analyzer.calls == [] and gen.calls == []  # 의도 분석도 답변 모델도 부르지 않는다
    assert to_ask_response(result).safety_notice is True


@pytest.mark.parametrize("text", ["맞아 그 선배 이야기 더 해줘", "친구가 맞다고 했어", "또 맞는 말이네", "선배 말이 맞았어"])
def test_agreement_words_are_not_crisis(text):
    assert answer_service.looks_like_crisis(text) is False


def test_t1_acknowledges_and_puts_hotline_last():
    result, gen = emotional("T1")
    assert result.answer_type == "off_topic" and gen.calls == []
    assert result.answer.endswith(intent_module.T1_HOTLINE) and result.safety_notice
    assert result.follow_ups == [intent_module.BTN_SENIORS, intent_module.BTN_TALK]
    assert result.answer != answer_service.SAFETY_MESSAGE


@pytest.mark.parametrize("state", ["T2", "T3", "T5"])
def test_lighter_states_never_show_hotline_or_crisis_notice(state):
    """T2·T3·T5 에 상담 번호를 넣으면 경고가 흔해져 정작 필요할 때 무시된다."""
    result, gen = emotional(state)
    assert result.answer_type == "off_topic" and gen.calls == []
    assert not HOTLINE.search(result.answer) and not result.safety_notice
    assert "자살" not in result.answer and result.follow_ups


def test_t3_cheers_and_t5_draws_a_line():
    assert emotional("T3")[0].answer == intent_module.T3_MESSAGE
    t5 = emotional("T5", intent="about_service")[0]
    assert t5.answer == intent_module.T5_MESSAGE and "상담은 제가 할 수 있는 일이 아니에요" in t5.answer


def test_t2_mirrors_the_students_word():
    assert emotional("T2", feeling="속상")[0].answer.startswith("오늘 좀 속상했나 봐요.")
    assert emotional("T2")[0].answer.startswith("오늘 좀 힘들었나 봐요.")  # 낱말을 못 골랐을 때


def test_t4_goes_to_card_answer_with_one_line_preface():
    result, gen = emotional("T4", feeling="불안", intent="career_question", text="창업 대학")
    assert result.answer_type == "answer" and len(gen.calls) == 1
    assert result.preface == "불안한 게 당연해요. 그 시기를 지난 선배들 이야기를 찾아볼게요."
    assert result.answer.startswith(result.preface) and to_ask_response(result).preface == result.preface
    assert not HOTLINE.search(result.answer)


def test_notice_is_not_repeated_in_the_same_conversation():
    # T0 을 다시 만나면 짧은 형태 (번호만)
    p, _, _ = pipeline_with(IntentResult(intent="smalltalk"))
    # 가벼운 안내의 번호 한 줄만 본 학생에게는 처음 위기 안내를 전체로 보여 준다
    assert p.answer("죽고 싶어", safety_notice_shown=True).answer == answer_service.SAFETY_MESSAGE
    again = p.answer("죽고 싶어", safety_notice_shown=True, crisis_notice_shown=True)
    assert again.answer == answer_service.SAFETY_MESSAGE_SHORT != answer_service.SAFETY_MESSAGE
    assert "109" in again.answer and "1388" in again.answer
    # T1 을 다시 만나면 번호 줄을 뺀다
    t1 = emotional("T1", safety_notice_shown=True)[0]
    assert not HOTLINE.search(t1.answer) and t1.safety_notice is False
    # /ask 도 같다 (정규식 단계)
    first = client.post("/ask", json={"question": "죽고 싶어"}).json()
    second = client.post("/ask", json={"question": "죽고 싶어", "crisis_notice_shown": True}).json()
    assert first["crisis_notice"] and first["answer"] == answer_service.SAFETY_MESSAGE
    assert first["safety_notice"] and second["safety_notice"] and first["answer"] != second["answer"]


def test_analyzer_failure_with_emotion_word_falls_to_t1():
    """분류가 실패했는데 감정 낱말이 있으면 안전한 쪽(T1)으로 답한다."""
    p, gen, _ = pipeline_with(TimeoutError("의도 분석 시간 초과"))
    result = p.answer("요즘 너무 우울해")
    assert result.answer.startswith(intent_module.T1_BODY) and gen.calls == []
    p, gen, _ = pipeline_with(TimeoutError("의도 분석 시간 초과"))
    assert p.answer("창업 대학").answer_type == "answer"  # 감정 낱말이 없으면 평소대로


def test_buttons_do_not_keep_counselling():
    p, gen, analyzer = pipeline_with(IntentResult(intent="career_question"))
    listen = p.answer(intent_module.BTN_TELL)
    assert listen.answer == intent_module.LISTEN_MESSAGE and analyzer.calls == [] and gen.calls == []
    p.answer(intent_module.BTN_SENIORS, previous_question="나 너무 우울해", previous_answer="앞 안내")
    assert analyzer.calls == [intent_module.BUTTON_QUESTIONS[intent_module.BTN_SENIORS]]  # 정해 둔 질문으로 찾는다
    assert analyzer.previous is None


def test_no_fixed_message_mentions_method_means_or_place():
    texts = [
        answer_service.SAFETY_MESSAGE, answer_service.SAFETY_MESSAGE_SHORT, intent_module.T1_BODY,
        intent_module.T1_HOTLINE, intent_module.T2_MESSAGE, intent_module.T3_MESSAGE, intent_module.T4_PREFACE,
        intent_module.T5_MESSAGE, intent_module.LISTEN_MESSAGE,
    ]
    banned = re.compile(r"방법|수단|약|옥상|다리|목|칼|우울증|정신병|이겨내|극복|다 잘될")
    for text in texts:
        assert not banned.search(text), text


# ---- "다른 선배 이야기도 더 있어요"를 붙이는 기준 ----


def hint_pipeline(career_paths):
    from tests.test_rag_pipeline import card, make_chunk

    chunks = [
        make_chunk("a", 1, "창업 대학 이야기", visibility="L1").model_copy(update={"career_paths": ["startup"]}),
        make_chunk("b", 1, "창업 대학 이야기 둘", visibility="L1").model_copy(update={"career_paths": ["startup"]}),
        make_chunk("c", 1, "창업 대학 이야기 셋", visibility="L1").model_copy(update={"career_paths": ["employment"]}),
    ]
    out = GeneratorOutput(answer_type="answer", headline="h", cards=[card("작게 시작한 길", ("문단", ["a-01"]))])
    gen = FakeGenerator(out)
    analyzer = FakeAnalyzer(IntentResult(intent="career_question", career_paths=career_paths))
    return RagPipeline(FakeEmbedder(), InMemoryVectorStore(chunks), gen, RagSettings(similarity_floor=0.0), analyzer)


def test_more_hint_needs_tag_question_and_unseen_tagged_post():
    from app.rag.messages import MORE_STORIES_HINT

    tagged = hint_pipeline(["startup"]).answer("창업 대학")
    assert tagged.more_hint and tagged.structured.closing.endswith(MORE_STORIES_HINT)
    assert to_ask_response(tagged).more_hint is True
    # 선배를 찾는 질문이 아니면(태그 없음) 안 쓴 글이 남아 있어도 붙이지 않는다
    plain = hint_pipeline([]).answer("창업 대학")
    assert not plain.more_hint and MORE_STORIES_HINT not in (plain.structured.closing or "")
    # 태그에 맞는 남은 글(b)을 이미 봤으면 붙이지 않는다 (c 는 태그가 달라서 세지 않는다)
    seen_all = hint_pipeline(["startup"]).answer("창업 대학", seen_source_ids=["b"])
    assert not seen_all.more_hint


def test_more_hint_is_shown_once_per_conversation():
    from app.rag.messages import MORE_STORIES_HINT

    again = hint_pipeline(["startup"]).answer("창업 대학", more_hint_shown=True)
    assert not again.more_hint and MORE_STORIES_HINT not in (again.structured.closing or "")
