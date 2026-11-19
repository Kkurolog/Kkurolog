"""
태그 우선 검색: "창업한 선배 있어?" 처럼 어떤 길을 간 선배를 찾는 질문은,
글자가 비슷한 글보다 그 길을 실제로 간 선배의 글이 먼저 전달되어야 한다.
(왜: docs/proposals/answer-quality-audit.md 0-3. 창업하지 않은 선배의 글이 창업 질문마다 1등이었다)
"""

import json
from types import SimpleNamespace

from app.rag.config import RagSettings
from app.rag.intent import (
    CAREER_FIELD_TAGS,
    CAREER_PATH_TAGS,
    INTENT_SCHEMA,
    INTENT_SYSTEM_PROMPT,
    ClaudeIntentAnalyzer,
    IntentResult,
)
from app.rag.models import ScoredChunk
from app.rag.pipeline import RagPipeline, pick_posts
from app.rag.store import InMemoryVectorStore
from tests.test_rag_pipeline import FakeEmbedder, FakeGenerator, answer_output, make_chunk


def chunk(source_id, text, paths, fields=()):
    return make_chunk(source_id, 1, text).model_copy(update={"career_paths": list(paths), "career_fields": list(fields)})


# FakeEmbedder 는 '창업·대학·갭이어·포트폴리오' 낱말이 있는지만 본다.
# talker 는 "창업"이라는 말을 가장 많이 하지만 창업하지 않았다. founder 들은 창업했지만 글이 질문과 덜 닮았다.
TALKER = chunk("talker", "창업 창업 이야기", ["employment"])  # 질문 "창업" 과 완전히 같은 방향 (유사도 1.0)
FOUNDER_A = chunk("founderA", "창업 대학", ["startup"], ["design_art"])  # 0.71
FOUNDER_B = chunk("founderB", "창업 대학 갭이어", ["startup"], ["dev_it"])  # 0.58
OTHER = chunk("other", "창업 포트폴리오", ["internship"])  # 0.71
CHUNKS = [TALKER, FOUNDER_A, FOUNDER_B, OTHER]


def pipeline(**settings):
    gen = FakeGenerator(answer_output(["founderA-01"]))
    s = RagSettings(similarity_floor=0.5, **settings)
    return RagPipeline(FakeEmbedder(), InMemoryVectorStore(CHUNKS), gen, s), gen


def career(paths=(), fields=()):
    return IntentResult(intent="career_question", career_paths=list(paths), career_fields=list(fields))


# ---- 저장소: 태그로 거르기 ----


def test_store_filters_by_tag():
    store = InMemoryVectorStore(CHUNKS)
    vector = FakeEmbedder().embed(["창업"])[0]
    assert [h.chunk.source_id for h in store.search(vector, 10)][0] == "talker"
    assert {h.chunk.source_id for h in store.search(vector, 10, career_paths=["startup"])} == {"founderA", "founderB"}
    # 두 종류를 함께 주면 둘 다 맞아야 한다
    both = store.search(vector, 10, career_paths=["startup"], career_fields=["dev_it"])
    assert [h.chunk.source_id for h in both] == ["founderB"]
    assert store.search(vector, 10, career_paths=["freelance"]) == []


# ---- 글 고르기: 태그가 맞는 선배의 글에 자리를 먼저 준다 ----


def test_pick_posts_reserves_seats_for_tagged_posts():
    hits = [
        ScoredChunk(chunk=TALKER, score=1.0),
        ScoredChunk(chunk=OTHER, score=0.71),
        ScoredChunk(chunk=FOUNDER_A, score=0.70),
        ScoredChunk(chunk=FOUNDER_B, score=0.58),
    ]
    tagged = {"founderA", "founderB"}
    assert pick_posts(hits, 3) == ["talker", "other", "founderA"]  # 태그를 안 쓰면 점수 순
    assert pick_posts(hits, 3, tagged, reserved=2) == ["founderA", "founderB", "talker"]
    assert pick_posts(hits, 3, tagged, reserved=1) == ["founderA", "talker", "other"]
    # 태그가 맞는 글이 자리보다 적으면 남은 자리는 점수 순으로 채운다
    assert pick_posts(hits, 3, {"founderB"}, reserved=2) == ["founderB", "talker", "other"]


