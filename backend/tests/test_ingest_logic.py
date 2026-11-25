"""
인터뷰 넣기의 규칙 부분 테스트 (app/ingest/text.py, draft.py). AI·DB 를 부르지 않는다.
"""

from app.ingest import text as textlib
from app.ingest.draft import AiResult, build_draft, build_rows, embed_text, publish_problems
from app.ingest.models import ImportDraft

RAW = """﻿꾸로록 인터뷰: 두 선배의 이야기\r
에디터 소개: 이번 호에서는 두 졸업생을 만났습니다.\r
\r
Q: 엑시트 후 무엇을 하셨나요?\r
차슈: 바로 스타트업에 들어갔어요.\r
처음엔 무서웠지만 해 보니 재밌더라고요.\r
모모: 저는 1년 동안 여행을 했어요. 연락은 010-1234-5678 로 주세요.\r
Q: 후배에게 한마디\r
차슈: 일단 해 보세요!\r
"""


def ai_result(**changes) -> AiResult:
    data = {
        "source_type": "interview",
        "title": "두 선배의 이야기",
        "date": "2026-11-20",
        "speakers": [
            {"ref": "S1", "role": "interviewer", "label": "Q", "nickname": None, "id_hint": None, "path_summary": None,
             "career_paths": [], "path_detail": [], "career_fields": [], "field_detail": [], "organizations": []},
            {"ref": "S2", "role": "alumni", "label": "차슈", "nickname": "차슈", "id_hint": "Cha Shu!",
             "path_summary": "거캠 엑시트 → 스타트업 취업", "career_paths": ["employment", "not_a_tag"], "path_detail": [],
             "career_fields": ["dev_it"], "field_detail": [], "organizations": []},
            {"ref": "S3", "role": "alumni", "label": "모모", "nickname": "모모", "id_hint": None,
             "path_summary": "거캠 엑시트 → 1년 여행", "career_paths": ["gap_year"], "path_detail": [],
             "career_fields": [], "field_detail": [], "organizations": []},
        ],
        "segments": [
            {"speaker": "S2", "question_start": 4, "question_end": 4, "answer_start": 5, "answer_end": 6,
             "topics": ["current_status", "worry", "advice"], "topic_detail": []},
            {"speaker": "S3", "question_start": 4, "question_end": 4, "answer_start": 7, "answer_end": 7,
             "topics": ["gap_year_is_not_topic"], "topic_detail": []},
            {"speaker": "S2", "question_start": 8, "question_end": 8, "answer_start": 9, "answer_end": 9,
             "topics": ["advice"], "topic_detail": []},
            {"speaker": "S2", "question_start": None, "question_end": None, "answer_start": 50, "answer_end": 60,
             "topics": ["advice"], "topic_detail": []},  # 줄 번호가 범위 밖 → 버림
            {"speaker": "S9", "question_start": None, "question_end": None, "answer_start": 1, "answer_end": 1,
             "topics": [], "topic_detail": []},  # 없는 사람 → 버림
        ],
        "pii": [{"line": 7, "text": "010-1234-5678", "kind": "phone"}, {"line": 99, "text": "x", "kind": "name"}],
        "note": "편집자 소개는 뺐어요",
    }
    data.update(changes)
    return AiResult.model_validate(data)


def make_draft(**changes) -> ImportDraft:
    lines = textlib.lines_of(RAW)
    return build_draft(lines, ai_result(**changes), filename="interview.txt", id_suffix="20261125-abc123", model="test-model")


def confirm_all(draft: ImportDraft) -> ImportDraft:
    draft.pii_checked = True
    for p in draft.people:
        p.confirmed = True
    for c in draft.chunks:
        c.confirmed = True
        if not c.topics:
            c.topics = ["choice_reason"]
    return draft


# ---------------------------------------------------------------- text.py
def test_normalize_and_numbered():
    lines = textlib.lines_of(RAW)
    assert lines[0] == "꾸로록 인터뷰: 두 선배의 이야기"  # BOM·\r 제거
    assert textlib.numbered(lines).splitlines()[3] == "L0004| Q: 엑시트 후 무엇을 하셨나요?"


def test_take_lines_strips_prefixes():
    lines = textlib.lines_of(RAW)
    assert textlib.take_lines(lines, 4, 4, ["차슈"]) == "엑시트 후 무엇을 하셨나요?"
    assert textlib.take_lines(lines, 5, 6, ["차슈"]) == "바로 스타트업에 들어갔어요.\n처음엔 무서웠지만 해 보니 재밌더라고요."
    assert textlib.take_lines(lines, 9, 3, []) == ""  # 뒤집힌 범위


def test_split_long_keeps_paragraphs():
    paragraph = "가" * 600
    parts = textlib.split_long(f"{paragraph}\n\n{paragraph}\n\n짧은 문단")
    assert len(parts) == 2
    assert parts[0] == paragraph
    assert parts[1].endswith("짧은 문단")
    assert textlib.split_long("짧다") == ["짧다"]


def test_find_pii_rules():
    found = textlib.find_pii(["연락처 010-1234-5678, 메일 me@example.com", "2024.12.18 에 만났어요"])
    kinds = {(f["line"], f["kind"]) for f in found}
    assert (1, "phone") in kinds and (1, "email") in kinds
    assert all(f["line"] == 1 for f in found)  # 날짜는 전화번호로 잡지 않는다


