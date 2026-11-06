"""
backend의 시작점. API 주소(라우트)를 정의한다.

실행:  uvicorn app.main:app --reload   (backend 폴더에서)
확인:  http://localhost:8000/docs  ← 브라우저에서 API를 직접 눌러볼 수 있다
"""

import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.schemas import AskRequest, AskResponse, Mentor, RecommendRequest, RecommendResponse
from app.services.answer import make_answer
from app.services.mentors import list_mentors, recommend_mentors

# .env 파일이 있으면 환경변수로 읽어온다
load_dotenv()

app = FastAPI(title="꾸로록 API", version="0.1.0")

# CORS: 프론트엔드(다른 주소)에서 이 API를 호출할 수 있게 허용
frontend_origins = os.getenv("FRONTEND_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in frontend_origins if origin.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    """서버가 살아 있는지 확인용."""
    return {"status": "ok"}


@app.post("/ask", response_model=AskResponse)
def ask(request: AskRequest) -> AskResponse:
    """학생의 질문을 받아 답변과 출처를 돌려준다."""
    return make_answer(request.question)


@app.get("/mentors", response_model=list[Mentor])
def mentors() -> list[Mentor]:
    """멘토 목록 (참여에 동의한 멘토만). 진로 탭·검색은 프론트에서 처리한다."""
    return list_mentors()


@app.post("/mentors/recommend", response_model=RecommendResponse)
def mentors_recommend(request: RecommendRequest) -> RecommendResponse:
    """질문에 맞는 멘토를 최대 3명 추천한다. (/ask 와 따로 부른다 → docs/DECISIONS.md)"""
    return recommend_mentors(request.question)


# 나중에 추가할 라우트 자리 (지금은 만들지 않음)
# - POST /contact-requests   멘토에게 첫 연락 전달 (이메일)
