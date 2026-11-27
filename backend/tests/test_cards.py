"""카드형 답변 조립 (app/rag/cards.py): 조각별 근거 검증, 카드별 출처, 별명 규칙, 글로 풀어 쓰기."""

from app.avatars import avatar_id_for_key, avatar_ids_without_repeats
from app.rag.adapter import to_ask_response
from app.rag.cards import MAX_CARDS, avatar_id_for, compose_text, fill_headline, format_when
from app.rag.config import RagSettings
from app.rag.messages import NO_EVIDENCE_MESSAGE
from app.rag.models import GeneratorOutput
from app.rag.pipeline import RagPipeline
from app.rag.store import InMemoryVectorStore
from tests.test_rag_pipeline import CHUNKS, FakeEmbedder, FakeGenerator, card, make_chunk

# CHUNKS: p1(L3, 별명 '새벽', 2023-05-10) / p2(L1) / p3(L2). 모두 person_id 가 같다 (같은 사람의 글 3개)
QUESTION = "창업 대학 갭이어 포트폴리오"  # p1·p2·p3 이 모두 검색되는 질문


def run(cards, chunks=CHUNKS, headline="선배들의 길이 달랐어요.", **output):
    gen = FakeGenerator(GeneratorOutput(answer_type="answer", headline=headline, cards=cards, **output))
    p = RagPipeline(FakeEmbedder(), InMemoryVectorStore(chunks), gen, RagSettings(similarity_floor=0.5))
    return p.answer(QUESTION)


def test_each_card_gets_only_its_own_sources():
    result = run(
        [
            card("창업 뒤 대학에 간 길", ("창업을 먼저 했대요.", ["p1-02"]), ("나중에 대학에 갔대요.", ["p1-03"])),
            card("쉬어 가며 찾은 길", ("갭이어를 보냈대요.", ["p2-01"])),
        ],
        compare="바로 뛰어든 길과 쉬어 간 길로 나뉘어요.",
    )
    res = to_ask_response(result).structured
    assert [c.id for c in res.cards] == ["card-1", "card-2"]
    assert [[s.interview_id for s in c.sources] for c in res.cards] == [["p1"], ["p2"]]  # 카드마다 자기 글만
    assert res.cards[0].body == ["창업을 먼저 했대요.", "나중에 대학에 갔대요."]
    assert res.compare == "바로 뛰어든 길과 쉬어 간 길로 나뉘어요."
    # 답변 전체의 출처는 카드들의 출처를 모은 것
    assert [s.interview_id for s in to_ask_response(result).sources] == ["p1", "p2"]


def test_piece_without_valid_citation_is_dropped():
    result = run(
        [
            card(
                "창업 뒤 대학에 간 길",
                ("창업을 먼저 했대요.", ["p1-02"]),
                ("근거를 안 단 조각", []),
                ("없는 id 를 단 조각", ["p9-99"]),
                ("   ", ["p1-02"]),
            )
        ]
    )
    assert result.structured.cards[0].body == ["창업을 먼저 했대요."]
    assert [s.chunk_id for s in result.sources] == ["p1-02"]


def test_card_with_no_surviving_piece_is_dropped_and_compare_needs_two_cards():
    result = run(
        [
            card("창업 뒤 대학에 간 길", ("창업을 먼저 했대요.", ["p1-02"])),
            card("근거 없는 길", ("지어낸 이야기", ["p9-99"])),
        ],
        compare="두 길이 달라요.",
    )
    assert [c.label for c in result.structured.cards] == ["창업 뒤 대학에 간 길"]
    assert result.structured.compare is None  # 카드가 한 장만 남으면 비교 문장을 뺀다


def test_zero_cards_becomes_no_evidence():
    result = run([card("근거 없는 길", ("지어낸 이야기", ["p9-99"]))])
    assert result.answer_type == "no_evidence" and result.answer == NO_EVIDENCE_MESSAGE
    assert result.structured is None and result.sources == []
    assert to_ask_response(result).structured is None


def test_more_than_max_cards_are_cut():
    cards = [card(f"길 {n}", ("창업을 먼저 했대요.", ["p1-02"])) for n in range(MAX_CARDS + 2)]
    assert len(run(cards).structured.cards) == MAX_CARDS


# ---- 별명: L3 만 보여 준다. 실명·내부 ID 는 응답에 없다 ----


