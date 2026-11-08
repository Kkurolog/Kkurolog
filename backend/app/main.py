"""
backend의 시작점. API 주소(라우트)를 정의한다.

실행:  uvicorn app.main:app --reload   (backend 폴더에서)
확인:  http://localhost:8000/docs  ← 브라우저에서 API를 직접 눌러볼 수 있다
"""

import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.schemas import (
    AskRequest,
    AskResponse,
    ContactRequest,
    ContactResponse,
    Mentor,
    RecommendRequest,
    RecommendResponse,
)
from app.rate_limit import limit_ask
from app.services.answer import make_answer
from app.services.contact import deliver_contact_request
from app.services.mentors import get_mentor, list_mentors, recommend_mentors

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


@app.post("/ask", response_model=AskResponse, dependencies=[Depends(limit_ask)])
def ask(request: AskRequest) -> AskResponse:
    """
    학생의 질문을 받아 답변과 출처를 돌려준다.
    - 호출 횟수 제한을 넘으면 429 (수치는 app/config.py, 이유는 app/rate_limit.py)
    """
    return make_answer(request.question)


@app.get("/mentors", response_model=list[Mentor])
def mentors() -> list[Mentor]:
    """멘토 목록 (참여에 동의한 멘토만). 진로 탭·검색은 프론트에서 처리한다."""
    return list_mentors()


@app.post("/mentors/recommend", response_model=RecommendResponse)
def mentors_recommend(request: RecommendRequest) -> RecommendResponse:
    """질문에 맞는 멘토를 최대 3명 추천한다. (/ask 와 따로 부른다 → docs/DECISIONS.md)"""
    return recommend_mentors(request.question)


@app.post("/contact-requests", response_model=ContactResponse, status_code=201)
def contact_requests(request: ContactRequest) -> ContactResponse:
    """
    학생이 멘토에게 보내는 첫 연락을 받아 꾸로록이 전달한다. (지금은 실제 메일을 보내지 않음)
    - 입력 형식이 틀리면 422 (이메일 형식, 길이 등은 schemas.ContactRequest 가 검사)
    - 없는 멘토(또는 동의하지 않은 멘토)면 404
    - 지금 연락을 받지 않는 멘토면 409
    """
    mentor = get_mentor(request.mentor_id)
    if mentor is None:
        raise HTTPException(status_code=404, detail="찾을 수 없는 멘토예요.")
    if not mentor.available:
        raise HTTPException(status_code=409, detail="이 선배는 지금 연락을 받지 않아요.")

    deliver_contact_request(request, mentor)
    return ContactResponse(status="delivered", message=f"{mentor.name} 선배에게 전달했어요.")
