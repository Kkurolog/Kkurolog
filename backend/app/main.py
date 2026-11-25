"""
backend의 시작점. API 주소(라우트)를 정의한다.

실행:  uvicorn app.main:app --reload   (backend 폴더에서)
확인:  http://localhost:8000/docs  ← 브라우저에서 API를 직접 눌러볼 수 있다
"""

import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
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
from app.admin.imports import router as admin_imports_router
from app.admin.router import router as admin_router
from app.mail.router import router as mail_router
from app.rate_limit import limit_ask
from app.services.answer import looks_like_crisis, make_answer, safety_answer
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
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],  # 관리자 페이지: PATCH 멘토·설정 수정, PUT·DELETE 인터뷰 넣기
    allow_headers=["*"],
)

# Apps Script(메일 웹앱) → 백엔드 내부 API: /internal/mail/inbound, /internal/mail/reminders (app/mail/router.py)
app.include_router(mail_router)
# 관리자 페이지용 API: /admin/* (app/admin/router.py, 공용 비밀번호 ADMIN_PASSWORD 로그인)
app.include_router(admin_router)
# 관리자 '인터뷰 넣기': /admin/imports/* (app/admin/imports.py, txt 업로드 → AI 초안 → 검토 → 공개)
app.include_router(admin_imports_router)


@app.get("/health")
@app.head("/health", include_in_schema=False)  # /docs 에는 GET 하나만 보이게
def health() -> dict[str, str]:
    """
    서버가 살아 있는지 확인용. DB·LLM을 부르지 않아 가볍다.
    UptimeRobot 무료 플랜은 GET이 아니라 HEAD로 핑을 보내므로 HEAD도 받는다.
    (HEAD를 안 받으면 405가 나서 UptimeRobot이 서버를 '다운'으로 표시한다)
    """
    return {"status": "ok"}


@app.post("/ask", response_model=AskResponse)
def ask(request: AskRequest, http_request: Request) -> AskResponse:
    """
    학생의 질문을 받아 답변과 출처를 돌려준다. 처리 순서가 중요하다:
      1. 입력 검사: FastAPI 가 이 함수가 불리기 전에 한다. 형식이 틀리면 422 (횟수에 세지 않음)
      2. 위기 신호 검사: 걸리면 횟수 제한과 상관없이 바로 상담 안내 (횟수에 세지 않음, API 비용 없음)
      3. 호출 횟수 제한: 넘으면 429 (수치는 app/config.py, 이유는 app/rate_limit.py)
      4. 답변 만들기
    """
    if looks_like_crisis(request.question):
        return safety_answer(request.crisis_notice_shown)
    limit_ask(http_request)
    return make_answer(
        request.question, request.previous_question, request.previous_answer, request.seen_source_ids,
        request.safety_notice_shown,
        request.crisis_notice_shown,
        request.more_hint_shown,
    )


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
    학생이 멘토에게 보내는 첫 연락을 받아 꾸로록이 전달한다. (MAIL_ENABLED=true 일 때만 실제 메일)
    - 입력 형식이 틀리면 422 (이메일 형식, 길이 등은 schemas.ContactRequest 가 검사)
    - 없는 멘토(또는 동의하지 않은 멘토)면 404
    - 지금 연락을 받지 않는 멘토면 409
    - (MAIL_ENABLED=true) 같은 메일로 너무 자주 보내면 429, 메일 발송 실패 503, 메일·DB 연결 문제 502
    """
    mentor = get_mentor(request.mentor_id)
    if mentor is None:
        raise HTTPException(status_code=404, detail="찾을 수 없는 멘토예요.")
    if not mentor.available:
        raise HTTPException(status_code=409, detail="이 선배는 지금 연락을 받지 않아요.")

    deliver_contact_request(request, mentor)
    return ContactResponse(status="delivered", message=f"{mentor.name} 선배에게 전달했어요.")