def test_cards_show_senior_labels_never_nicknames():
    result = run(
        [
            card("창업 뒤 대학에 간 길", ("창업을 먼저 했대요.", ["p1-02"])),  # L3
            card("쉬어 가며 찾은 길", ("갭이어를 보냈대요.", ["p2-01"])),  # L1
            card("작품을 모은 길", ("포트폴리오를 만들었대요.", ["p3-01"])),  # L2
        ]
    )
    # 별명은 공개 등급과 상관없이 보여 주지 않는다. 화면에 나오는 순서대로 '선배 A/B/C' 라벨이 붙는다
    assert [c.nickname for c in result.structured.cards] == [None, None, None]
    assert [c.senior_label for c in result.structured.cards] == ["선배 A", "선배 B", "선배 C"]
    res = to_ask_response(result)
    assert [c.senior_label for c in res.structured.cards] == ["선배 A", "선배 B", "선배 C"]
    assert [s.senior_label for s in res.sources] == ["선배 A", "선배 B", "선배 C"]  # 출처도 같은 라벨
    assert "새벽" not in res.model_dump_json()  # 별명은 응답 어디에도 없다
    assert res.answer_format == "cards"
    assert [c.label for c in result.structured.cards] == ["창업 뒤 대학에 간 길", "쉬어 가며 찾은 길", "작품을 모은 길"]


def test_card_mixing_public_and_anonymous_chunks_has_no_nickname():
    """L3 글과 익명 글을 한 카드에 섞어 쓰면 별명을 붙이지 않는다 (익명 글의 주인이 드러난다)."""
    result = run([card("섞인 길", ("창업을 먼저 했대요.", ["p1-02"]), ("갭이어를 보냈대요.", ["p2-01"]))])
    assert result.structured.cards[0].nickname is None


def test_same_nickname_for_different_people_is_hidden():
    """별명은 식별자가 아니다. 서로 다른 사람이 같은 별명으로 함께 나오면, 구분할 정보가 없어 둘 다 가린다."""
    other = make_chunk("p4", 1, "갭이어 이야기").model_copy(update={"person_id": "p-other"})
    result = run(
        [
            card("창업 뒤 대학에 간 길", ("창업을 먼저 했대요.", ["p1-02"])),
            card("쉬어 가며 찾은 길", ("갭이어를 보냈대요.", ["p4-01"])),
        ],
        chunks=[*CHUNKS[:3], other],  # p1 글 + 다른 사람의 p4 글
    )
    assert [c.nickname for c in result.structured.cards] == [None, None]


def test_response_never_contains_internal_ids_or_anonymous_nickname():
    result = run(
        [
            card("쉬어 가며 찾은 길", ("갭이어를 보냈대요.", ["p2-01"])),  # L1: 별명 '새벽' 이 나가면 안 된다
            card("작품을 모은 길", ("포트폴리오를 만들었대요.", ["p3-01"])),  # L2
        ]
    )
    body = to_ask_response(result).model_dump_json()
    assert "새벽" not in body and "p-saebyeok" not in body and "person_id" not in body
    assert "제목" not in body and "example.com" not in body  # 익명 글의 제목·원문 주소도 없다


# ---- 글로 풀어 쓰기 (카드를 못 그리는 화면용 answer) ----


def test_compose_text_has_title_pieces_and_per_card_source():
    result = run(
        [
            card("창업 뒤 대학에 간 길", ("창업을 먼저 했대요.", ["p1-02"])),
            card("쉬어 가며 찾은 길", ("갭이어를 보냈대요.", ["p2-01"])),
        ],
        compare="두 길이 달라요.",
        closing="궁금한 선배에게 더 물어봐요.",
    )
    text = compose_text(result.structured)
    assert text == result.answer
    assert text.split("\n\n") == [
        "선배들의 길이 달랐어요.",
        "두 길이 달라요.",
        "1. 선배 A · 창업 뒤 대학에 간 길\n[2023년 인터뷰] 창업 뒤 대학에 간 길 한 줄\n창업을 먼저 했대요.\n(2023년 5월, 「p1 제목」)",
        "2. 선배 B · 쉬어 가며 찾은 길\n[2023년 인터뷰] 쉬어 가며 찾은 길 한 줄\n갭이어를 보냈대요.\n(2023년 5월 글)",
        "궁금한 선배에게 더 물어봐요.",  # 선배를 찾는 질문(태그)이 아니면 "더 있어요"를 붙이지 않는다
    ]


def test_format_when():
    assert format_when("2024-11-06") == "2024년 11월"
    assert format_when("2022") == "2022년"
    assert format_when(None) is None and format_when("미상") is None