# ---- 흐름: 질문에서 뽑은 태그가 검색에 쓰인다 ----


def test_tagged_people_come_first_when_intent_has_tags():
    p, gen = pipeline(max_posts=2)
    p.answer("창업")  # 의도 분석기가 없으면 예전처럼 점수 순
    assert [d.source_id for d in gen.calls[-1][1]] == ["talker", "founderA"]

    found = p.retrieve("창업", career(paths=["startup"]))
    assert found.tagged_sources == {"founderA", "founderB"}
    docs = p.build_context(found)
    assert [d.source_id for d in docs] == ["founderA", "founderB"]  # 창업한 선배 둘이 먼저


def test_tagged_chunks_are_found_even_below_the_normal_floor():
    """태그가 맞는 선배의 글은 점수가 낮아도 찾는다 (짧은 질문은 점수가 전체적으로 낮게 나온다)."""
    p, _ = pipeline(max_posts=3)
    p.settings.similarity_floor = 0.95  # 보통 검색은 talker 만 통과
    found = p.retrieve("창업", career(paths=["startup"]))
    assert [d.source_id for d in p.build_context(found)] == ["founderA", "founderB", "talker"]


def test_no_tags_or_disabled_means_plain_search():
    p, _ = pipeline(max_posts=2)
    plain = p.retrieve("창업", career())
    assert plain.tagged_sources == set() and [d.source_id for d in p.build_context(plain)] == ["talker", "founderA"]

    off, _ = pipeline(max_posts=2, tag_reserved_posts=0)
    found = off.retrieve("창업", career(paths=["startup"]))
    assert found.tagged_sources == set() and [d.source_id for d in off.build_context(found)] == ["talker", "founderA"]


def test_tag_with_no_matching_people_falls_back_to_plain_search():
    p, _ = pipeline(max_posts=2)
    found = p.retrieve("창업", career(paths=["freelance"]))
    assert found.tagged_sources == set()
    assert [d.source_id for d in p.build_context(found)] == ["talker", "founderA"]


# ---- 의도 분석: 태그 뽑기 ----


def analyzer_returning(payload):
    text = json.dumps(payload, ensure_ascii=False)
    response = SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text=text)])
    messages = SimpleNamespace(create=lambda **kwargs: response)
    return ClaudeIntentAnalyzer("claude-haiku-5-5", client=SimpleNamespace(messages=messages))


BASE = {"about_aspect": None, "has_greeting": False, "user_context": None, "confidence": "high"}


def test_analyzer_keeps_known_tags_only_for_career_questions():
    payload = {**BASE, "intent": "career_question", "career_paths": ["startup", "startup", "없는태그"], "career_fields": ["dev_it"]}
    result = analyzer_returning(payload).analyze("개발로 창업한 선배 있어?")
    assert result.career_paths == ["startup"] and result.career_fields == ["dev_it"]

    payload = {**BASE, "intent": "smalltalk", "career_paths": ["startup"], "career_fields": ["dev_it"]}
    result = analyzer_returning(payload).analyze("창업이 뭐야 ㅋㅋ")
    assert result.career_paths == [] and result.career_fields == []


def test_analyzer_accepts_old_shape_without_tags():
    """태그 칸이 없는 응답(예전 모양)도 빈 목록으로 받는다."""
    result = analyzer_returning({**BASE, "intent": "career_question"}).analyze("창업한 선배 있어?")
    assert result.career_paths == [] and result.career_fields == []


def test_prompt_and_schema_list_every_tag_code():
    """태그 목록(코드 상수)과 지시문·출력 형식이 어긋나지 않게 한다. TAGS.md 에 태그를 더하면 세 곳을 같이 고친다."""
    for code in [*CAREER_PATH_TAGS, *CAREER_FIELD_TAGS]:
        assert f'"{code}"' in INTENT_SYSTEM_PROMPT, code
    assert INTENT_SCHEMA["properties"]["career_paths"]["items"]["enum"] == list(CAREER_PATH_TAGS)
    assert INTENT_SCHEMA["properties"]["career_fields"]["items"]["enum"] == list(CAREER_FIELD_TAGS)
    assert "etc" not in CAREER_PATH_TAGS and "etc" not in CAREER_FIELD_TAGS
