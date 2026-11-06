"""
질문을 받아 답변을 만드는 곳.

지금은 실제 데이터가 없어서 **가짜(demo) 답변**을 돌려준다.
나중에 실제 RAG를 붙일 때는 이 파일의 `make_answer` 함수 안쪽만 바꾸면 된다.
(main.py 와 schemas.py 는 그대로 둔다)

나중에 들어갈 흐름 (docs/CONTEXT.md, docs/DATA.md 참고):
  1. 질문을 OpenAI 임베딩으로 벡터로 바꾼다
  2. Supabase(pgvector)에서 비슷한 인터뷰 구간 Top-K를 찾는다
  3. 근거가 충분한지 판단한다
  4. 충분하면 Claude가 그 근거 안에서만 답변을 만든다
  5. 사용한 출처를 함께 돌려준다
"""

from app.schemas import AskResponse, Source

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

# 이런 단어가 질문에 있으면 '근거 부족' 화면을 테스트할 수 있게 한다. (demo 전용)
NO_EVIDENCE_KEYWORDS = ["근거없음", "모르는"]


def make_answer(question: str) -> AskResponse:
    """질문을 받아 답변을 돌려준다. (지금은 가짜 답변)"""

    if any(word in question for word in NO_EVIDENCE_KEYWORDS):
        return AskResponse(
            answer="현재 자료만으로는 답하기 어려워요. 비슷한 경험을 가진 사람을 찾아볼까요?",
            sources=[],
            has_enough_evidence=False,
        )

    return AskResponse(
        answer=(
            "[demo 답변] 대학을 바로 가지 않은 선배들은 '내가 무엇을 하고 싶은지 직접 확인해 보고 싶어서'라고 "
            "많이 이야기했어요. 일을 해 본 뒤 배우고 싶은 것이 분명해져 진학을 다시 고민한 경우도 있었어요. "
            "(아직 실제 인터뷰 데이터가 연결되지 않은 예시 답변입니다)"
        ),
        sources=DEMO_SOURCES,
        has_enough_evidence=True,
    )