# ---- 선배 수는 코드가 센다 / 인사 / 지금 상태 한 줄 / 아바타 ----


def test_headline_count_is_filled_by_code_after_validation():
    """Claude 는 {n} 만 쓰고, 근거 검증에서 살아남은 카드 수를 코드가 넣는다."""
    result = run(
        [
            card("창업 뒤 대학에 간 길", ("창업을 먼저 했대요.", ["p1-02"])),
            card("근거 없는 길", ("지어낸 이야기", ["p9-99"])),  # 버려진다
            card("쉬어 가며 찾은 길", ("갭이어를 보냈대요.", ["p2-01"])),
        ],
        headline="창업 경험이 있는 선배가 {n}명 있어요.",
    )
    assert result.structured.headline == "창업 경험이 있는 선배가 2명 있어요."
    assert result.answer.startswith("창업 경험이 있는 선배가 2명 있어요.")


def test_fill_headline_adds_greeting_only_when_student_greeted():
    assert fill_headline("선배가 {n}명 있어요.", 3, greeted=True) == "안녕하세요! 선배가 3명 있어요."
    assert fill_headline("선배가 {n}명 있어요.", 1, greeted=False) == "선배가 1명 있어요."
    assert fill_headline("  ", 2, greeted=True) == ""


def test_one_liner_is_optional():
    cards = [card("창업 뒤 대학에 간 길", ("창업을 먼저 했대요.", ["p1-02"])).model_copy(update={"one_liner": None})]
    result = run(cards)
    assert result.structured.cards[0].one_liner is None
    assert to_ask_response(result).structured.cards[0].one_liner is None
    assert "None" not in result.answer


def test_avatar_is_stable_per_person_and_hides_internal_id():
    first = run([card("창업 뒤 대학에 간 길", ("창업을 먼저 했대요.", ["p1-02"]))]).structured.cards[0]
    again = run([card("다른 제목", ("나중에 대학에 갔대요.", ["p1-03"]))]).structured.cards[0]
    assert first.avatar_id == again.avatar_id  # 같은 선배는 어느 답변에서든 같은 아바타
    assert first.avatar_id in {f"avatar-{n}" for n in range(1, 8)}
    # 사람 정보가 없으면 글번호로 정한다
    orphan = make_chunk("p7", 1, "창업 이야기").model_copy(update={"person_id": ""})
    assert avatar_id_for(orphan) in {f"avatar-{n}" for n in range(1, 8)}


def test_card_keeps_at_most_two_paragraphs_and_only_their_sources():
    """문단은 카드당 2개까지. 넘친 문단은 버리고, 그 문단만 인용한 글은 출처에 붙이지 않는다."""
    result = run([card("작게 바로 시작한 길", ("첫 문단", ["p1-02"]), ("둘째 문단", ["p1-03"]), ("셋째 문단", ["p2-01"]))])
    only = to_ask_response(result).structured.cards[0]
    assert only.body == ["첫 문단", "둘째 문단"]
    assert [s.interview_id for s in only.sources] == ["p1"]


def test_avatars_do_not_repeat_for_different_people_in_one_answer():
    """한 답변 안에서 서로 다른 선배끼리 같은 그림이 나오지 않는다. 같은 선배는 같은 그림."""
    base = avatar_id_for_key("p-saebyeok")
    # 새벽 선배와 원래 번호가 겹치는 다른 사람을 만든다
    clash = next(f"p-other-{i}" for i in range(1000) if avatar_id_for_key(f"p-other-{i}") == base)
    other = make_chunk("p4", 1, "갭이어 이야기").model_copy(update={"person_id": clash})
    cards = run(
        [
            card("창업 뒤 대학에 간 길", ("창업을 먼저 했대요.", ["p1-02"])),
            card("쉬어 가며 찾은 길", ("갭이어를 보냈대요.", ["p4-01"])),
        ],
        chunks=[*CHUNKS[:3], other],
    ).structured.cards
    assert cards[0].avatar_id == base  # 앞 카드 선배는 평소 그림
    assert cards[1].avatar_id != cards[0].avatar_id  # 뒤 카드의 다른 선배는 다른 그림


