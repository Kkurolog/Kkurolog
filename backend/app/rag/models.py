"""
RAG 안에서 주고받는 데이터 모양. (API 응답 모양은 app/schemas.py 에 따로 있다)

- Chunk          : 검색 단위 하나 (글을 자른 조각). DB(kkurolog_chunks 테이블)의 한 줄과 같다
- ScoredChunk    : 검색 결과 = chunk + 유사도 점수
- GeneratorOutput: Claude 가 돌려주는 구조화 출력 {answer_type, answer, used_chunk_ids}
- RagSource      : 답변에 실제로 쓴 출처 하나 (공개 등급 규칙을 적용한 뒤)
- RagAnswer      : 파이프라인의 최종 결과 → app/rag/adapter.py 가 /ask 응답으로 바꾼다
"""

from typing import Literal

from pydantic import BaseModel, Field

from app.schemas import AnswerType

PostType = Literal["interview", "letter", "essay"]
Visibility = Literal["L0", "L1", "L2", "L3"]


class Chunk(BaseModel):
    """검색 단위 하나. 필드 이름은 scripts/sql/kkurolog_chunks.sql 의 열 이름과 같아야 한다."""

    chunk_id: str = Field(..., description='"{post_id}#{chunk_index}"')
    post_id: str
    chunk_index: int = Field(..., description="글 안에서 몇 번째 조각인지 (앞뒤 chunk 를 찾을 때 쓴다)")
    post_type: PostType
    title: str = ""
    nickname: str = Field("", description="글쓴이 닉네임. L3 가 아니면 학생에게 보여주지 않는다")
    career_tags: list[str] = Field(default_factory=list)
    date: str | None = None
    url: str | None = None
    visibility: Visibility
    question: str | None = Field(None, description="인터뷰 질문 (질문-답변 chunk 일 때)")
    content: str = Field(..., description="본문 조각")
    embed_text: str = Field(..., description="임베딩에 넣는 글 = 머리말 + 질문 + 본문")
    embedding: list[float] | None = Field(None, description="임베딩 벡터. 만들기 전에는 None")

    @property
    def display_name(self) -> str:
        """
        학생에게 보여줄 이름. L3 만 닉네임을 쓰고, 나머지는 진로로만 부른다.
        (property 라서 model_dump 에 들어가지 않는다 → DB 에 저장되지 않는다)
        """
        if self.visibility == "L3" and self.nickname:
            return self.nickname
        careers = "·".join(self.career_tags)
        if self.post_type == "letter":
            return "코-레터 필자 (익명)"
        return f"{careers} 경로 졸업생 (익명)" if careers else "졸업생 (익명)"


class ScoredChunk(BaseModel):
    chunk: Chunk
    score: float = Field(..., description="질문과의 유사도 (코사인, 클수록 비슷함)")


class GeneratorOutput(BaseModel):
    """Claude 구조화 출력. generator.OUTPUT_SCHEMA 와 모양이 같아야 한다."""

    answer_type: AnswerType
    answer: str
    used_chunk_ids: list[str] = Field(default_factory=list)


class RagSource(BaseModel):
    """답변에 실제로 쓴 출처 하나. 공개 등급 규칙은 pipeline.to_source 가 적용한다."""

    chunk_id: str
    post_id: str
    alumni: str = Field(..., description="화면에 보여줄 이름 (Chunk.display_name)")
    title: str = ""
    excerpt: str | None = Field(None, description="L1 이면 None")
    visibility: Literal["L1", "L2", "L3"]
    date: str | None = None
    url: str | None = Field(None, description="L3 일 때만")


class RagAnswer(BaseModel):
    answer_type: AnswerType
    answer: str
    sources: list[RagSource] = Field(default_factory=list)
    # 검색·Claude 호출이 실패해서 no_evidence 로 대신 답했는지. API 응답에는 나가지 않는다.
    # (성능 측정 때 '진짜 근거 부족'과 '오류'를 구분하려고 둔다)
    failed: bool = False
