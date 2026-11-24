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


def test_nickname_only_for_l3_card():
    result = run(
        [
            card("창업 뒤 대학에 간 길", ("창업을 먼저 했대요.", ["p1-02"])),  # L3
            card("쉬어 가며 찾은 길", ("갭이어를 보냈대요.", ["p2-01"])),  # L1
            card("작품을 모은 길", ("포트폴리오를 만들었대요.", ["p3-01"])),  # L2
        ]
    )
    assert [c.nickname for c in result.structured.cards] == ["새벽", None, None]
    # 별명이 없어도 카드는 그대로 보여 준다
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
        "1. 새벽 선배 · 창업 뒤 대학에 간 길\n창업 뒤 대학에 간 길 한 줄\n창업을 먼저 했대요.\n(2023년 5월, 「p1 제목」)",
        "2. 쉬어 가며 찾은 길\n쉬어 가며 찾은 길 한 줄\n갭이어를 보냈대요.\n(2023년 5월 글)",
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