def test_avatar_ids_without_repeats_rules():
    a, b = "p-a", next(f"p-b{i}" for i in range(1000) if avatar_id_for_key(f"p-b{i}") == avatar_id_for_key("p-a"))
    result = avatar_ids_without_repeats([a, b, a])
    assert result[0] == result[2] == avatar_id_for_key(a)  # 같은 선배는 같은 그림
    assert result[1] != result[0]  # 다른 선배는 다른 그림
    # 서로 다른 선배가 7명까지는 모두 다른 그림
    seven = avatar_ids_without_repeats([f"person-{i}" for i in range(7)])
    assert len(set(seven)) == 7
    # 8명째부터는 겹칠 수밖에 없지만 범위 안의 값이다
    eight = avatar_ids_without_repeats([f"person-{i}" for i in range(8)])
    assert set(eight) <= {f"avatar-{n}" for n in range(1, 8)}


# ---- 정리형 답변 (방법·팁 질문): 선배별 카드 대신 문단 글 ----


def summary_run(pieces, question_type="how_to", cards=(), closing=None, topic_match="direct", headline="멀리 보기보다 오늘 할 일에 집중했대요."):
    from app.rag.intent import IntentResult
    from app.rag.models import CardPiece

    output = GeneratorOutput(
        answer_type="answer",
        headline=headline,
        topic_match=topic_match,
        cards=list(cards),
        summary=[CardPiece(text=t, chunk_ids=i) for t, i in pieces],
        closing=closing,
    )

    class Analyzer:
        def analyze(self, question, previous_question=None):
            return IntentResult(intent="career_question", question_type=question_type)

    p = RagPipeline(FakeEmbedder(), InMemoryVectorStore(CHUNKS), FakeGenerator(output), RagSettings(similarity_floor=0.5), Analyzer())
    return p.answer(QUESTION)


def test_summary_answer_has_paragraphs_no_cards_and_sources_at_bottom():
    result = summary_run([("한 선배는 창업을 먼저 했대요.", ["p1-02"]), ("또 어떤 선배는 쉬어 갔대요.", ["p2-01"])], closing="해 보면 어떨까요?")
    res = to_ask_response(result)
    assert res.answer_type == "answer" and res.structured.cards == []
    assert res.structured.summary == ["한 선배는 창업을 먼저 했대요.", "또 어떤 선배는 쉬어 갔대요."]
    assert [s.interview_id for s in res.sources] == ["p1", "p2"]  # 출처는 응답 전체의 sources 로 (맨 아래에 그린다)
    assert res.sources[0].url  # L3 글은 원문 주소가 있어 링크가 열린다
    # 글로 풀어 쓴 answer: 머리말, 문단들, 맺음말, 출처 순서
    parts = result.answer.split("\n\n")
    assert parts[1:3] == res.structured.summary and parts[3] == "해 보면 어떨까요?" and parts[-1].startswith("(")
    assert "새벽 선배" not in result.answer  # 선배별로 나누지 않으므로 별명 제목이 없다


def test_summary_paragraph_without_valid_citation_is_dropped():
    result = summary_run([("근거 있는 문단", ["p1-02"]), ("근거 없는 문단", ["없는-id"]), ("인용이 빈 문단", [])])
    assert result.structured.summary == ["근거 있는 문단"]
    assert summary_run([("근거 없는 문단", ["없는-id"])]).answer_type == "no_evidence"


def test_summary_keeps_at_most_three_paragraphs():
    result = summary_run([(f"문단 {n}", ["p1-02"]) for n in range(1, 6)])
    assert result.structured.summary == ["문단 1", "문단 2", "문단 3"]


def test_summary_is_used_only_when_intent_asks_for_it():
    """의도 분석이 cards 라고 했으면, 모델이 summary 를 써 와도 카드로 답한다."""
    cards = [card("창업 뒤 대학에 간 길", ("창업을 먼저 했대요.", ["p1-02"]))]
    result = summary_run([("문단", ["p1-02"])], question_type="experience", cards=cards)
    assert result.structured.summary == [] and len(result.structured.cards) == 1
    # summary 를 바랐는데 모델이 카드만 써 왔으면 카드로 답한다 (답이 사라지지 않게)
    fallback = summary_run([], question_type="how_to", cards=cards)
    assert fallback.answer_type == "answer" and len(fallback.structured.cards) == 1


def test_answer_format_hint_goes_to_generator_only_for_summary():
    from app.rag.generator import build_user_message
    from app.rag.intent import IntentResult

    assert "<answer_format>paragraph</answer_format>" in build_user_message("시간관리 팁", [], IntentResult(intent="career_question", question_type="how_to"))
    mixed = build_user_message("창업 선배 이야기랑 팁", [], IntentResult(intent="career_question", question_type="mixed"))
    assert "<answer_format>mixed</answer_format>" in mixed
    compare = build_user_message("대학이 나을까 취업이 나을까", [], IntentResult(intent="career_question", question_type="compare"))
    assert "<question_type>compare</question_type>" in compare and "<answer_format>" not in compare
    assert "<answer_format>" not in build_user_message("창업한 선배 있어?", [], IntentResult(intent="career_question"))
    assert "<answer_format>" not in build_user_message("질문", [])


