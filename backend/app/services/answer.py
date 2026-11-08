"""
질문을 받아 답변을 만드는 곳.

두 가지 방식이 있다 (app/config.py 의 RAG_ENABLED 로 고른다):
  - false(기본): **가짜(demo) 답변**. API 키·데이터 없이 화면 흐름을 확인할 때
  - true: 실제 RAG (app/rag/pipeline.py). 결과는 app/rag/adapter.py 가 /ask 응답 형식으로 바꾼다
어느 쪽이든 위기 신호 안전장치(looks_like_crisis)를 가장 먼저 거친다.

RAG 흐름 (자세한 건 app/rag/pipeline.py, 제안: docs/proposals/ask-plan.md, 팀 논의 전):
  0. 위기 신호 안전장치 → 아래 looks_like_crisis
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

import logging
import re

from app import config
from app.schemas import AnswerType, AskResponse, Source

logger = logging.getLogger("uvicorn.error")

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
# ⚠️ 패턴 목록과 아래 안내 문구는 '초안'이다. 반드시 코치진과 확인한 뒤 확정한다.
#
# 주의: 띄어쓰기를 지우고 글자 조각으로 비교하면 안 된다.
#   '가고자 해' → '가고자해' 속에 '자해', '의학대학' 속에 '학대' 가 생겨 진로 질문이 위기로 분류된다.
#   그래서 (1) 띄어쓰기는 구절 안에서만 있어도 되고 없어도 되게(\s*) 하고,
#         (2) 짧은 단어(자해·학대)는 '단어의 시작'일 때만 잡는다 (바로 앞 글자가 한글이면 다른 단어의 일부).
# 패턴을 바꾸면 tests/test_ask.py 의 오탐·미탐 문장 테스트를 꼭 돌린다.
_WORD_START = r"(?<![가-힣])"  # 앞 글자가 한글이 아님 = 단어의 시작
CRISIS_PATTERNS = [
    r"죽고\s*싶",
    r"자살",  # 일상 단어 속에 거의 섞이지 않아서 위치를 따지지 않는다
    _WORD_START + r"자해",  # '하고자 해', '가고자해' 는 제외
    r"살기\s*싫",
    r"사라지고\s*싶",
    _WORD_START + r"학대",  # '의학대학', '공학대학원' 은 제외
    r"아동\s*학대",  # 붙여 쓴 '아동학대' 도 잡는다
    r"학대\s*(를|당|받)",  # '가정에서학대받아' 처럼 붙여 써도 잡는다
    r"폭행\s*당",
]
_CRISIS_REGEX = re.compile("|".join(CRISIS_PATTERNS))

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

# 검색·Claude 호출이 실패했을 때. answer_type 은 no_evidence 로 보내서 프론트가 멘토 찾기로 이어 준다.
# (새 오류 코드를 만들지 않아 프론트를 고칠 필요가 없다)
TEMPORARY_ERROR_MESSAGE = (
    "지금은 자료를 찾는 데 잠깐 문제가 생겼어요. 잠시 후 다시 물어봐 주세요. "
    "그동안 비슷한 경험을 가진 선배를 찾아볼 수도 있어요."
)


def looks_like_crisis(question: str) -> bool:
    """
    위기 신호가 있는지. 판정은 이 함수 하나로만 한다 (RAG 파이프라인도 이 함수를 쓴다).
    main.py 가 호출 횟수 제한보다 먼저 부른다 (막힌 학생도 안내를 받도록).
    """
    return _CRISIS_REGEX.search(question) is not None


def safety_answer() -> AskResponse:
    """위기 신호일 때의 고정 안내 답변."""
    return _special_answer("safety", SAFETY_MESSAGE)


def _special_answer(answer_type: AnswerType, message: str) -> AskResponse:
    """출처 없는 안내 답변. no_evidence 만 has_enough_evidence=false (위 '하위 호환 규칙')."""
    return AskResponse(
        answer=message,
        sources=[],
        has_enough_evidence=answer_type != "no_evidence",
        answer_type=answer_type,
    )


# 실제 RAG 파이프라인 (처음 쓸 때 한 번만 만든다)
_pipeline = None


def get_rag_pipeline():
    """
    RAG 파이프라인을 돌려준다. RAG_ENABLED=false 면 None (demo 답변을 쓴다).
    만들다 실패하면(패키지 미설치, API 키 없음 등) 오류를 그대로 낸다 → make_answer 가 안내 문구로 바꾼다.
    """
    global _pipeline
    if not config.RAG_ENABLED:
        return None
    if _pipeline is None:
        # 여기서 import 한다: app.rag.messages 가 이 파일을 import 하므로, 파일 맨 위에서 하면 서로 물고 물린다
        from app.rag.pipeline import build_pipeline_from_env

        _pipeline = build_pipeline_from_env(local_chunks_path=config.RAG_LOCAL_CHUNKS)
    return _pipeline


def _rag_answer(question: str) -> AskResponse:
    from app.rag.adapter import to_ask_response

    try:
        pipeline = get_rag_pipeline()
    except Exception:
        logger.exception("RAG 파이프라인을 만들지 못했어요 (requirements-rag.txt 설치, API 키를 확인하세요)")
        return _special_answer("no_evidence", TEMPORARY_ERROR_MESSAGE)
    return to_ask_response(pipeline.answer(question))  # pipeline.answer 는 스스로 오류를 처리한다


def make_answer(question: str) -> AskResponse:
    """질문을 받아 답변을 돌려준다."""

    if looks_like_crisis(question):  # main.py 에서도 먼저 거르지만, 다른 곳에서 불러도 안전하게 한 번 더
        return safety_answer()

    if config.RAG_ENABLED:
        return _rag_answer(question)

    # ---- 아래는 demo 답변 ----
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
