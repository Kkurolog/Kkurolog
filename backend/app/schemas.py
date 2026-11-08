"""
API에서 주고받는 데이터의 "모양"을 정의하는 파일.

- 프론트엔드는 이 모양을 기준으로 화면을 그린다.
  (frontend/src/lib/api.ts 의 타입과 맞춰야 한다)
- 나중에 가짜 답변을 실제 RAG로 바꿔도 이 모양은 그대로 유지한다.
  모양을 바꿔야 하면 프론트엔드 담당자와 먼저 이야기하자.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


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
    """
    답변의 근거가 된 인터뷰 구간 하나.

    공개 등급(visibility, docs/DATA.md):
      - L0: 사용 불가 → 출처로 만들 수 없다 (만들려고 하면 오류)
      - L1: 익명으로 답변 근거만 → excerpt·url 을 자동으로 비운다 (원문 비공개)
      - L2, L3: 원문 구간 노출 가능 → excerpt 를 채운다
    visibility 를 안 주면(None) 예전처럼 excerpt 를 그대로 보여준다. (demo·하위 호환)
    """

    alumni: str = Field(..., description="화면에 보여줄 이름 (예: '졸업생 A'). 공개 등급에 따라 익명")
    excerpt: str | None = Field(
        None, description="인터뷰에서 가져온 관련 구간. L1(원문 비공개)이면 null, 그 외에는 항상 채운다"
    )
    interview_id: str = Field(..., description="원본 인터뷰를 찾기 위한 ID")
    # --- 아래는 새로 추가한 선택 필드 (docs/proposals/ask-plan.md) ---
    visibility: Literal["L1", "L2", "L3"] | None = Field(None, description="공개 등급. 없으면 demo 데이터")
    date: str | None = Field(None, description="글·인터뷰 날짜 (예: '2021-05'). 오래된 정보인지 알려주는 용도")
    url: str | None = Field(None, description="원문 글 주소. L1 이면 null")

    @model_validator(mode="before")
    @classmethod
    def _apply_visibility(cls, data: object) -> object:
        """공개 등급 규칙을 여기서 강제한다. 실수로 L1 원문이 응답에 나가는 일을 막는다."""
        if isinstance(data, dict):
            if data.get("visibility") == "L0":
                raise ValueError("L0(사용 불가) 자료는 출처로 쓸 수 없어요")
            if data.get("visibility") == "L1":
                data = {**data, "excerpt": None, "url": None}
        return data


# 답변 종류 (프론트가 화면을 다르게 그릴 때 쓴다)
#   answer      : 근거를 바탕으로 한 일반 답변
#   no_evidence : 근거 부족 → 멘토 추천으로 연결
#   off_topic   : 진로·경험과 무관한 질문 → 정중히 안내
#   safety      : 위기 신호(자해·학대 등) → 상담 안내. 멘토 추천을 띄우지 않는 게 좋다
AnswerType = Literal["answer", "no_evidence", "off_topic", "safety"]


class AskResponse(BaseModel):
    """질문에 대한 답변."""

    answer: str = Field(..., description="학생에게 보여줄 답변")
    sources: list[Source] = Field(default_factory=list, description="답변에 사용한 출처 목록")
    has_enough_evidence: bool = Field(
        ...,
        description=(
            "근거가 충분한지. false면 프론트에서 '멘토 찾아보기' 안내를 보여준다. "
            "answer_type 이 no_evidence 일 때만 false (off_topic·safety 는 안내 문구가 보이도록 true)"
        ),
    )
    answer_type: AnswerType = Field("answer", description="답변 종류 (새 필드, 선택)")


# ---------------------------------------------------------------------------
# 멘토
# ---------------------------------------------------------------------------
# 주의: 멘토의 이메일(email)과 동의 여부(consent)는 일부러 여기에 넣지 않는다.
#       응답 스키마에 없는 필드는 API 응답에 절대 나가지 않는다.


class Mentor(BaseModel):
    """학생에게 보여줄 멘토 프로필 (공개해도 되는 필드만)."""

    id: str = Field(..., description="멘토 ID")
    name: str = Field(..., description="화면에 보여줄 이름 또는 별명")
    exit_year: int = Field(..., description="엑시트(졸업) 연도")
    career_paths: list[str] = Field(
        ...,
        description="진로 경로 (대학 진학 / 해외 대학 / 취업 / 창업 / 디자인·예술 / 개발 / 기타 경로)",
    )
    path_summary: str = Field(..., description="진로 경로 한 줄 요약")
    summary: str = Field(..., description="경험 요약 1~2줄")
    tags: list[str] = Field(default_factory=list, description="주요 경험 태그")
    topics: list[str] = Field(default_factory=list, description="답변 가능 주제")
    available: bool = Field(..., description="지금 연락을 받을 수 있는지")


class RecommendRequest(BaseModel):
    """멘토 추천 요청: 학생이 한 질문."""

    question: str = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="학생이 입력한 질문",
        examples=["창업하다가 대학에 간 선배 이야기가 궁금해"],
    )


class MentorRecommendation(BaseModel):
    """추천 멘토 한 명 + 추천 이유."""

    mentor: Mentor
    reason: str = Field(..., description="이 멘토를 추천한 이유 한 줄")


class RecommendResponse(BaseModel):
    """멘토 추천 결과."""

    recommendations: list[MentorRecommendation] = Field(default_factory=list, description="추천 멘토 (최대 3명)")
    is_fallback: bool = Field(
        ...,
        description="질문과 맞는 멘토를 못 찾아서 '다양한 경험' 멘토를 대신 보여주는지",
    )


# ---------------------------------------------------------------------------
# 멘토에게 첫 연락 (연락 요청)
# ---------------------------------------------------------------------------

# 간단한 이메일 형식 검사 (아이디@도메인.끝). 추가 패키지 없이 정규식으로 검사한다.
EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class ContactRequest(BaseModel):
    """학생이 멘토에게 보내는 첫 연락. 꾸로록이 멘토의 이메일로 전달한다."""

    model_config = ConfigDict(str_strip_whitespace=True)  # 앞뒤 공백은 자동으로 지운다

    mentor_id: str = Field(..., min_length=1, max_length=50, description="연락할 멘토 ID")
    sender_name: str = Field(..., min_length=1, max_length=30, description="학생 이름 또는 별명")
    reply_email: str = Field(
        ..., max_length=254, pattern=EMAIL_PATTERN, description="멘토가 답장을 보낼 학생 이메일"
    )
    subject: str = Field(..., min_length=1, max_length=100, description="메일 제목")
    message: str = Field(..., min_length=10, max_length=2000, description="질문 내용 (10~2000자)")


class ContactResponse(BaseModel):
    """연락 요청 결과."""

    status: Literal["delivered"] = Field(..., description="전달 결과")
    message: str = Field(..., description="학생에게 보여줄 안내 문구")