# ---- 질문 유형별 답의 모양 (A 문단형 / B·C 카드형 / D 혼합형 / F 주제를 직접 다루지 않음 / G 비교형) ----


def test_answer_format_is_reported_in_response():
    paragraph = to_ask_response(summary_run([("선배 A는 창업을 먼저 했대요.", ["p1-02"])]))
    assert paragraph.answer_format == "paragraph" and paragraph.question_type == "how_to"
    cards = [card("창업 뒤 대학에 간 길", ("창업을 먼저 했대요.", ["p1-02"]))]
    mixed = to_ask_response(summary_run([("선배 A는 작게 시작했대요.", ["p1-02"])], question_type="mixed", cards=cards))
    assert mixed.answer_format == "mixed"
    assert mixed.structured.summary == ["선배 A는 작게 시작했대요."] and len(mixed.structured.cards) == 1
    compare = to_ask_response(summary_run([], question_type="compare", cards=cards))
    assert compare.answer_format == "cards" and compare.question_type == "compare"
    # 선배 이야기가 아닌 답(안내 문구)에는 없다
    assert to_ask_response(summary_run([("근거 없는 문단", ["없는-id"])])).answer_format is None


def test_mixed_keeps_one_summary_paragraph_above_cards():
    cards = [card("창업 뒤 대학에 간 길", ("창업을 먼저 했대요.", ["p1-02"]))]
    result = summary_run([("공통 방법 문단", ["p1-02"]), ("둘째 문단", ["p2-01"])], question_type="mixed", cards=cards)
    assert result.structured.summary == ["공통 방법 문단"]
    parts = result.answer.split("\n\n")
    assert parts[1] == "공통 방법 문단" and parts[2].startswith("1. 선배 A · ")  # 글로 풀면 문단이 카드 위


def test_senior_labels_are_renumbered_in_order_of_appearance_and_match_sources():
    """모델은 글 순서대로 받은 라벨(p1=A, p2=B, p3=C)로 쓴다. 답변에 p2·p3 만 쓰였으면 화면에는 A·B 로 다시 붙는다."""
    result = summary_run(
        [("선배 B는 쉬어 갔대요. 선배 C는 작품을 모았대요.", ["p2-01", "p3-01"])],
        headline="선배 B와 선배 C의 방법이 달랐어요.",
        closing="선배 C처럼 해 보면 어떨까요?",
    )
    res = to_ask_response(result)
    assert res.structured.summary == ["선배 A는 쉬어 갔대요. 선배 B는 작품을 모았대요."]
    assert res.structured.headline == "선배 A와 선배 B의 방법이 달랐어요." and res.structured.closing == "선배 A처럼 해 보면 어떨까요?".replace("A", "B")
    assert [(s.interview_id, s.senior_label) for s in res.sources] == [("p2", "선배 A"), ("p3", "선배 B")]
    assert all(s.alumni == s.senior_label for s in res.sources)  # 별명 자리에도 라벨이 나간다


def test_documents_are_given_to_the_model_with_labels_not_nicknames():
    from app.rag.generator import ContextDoc, format_documents

    docs = [ContextDoc(source_id="p1", title="t", display_name="새벽", published_at="2023-05-10", chunks=[]),
            ContextDoc(source_id="p2", title="t", display_name="졸업생 (익명)", published_at=None, chunks=[])]
    text = format_documents(docs)
    assert 'name="선배 A"' in text and 'name="선배 B"' in text and "새벽" not in text


def test_indirect_topic_is_flagged_and_mentors_are_recommended():
    """유형 F: 글이 물은 주제를 직접 다루지 않으면 솔직히 밝힌 답 아래에 멘토도 함께 권한다."""
    indirect = to_ask_response(summary_run(
        [("시간관리를 직접 다룬 이야기는 적어요. 대신 선배 A는 버거울 때 내일 할 일만 생각했대요.", ["p1-02"])],
        topic_match="indirect", headline="시간관리를 직접 다룬 이야기는 적어요.",
    ))
    assert indirect.topic_indirect is True and indirect.show_mentors is True and indirect.mentor_query
    assert indirect.answer_type == "answer" and indirect.structured.summary  # 가까운 이야기는 그대로 전한다
    direct = to_ask_response(summary_run([("선배 A는 창업을 먼저 했대요.", ["p1-02"])]))
    assert direct.topic_indirect is False and direct.show_mentors is False


