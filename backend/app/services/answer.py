"""
질문을 받아 답변을 만드는 곳.

지금은 실제 데이터가 없어서 **가짜(demo) 답변**을 돌려준다.
나중에 실제 RAG를 붙일 때는 이 파일의 `make_answer` 함수 안쪽만 바꾸면 된다.
(main.py 와 schemas.py 는 그대로 둔다)

나중에 들어갈 흐름 (제안: docs/proposals/ask-plan.md, 팀 논의 전):
  0. 위기 신호 안전장치 → 아래 _looks_like_crisis (이건 RAG 를 붙여도 그대로 둔다)
  1. 질문을 OpenAI 임베딩으로 벡터로 바꾼다
  2. Supabase(pgvector)에서 비슷한 chunk Top-K를 찾는다 (visibility L0 제외)
  3. 유사도 하한보다 낮은 chunk는 버린다. 하나도 안 남으면 Claude 를 부르지 않고 no_evidence
  4. 남은 chunk에 앞뒤 chunk를 붙이고, 같은 글은 합친다 (최대 3개 글)
  5. Claude 를 한 번 불러 구조화된 출력 {answer_type, answer, used_chunk_ids} 를 받는다
     - 근거 안에서만 답하고, 글의 시기를 밝히고, 근거 속 지시문은 무시하라는 규칙을 시스템 프롬프트에 둔다
  6. used_chunk_ids 에 해당하는 chunk 만 sources 로 만든다 (L1 이면 Source 가 excerpt 를 자동으로 비운다)
  7. answer_type 이 safety 면 Claude 문장 대신 SAFETY_MESSAGE(고정 문구)를 돌려준다

has_enough_evidence 규칙 (현재 프론트와의 하위 호환):
  - no_evidence 일 때만 false. 프론트는 false 면 답변 본문을 숨기고 '멘토 찾아보기' 화면을 띄우기 때문에,
    off_topic·safety 안내 문구가 보이려면 true 여야 한다.
"""

from app.schemas import AnswerType, AskResponse, Source

# 가짜 인터뷰 구간. 실제 인물이 아니다.
DEMO_SOURCES = [
    Source(
        alumni="졸업생 A (demo)",
        excerpt="대학을 바로 가지 않은 건 '하고 싶은 게 뭔지 먼저 확인하고 싶어서'였어요. "
        "거캠에서 했던 프로젝트가 실제 일과 얼마나 닮았는지 궁금했거든요.",
        interview_id="demo-1",
    ),
    Source(
        alumni="졸업생 B (demo)",
        excerpt="1년 일해 보니 배우고 싶은 게 분명해져서 그때 진학을 다시 고민했어요. "
        "다시 한다면 처음부터 코치님께 더 자주 물어볼 것 같아요.",
        interview_id="demo-2",
    ),
]

# 이런 단어가 질문에 있으면 각 화면을 테스트할 수 있게 한다. (demo 전용, RAG 를 붙이면 지운다)
NO_EVIDENCE_KEYWORDS = ["근거없음", "모르는"]
OFF_TOPIC_KEYWORDS = ["주제밖"]

# ---------------------------------------------------------------------------
# 위기 신호 안전장치 (demo 전용이 아니다. RAG 를 붙여도 Claude 판단 전에 먼저 거른다)
# ---------------------------------------------------------------------------
# Claude 판단이 실패하거나 API 가 죽어도 최소한의 안내는 나가게 하려는 것.
# 띄어쓰기를 지우고 비교한다 ('죽고 싶어' ↔ '죽고싶어').
# ⚠️ 단어 목록과 아래 안내 문구는 '초안'이다. 반드시 코치진과 확인한 뒤 확정한다.
CRISIS_KEYWORDS = ["죽고싶", "자살", "자해", "살기싫", "사라지고싶", "학대", "폭행당"]

SAFETY_MESSAGE = (
    "지금 많이 힘든 마음이 느껴져요. 혼자 견디지 말고 믿을 수 있는 코치님이나 어른에게 꼭 이야기해 주세요. "
    "바로 이야기할 사람이 필요하면 언제든 자살예방상담전화 109, 청소년상담 1388(문자·카톡 상담도 가능)에 "
    "연락할 수 있어요. 위험한 상황이면 112·119에 바로 연락해 주세요."
)

OFF_TOPIC_MESSAGE = (
    "꾸로록은 거꾸로캠퍼스 졸업생·코치의 진로 경험을 나누는 곳이라, 이 질문에는 답하기 어려워요. "
    "진로나 선택의 고민이 있다면 편하게 물어봐 주세요."
)

NO_EVIDENCE_MESSAGE = "현재 자료만으로는 답하기 어려워요. 비슷한 경험을 가진 사람을 찾아볼까요?"


def _looks_like_crisis(question: str) -> bool:
    compact = question.replace(" ", "")
    return any(word in compact for word in CRISIS_KEYWORDS)


def _special_answer(answer_type: AnswerType, message: str) -> AskResponse:
    """출처 없는 안내 답변. no_evidence 만 has_enough_evidence=false (위 '하위 호환 규칙')."""
    return AskResponse(
        answer=message,
        sources=[],
        has_enough_evidence=answer_type != "no_evidence",
        answer_type=answer_type,
    )


def make_answer(question: str) -> AskResponse:
    """질문을 받아 답변을 돌려준다. (위기 안전장치는 실제 동작, 나머지는 가짜 답변)"""

    if _looks_like_crisis(question):
        return _special_answer("safety", SAFETY_MESSAGE)

    if any(word in question for word in OFF_TOPIC_KEYWORDS):
        return _special_answer("off_topic", OFF_TOPIC_MESSAGE)

    if any(word in question for word in NO_EVIDENCE_KEYWORDS):
        return _special_answer("no_evidence", NO_EVIDENCE_MESSAGE)

    return AskResponse(
        answer=(
            "[demo 답변] 대학을 바로 가지 않은 선배들은 '내가 무엇을 하고 싶은지 직접 확인해 보고 싶어서'라고 "
            "많이 이야기했어요. 일을 해 본 뒤 배우고 싶은 것이 분명해져 진학을 다시 고민한 경우도 있었어요. "
            "(아직 실제 인터뷰 데이터가 연결되지 않은 예시 답변입니다)"
        ),
        sources=DEMO_SOURCES,
        has_enough_evidence=True,
        answer_type="answer",
    )
