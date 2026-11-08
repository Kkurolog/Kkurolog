"""app/rag/chunking.py 테스트: 글 HTML → chunk."""

from app.rag.chunking import chunk_post, group_paragraphs, make_header, parse_blocks


def interview(html: str, **extra) -> dict:
    post = {
        "post_id": "p1",
        "post_type": "interview",
        "title": "t",
        "nickname": "새벽",
        "career_tags": ["창업"],
        "date": "2023-05-10",
        "url": "https://example.com/p1",
        "visibility": "L3",
        "html": html,
    }
    post.update(extra)
    return post


def test_parse_blocks_detects_bold_question():
    blocks = parse_blocks("<p><strong>왜 창업했나요?</strong></p><p>그냥 <b>재밌어서</b>요.</p>")
    assert [b.is_bold for b in blocks] == [True, False]
    assert blocks[1].text == "그냥 재밌어서요."


def test_parse_blocks_skips_script_and_style():
    blocks = parse_blocks("<p>본문</p><script>alert(1)</script><style>p{}</style>")
    assert [b.text for b in blocks] == ["본문"]


def test_interview_splits_by_question_and_keeps_editor_note_separate():
    html = (
        "<p>도입부입니다.</p>"
        "<p><strong>질문 하나?</strong></p><p>답 하나.</p>"
        "<p><strong>질문 둘?</strong></p><p>답 둘.</p><p>답 둘 계속.</p>"
        "<p>편집자 노트: 고마워요.</p>"
    )
    chunks = chunk_post(interview(html))
    assert [c.question for c in chunks] == [None, "질문 하나?", "질문 둘?", None]
    assert chunks[2].content == "답 둘.\n\n답 둘 계속."
    assert chunks[3].content.startswith("편집자 노트")
    assert [c.chunk_index for c in chunks] == [0, 1, 2, 3]
    assert chunks[1].chunk_id == "p1#1"


def test_long_answer_is_split_and_question_repeated():
    para = "가" * 450
    html = "<p><strong>긴 질문?</strong></p>" + f"<p>{para}</p>" * 4
    chunks = chunk_post(interview(html))
    assert len(chunks) >= 2
    assert all(c.question == "긴 질문?" for c in chunks)
    assert all("Q. 긴 질문?" in c.embed_text for c in chunks)


def test_group_paragraphs_never_cuts_inside_paragraph():
    paragraphs = ["a" * 300, "b" * 300, "c" * 1200, "d" * 100]
    groups = group_paragraphs(paragraphs)
    joined = "\n\n".join(groups)
    for p in paragraphs:
        assert p in joined  # 각 문단이 통째로 들어 있다
    assert all(len(g) <= 1300 for g in groups)


def test_letter_splits_at_headings():
    html = "<h2>첫 소제목</h2><p>첫 문단.</p><h2>둘째 소제목</h2><p>둘째 문단.</p>"
    chunks = chunk_post(interview(html, post_type="letter"))
    assert len(chunks) == 2
    assert chunks[0].content.startswith("첫 소제목")
    assert chunks[1].content.startswith("둘째 소제목")


def test_header_hides_name_unless_l3():
    assert make_header(interview("", visibility="L3")) == "[졸업생 인터뷰 | 새벽 | 창업 | 2023-05-10]"
    assert "익명" in make_header(interview("", visibility="L2"))
    chunks = chunk_post(interview("<p>본문</p>", visibility="L1"))
    assert "새벽" not in chunks[0].embed_text
    assert chunks[0].display_name == "창업 경로 졸업생 (익명)"


def test_l0_post_makes_no_chunks():
    assert chunk_post(interview("<p>본문</p>", visibility="L0")) == []


def test_note_marker_before_questions_is_not_treated_as_editor_note():
    """글 앞쪽의 '※' 문단 때문에 뒤의 질문-답변이 전부 노트로 묶이면 안 된다."""
    html = (
        "<p>※ 이 인터뷰는 2020년에 진행했어요.</p>"
        "<p><strong>질문 하나?</strong></p><p>답 하나.</p>"
        "<p><strong>질문 둘?</strong></p><p>답 둘.</p>"
        "<p>편집자 노트: 고마워요.</p>"
    )
    chunks = chunk_post(interview(html))
    assert [c.question for c in chunks] == [None, "질문 하나?", "질문 둘?", None]
    assert chunks[0].content.startswith("※")  # 도입부로 남는다
    assert chunks[1].content == "답 하나."
    assert chunks[3].content.startswith("편집자 노트")  # 끝의 노트는 그대로 노트
