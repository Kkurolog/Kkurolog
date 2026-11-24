"""
RAG 안에서 주고받는 데이터 모양. (API 응답 모양은 app/schemas.py 에 따로 있다)

- Chunk          : 검색 단위 하나 (글을 자른 조각). Supabase 검색 함수 match_chunks 결과 한 줄과 같다
- ScoredChunk    : 검색 결과 = chunk + 유사도 점수
- GeneratorOutput: Claude 가 돌려주는 구조화 출력 {answer_type, headline, compare, cards, closing}
- RagCard / RagStructured: 근거 검증을 통과한 카드형 답변
- RagSource      : 답변에 실제로 쓴 출처 하나 (공개 등급 규칙을 적용한 뒤)
- RagAnswer      : 파이프라인의 최종 결과 → app/rag/adapter.py 가 /ask 응답으로 바꾼다

테이블 구조는 supabase/migrations/0001_experience_tables.sql (sources / people / chunks) 를 따른다.
조각을 만드는 건 scripts/chunk_gschool.py, build_dataset.py 이고, backend 는 읽기만 한다.
"""

from typing import Literal

from pydantic import BaseModel, Field

from app.schemas import AnswerType

Visibility = Literal["L0", "L1", "L2", "L3"]


class Chunk(BaseModel):
    """
    검색 단위 하나. 필드 이름은 match_chunks 함수의 결과 칸 이름과 같다.
    (chunks 테이블 + 글(sources)의 title·url·published_at + 인물(people)의 nickname 을 합친 모양)
    """

    chunk_id: str = Field(..., description='chunks.id = "{글번호}-{순서 두 자리}" (예: 134676010-03)')
    source_id: str = Field(..., description="글번호 (sources.id)")
    person_id: str = ""
    chunk_index: int = Field(..., description="글 안에서 몇 번째 조각인지 (1부터. 앞뒤 chunk 를 찾을 때 쓴다)")
    question: str = Field("", description="인터뷰 질문. 에세이 조각은 빈 값")
    content: str = Field(..., description="본문 조각")
    visibility: Visibility
    topics: list[str] = Field(default_factory=list)
    career_paths: list[str] = Field(default_factory=list, description="TAGS.md 의 영어 code")
    career_fields: list[str] = Field(default_factory=list, description="TAGS.md 의 영어 code")
    title: str = Field("", description="글 제목 (sources.title). 졸업생 이름이 들어 있을 수 있다")
    url: str | None = Field(None, description="원문 주소 (sources.url)")
    published_at: str | None = Field(None, description="글 게시일 (sources.published_at, 예: 2023-05-10)")
    nickname: str = Field("", description="별명 (people.nickname). L3 가 아니면 학생에게 보여주지 않는다")
    embedding: list[float] | None = Field(None, description="임베딩 벡터. 로컬 검색(InMemoryVectorStore)에서만 쓴다")

    @property
    def display_name(self) -> str:
        """
        학생에게(그리고 Claude 에게) 보여줄 이름. L3 만 별명을 쓰고, 나머지는 '졸업생 (익명)'.
        진로 태그는 영어 code 라 그대로 보여주면 안 되고(TAGS.md 규칙), 경로 요약(path_summary)은
        기관 이름이 들어 있어 익명 글에서 누구인지 드러날 수 있어서 넣지 않는다.
        """
        if self.visibility == "L3" and self.nickname:
            return self.nickname
        return "졸업생 (익명)"


class ScoredChunk(BaseModel):
    chunk: Chunk
    score: float = Field(..., description="질문과의 유사도 (코사인, 클수록 비슷함)")


class CardPiece(BaseModel):
    """카드 본문의 조각 하나. 근거 chunk 가 없으면 pipeline 이 버린다."""

    text: str
    chunk_ids: list[str] = Field(default_factory=list)


class GeneratedCard(BaseModel):
    """Claude 가 쓴 선배 한 명의 카드."""

    label: str = Field(..., description="그 선배가 택한 길 = 어떻게 갔나 (예: '작게 바로 시작한 길')")
    one_liner: str | None = Field(None, description="지금 무엇을 하고 있나 (예: '지금은 여행 스타트업을 운영해요'). 모르면 None")
    body: list[CardPiece] = Field(default_factory=list)


class GeneratorOutput(BaseModel):
    """Claude 구조화 출력. generator.OUTPUT_SCHEMA 와 모양이 같아야 한다."""

    answer_type: AnswerType
    headline: str = ""
    compare: str | None = None
    cards: list[GeneratedCard] = Field(default_factory=list)
    closing: str | None = None


class RagSource(BaseModel):
    """답변에 실제로 쓴 출처 하나. 공개 등급 규칙은 pipeline.to_source 가 적용한다."""

    chunk_id: str
    source_id: str
    alumni: str = Field(..., description="화면에 보여줄 이름 (Chunk.display_name)")
    title: str = ""
    excerpt: str | None = Field(None, description="L1 이면 None")
    visibility: Literal["L1", "L2", "L3"]
    published_at: str | None = None
    url: str | None = Field(None, description="L3 일 때만")


class RagCard(BaseModel):
    """근거 검증을 통과한 카드 한 장 (선배 한 명)."""

    nickname: str | None = Field(None, description="공개 등급 L3 인 선배의 별명. 그 외에는 None (화면에는 label 만)")
    label: str
    one_liner: str | None = None
    body: list[str]
    sources: list[RagSource] = Field(..., description="이 카드의 조각들이 실제로 인용한 chunk (카드별 출처)")
    avatar_id: str = Field(..., description="'avatar-1'~'avatar-8'. 같은 선배는 어느 답변에서든 같은 값")


class RagStructured(BaseModel):
    """카드형 답변. app/rag/adapter.py 가 /ask 응답의 structured 로 바꾼다."""

    headline: str
    compare: str | None = None
    cards: list[RagCard]
    closing: str | None = None


class RagAnswer(BaseModel):
    answer_type: AnswerType
    answer: str = Field(..., description="문단형 글. 카드형 답변이면 카드를 글로 풀어 쓴 것 (카드를 못 그리는 화면용)")
    sources: list[RagSource] = Field(default_factory=list)
    structured: RagStructured | None = Field(None, description="카드형 답변. answer_type 이 answer 일 때만")
    # 1차 의도 분석 결과 (app/rag/intent.py). 분석을 안 했거나 실패했으면 None
    intent: str | None = None
    user_context: str | None = None
    # 꾸로록 자신에 대한 질문(about_service)에 고정 문구로 답했을 때: 어느 측면인지, 다음에 물어볼 예시
    about_aspect: str | None = None
    follow_ups: list[str] = Field(default_factory=list)
    emphasis: str | None = None  # 고정 문구 안에서 굵게 강조할 문장
    # 검색·Claude 호출이 실패해서 no_evidence 로 대신 답했는지. API 응답에는 나가지 않는다.
    # (성능 측정 때 '진짜 근거 부족'과 '오류'를 구분하려고 둔다)
    failed: bool = False
    # 이어지는 질문("다른 선배 얘기도", "더 자세히")에 더 전할 이야기가 없어서 no_evidence 로 답했는지
    no_more: bool = False
    safety_notice: bool = False  # 상담 번호가 들어 있는 안내인지 (위기 안내, T1 안내)
    crisis_notice: bool = False  # 위기 안내(T0)였는지
    more_hint: bool = False  # 맺음말에 "다른 선배 이야기도 더 있어요"를 붙였는지 (대화당 한 번만 붙이려고 표시한다)
    preface: str | None = None  # 카드 답변 위에 붙이는 한 줄 (감정이 담긴 진로 고민일 때)