# ---------------------------------------------------------------- build_draft
def test_build_draft_people_and_chunks():
    draft = make_draft()
    assert draft.source.title == "두 선배의 이야기"
    assert draft.source.published_at == "2026-11-20"
    chasu = next(p for p in draft.people if p.ref == "S2")
    assert chasu.person_id == "p-cha-shu"
    assert chasu.career_paths == ["employment"]  # 모르는 태그는 버림
    momo = next(p for p in draft.people if p.ref == "S3")
    assert momo.person_id == "p-up-20261125-abc123-3"  # id_hint 가 없으면 업로드 번호로
    interviewer = next(p for p in draft.people if p.ref == "S1")
    assert interviewer.person_id == ""

    assert [c.speaker for c in draft.chunks] == ["S2", "S3", "S2"]  # 이상한 조각 2개는 버림
    first = draft.chunks[0]
    assert first.question == "엑시트 후 무엇을 하셨나요?"
    assert first.content.startswith("바로 스타트업에")  # 원문 그대로 (말머리만 뗌)
    assert first.topics == ["current_status", "worry"]  # 최대 2개
    assert first.ai_topics == first.topics and first.confirmed is False
    assert draft.chunks[1].topics == []  # 모르는 태그만 있으면 비움 → 관리자가 고른다


def test_build_draft_pii_merges_ai_and_rules():
    draft = make_draft()
    phones = [f for f in draft.pii if f.text == "010-1234-5678"]
    assert len(phones) == 1 and phones[0].by == "ai"  # 같은 줄·같은 글자는 한 번만
    assert all(1 <= f.line <= 9 for f in draft.pii)  # 범위 밖 줄은 버림


def test_build_draft_title_fallback_and_bad_date():
    draft = make_draft(title=None, date="2026년 11월")
    assert draft.source.title == "interview"
    assert draft.source.published_at is None


# ---------------------------------------------------------------- publish_problems
def test_publish_problems_until_everything_checked():
    draft = make_draft()
    problems = publish_problems(draft, existing_ids=set())
    assert "개인정보 의심 부분을 확인해 주세요." in problems
    assert any("아직 확인하지 않은 조각이 3개" in p for p in problems)
    assert publish_problems(confirm_all(draft), existing_ids=set()) == []


def test_publish_problems_person_rules():
    draft = confirm_all(make_draft())
    chasu = next(p for p in draft.people if p.ref == "S2")
    assert any("이미 있어요" in p for p in publish_problems(draft, existing_ids={"p-cha-shu"}))
    chasu.person_id = "P-Bad"
    assert any("p- 로 시작" in p for p in publish_problems(draft, existing_ids=set()))
    chasu.link, chasu.person_id = "existing", "p-somebody"
    assert any("연결할 인물을 골라" in p for p in publish_problems(draft, existing_ids=set()))
    assert publish_problems(draft, existing_ids={"p-somebody"}) == []
    draft.chunks[0].topics = ["etc"]
    assert any("기타면 상세" in p for p in publish_problems(draft, existing_ids={"p-somebody"}))


def test_interviewer_only_draft_has_no_chunks():
    draft = confirm_all(make_draft())
    for p in draft.people:
        p.role = "other"
    assert "졸업생이 말한 조각이 하나도 없어요." in publish_problems(draft, existing_ids=set())


# ---------------------------------------------------------------- build_rows
def test_build_rows_new_and_existing_people():
    draft = confirm_all(make_draft())
    momo = next(p for p in draft.people if p.ref == "S3")
    momo.link, momo.person_id = "existing", "p-momo"
    existing = {"p-momo": {"id": "p-momo", "nickname": "모모", "path_summary": "DB 요약", "organizations": ["MTA"],
                           "career_paths": ["gap_year"], "career_fields": []}}
    source, people, chunks = build_rows("up-20261125-abc123", draft, existing)

    assert source["id"] == "up-20261125-abc123" and source["visibility"] == "L1" and source["url"] == ""
    assert {"id": "p-momo", "is_new": False} in people
    new = next(p for p in people if p["is_new"])
    assert new["id"] == "p-cha-shu" and new["speaker_type"] == "alumni"
    assert [c["id"] for c in chunks] == ["up-20261125-abc123-01", "up-20261125-abc123-02", "up-20261125-abc123-03"]
    momo_chunk = chunks[1]
    assert momo_chunk["person_id"] == "p-momo"
    assert momo_chunk["embed_text"].startswith("[모모 | DB 요약 | 기관: MTA | 질문: 엑시트 후 무엇을 하셨나요?]\n")
    assert momo_chunk["career_paths"] == ["gap_year"]
    assert "010-1234-5678" in momo_chunk["content"]  # 원문 그대로 (가리는 건 관리자가 검토 화면에서 한다)


def test_embed_text_matches_build_dataset_format():
    assert embed_text("차슈", "요약", [], "", "답") == "[차슈 | 요약]\n답"
    assert embed_text("차슈", "", ["A", "B"], "질문?", "답") == "[차슈 | 기관: A, B | 질문: 질문?]\n답"