def test_prompt_forbids_dressing_unrelated_story_as_the_asked_topic():
    """"시간관리 팁 있을까?"에 팀플 이야기가 시간관리 팁으로 포장되지 않게 하는 규칙이 지시문에 있다.
    (실제 답변이 그렇게 나오는지는 모델을 불러야 알 수 있어 scripts 의 유형별 확인으로 본다)"""
    from app.rag.generator import OUTPUT_SCHEMA, SYSTEM_PROMPT

    assert "관련 없는 내용을 그 주제의 방법인 것처럼 꾸미지 않는다" in SYSTEM_PROMPT
    assert "직접 다룬 이야기는 적어요" in SYSTEM_PROMPT and "대신 ~ 이야기가 있어요" in SYSTEM_PROMPT
    assert "조언처럼 바꿔 쓰지 않는다" in SYSTEM_PROMPT and "선배는 2~3명까지만" in SYSTEM_PROMPT
    assert "정답은 없어요" in SYSTEM_PROMPT and "어느 쪽이 낫다고 말하지 않는다" in SYSTEM_PROMPT
    assert OUTPUT_SCHEMA["properties"]["topic_match"]["enum"] == ["direct", "indirect"]
    assert "topic_match" in OUTPUT_SCHEMA["required"]


def test_instead_sentence_is_lifted_to_sub_headline():
    """주제를 직접 다루지 않을 때 "대신 ~ 이야기가 있어요."는 머리말 아래 작은 제목으로 올라가고, 본문에는 남지 않는다."""
    res = to_ask_response(summary_run(
        [("대신 버거울 때 어떻게 버텼는지에 대한 이야기가 있어요. 선배 A는 내일 할 일만 생각했대요.", ["p1-02"])],
        topic_match="indirect", headline="시간관리를 직접 다룬 이야기는 적어요.",
    ))
    assert res.structured.sub_headline == "대신 버거울 때 어떻게 버텼는지에 대한 이야기가 있어요."
    assert res.structured.summary == ["선배 A는 내일 할 일만 생각했대요."]
    assert res.answer.split("\n\n")[1] == res.structured.sub_headline
    # 주제를 직접 다룬 답에는 작은 제목이 없다 ("대신"으로 시작하는 문장이 있어도 건드리지 않는다)
    direct = to_ask_response(summary_run([("대신 선배 A는 쉬어 갔다는 이야기가 있어요. 그랬대요.", ["p1-02"])]))
    assert direct.structured.sub_headline is None and len(direct.structured.summary) == 1


# ---- 인터뷰 연도 배지와 상태(status_short) ----


def test_card_has_interview_year_and_status_short():
    result = run([card("창업 뒤 대학에 간 길", ("창업을 먼저 했대요.", ["p1-02"]))])
    only = to_ask_response(result).structured.cards[0]
    assert only.interview_year == 2023  # p1 은 2023-05-10 글
    assert only.status_short == "창업 뒤 대학에 간 길 한 줄"  # 표에 없는 글은 답변 모델이 쓴 것
    assert only.one_liner == only.status_short  # 예전 화면용 칸에도 같은 값


def test_reviewed_status_short_wins_over_model_text(monkeypatch):
    """사람이 검토한 표(status_short.json)에 있는 글은 답변 모델이 쓴 것 대신 그 값을 쓴다."""
    from app.rag import cards as cards_module

    monkeypatch.setitem(cards_module.STATUS_SHORT, "p1", "대학 재학 · 프로젝트 활동")
    result = run([card("창업 뒤 대학에 간 길", ("창업을 먼저 했대요.", ["p1-02"]))])
    assert result.structured.cards[0].status_short == "대학 재학 · 프로젝트 활동"
    assert "[2023년 인터뷰] 대학 재학 · 프로젝트 활동" in result.answer


def test_status_short_file_follows_the_rules():
    """표에 넣은 값은 15자 이내이고 연도·'기준'·문장 끝맺음이 없다."""
    import re

    from app.rag.cards import STATUS_SHORT_MAX_CHARS, load_status_short

    for source_id, status in load_status_short().items():
        assert len(status) <= STATUS_SHORT_MAX_CHARS, (source_id, status)
        assert not re.search(r"\d{4}|기준|요$|다$", status), (source_id, status)
