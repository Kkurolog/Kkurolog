"""
RAG 안에서 주고받는 데이터 모양. (API 응답 모양은 app/schemas.py 에 따로 있다)

- Chunk          : 검색 단위 하나 (글을 자른 조각). Supabase 검색 함수 match_chunks 결과 한 줄과 같다
- ScoredChunk    : 검색 결과 = chunk + 유사도 점수
- GeneratorOutput: Claude 가 돌려주는 구조화 출력 {answer_type, answer, used_chunk_ids}
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


class GeneratorOutput(BaseModel):
    """Claude 구조화 출력. generator.OUTPUT_SCHEMA 와 모양이 같아야 한다."""

    answer_type: AnswerType
    answer: str
    used_chunk_ids: list[str] = Field(default_factory=list)


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


class RagAnswer(BaseModel):
    answer_type: AnswerType
    answer: str
    sources: list[RagSource] = Field(default_factory=list)
    # 검색·Claude 호출이 실패해서 no_evidence 로 대신 답했는지. API 응답에는 나가지 않는다.
    # (성능 측정 때 '진짜 근거 부족'과 '오류'를 구분하려고 둔다)
    failed: bool = False
