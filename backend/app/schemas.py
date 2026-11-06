"""
API에서 주고받는 데이터의 "모양"을 정의하는 파일.

- 프론트엔드는 이 모양을 기준으로 화면을 그린다.
  (frontend/src/lib/api.ts 의 타입과 맞춰야 한다)
- 나중에 가짜 답변을 실제 RAG로 바꿔도 이 모양은 그대로 유지한다.
  모양을 바꿔야 하면 프론트엔드 담당자와 먼저 이야기하자.
"""

from pydantic import BaseModel, Field


class AskRequest(BaseModel):
    """학생이 보내는 질문."""

    question: str = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="학생이 입력한 질문",
        examples=["대학을 바로 가지 않고 취업한 선배들은 왜 그렇게 선택했어?"],
    )


class Source(BaseModel):
    """답변의 근거가 된 인터뷰 구간 하나."""

    alumni: str = Field(..., description="화면에 보여줄 이름 (예: '졸업생 A'). 공개 등급에 따라 익명")
    excerpt: str = Field(..., description="인터뷰에서 가져온 관련 구간")
    interview_id: str = Field(..., description="원본 인터뷰를 찾기 위한 ID")


class AskResponse(BaseModel):
    """질문에 대한 답변."""

    answer: str = Field(..., description="학생에게 보여줄 답변")
    sources: list[Source] = Field(default_factory=list, description="답변에 사용한 출처 목록")
    has_enough_evidence: bool = Field(
        ...,
        description="근거가 충분한지. false면 프론트에서 '멘토 찾아보기' 안내를 보여준다",
    )
