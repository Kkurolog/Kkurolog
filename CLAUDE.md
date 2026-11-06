# 꾸로록 (Kkurolog)

거꾸로캠퍼스 졸업생·코치의 경험(선택의 이유, 고민, 시행착오)을 기록하고, 재학생이 질문으로 꺼내볼 수 있게 하는 프로토타입.
프로젝트 배경과 원칙: @docs/CONTEXT.md

## 폴더 구조
- `frontend/`: Next.js(App Router) + TypeScript + Tailwind. 학생이 보는 화면 (Vercel 배포 예정)
- `backend/`: Python + FastAPI (Render 배포 예정). `/health`, `/ask`(demo 답변), `/mentors`, `/mentors/recommend`, `/contact-requests`(메일 미발송, 로그만). 멘토는 `backend/app/data/mentors_demo.json`의 가짜 데이터
- `docs/`: CONTEXT(맥락), DECISIONS(결정 기록), DATA(데이터 구조 초안)
- `scripts/`: 나중에 데이터 정제·적재 스크립트를 넣을 곳

## 실행
```bash
# backend (터미널 1) → http://localhost:8000/docs
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload

# frontend (터미널 2) → http://localhost:3000
cd frontend && npm run dev
```
처음 설치 방법은 README.md를 본다.

## 작업 습관
- main에서 바로 작업하지 않는다. 브랜치를 만들어 PR로 올린다.
- 처음 개발하는 팀원도 읽을 수 있게 변경 내용을 쉽게 설명한다.
- 중요한 결정이 생기면 `docs/DECISIONS.md`에 한 줄 추가를 제안한다.
- API 키, 인터뷰 원문, 개인정보는 커밋하지 않는다 (`.env`, `data/raw/`는 .gitignore에 있다).
- API 요청·응답 형식을 바꾸면 `backend/app/schemas.py`와 `frontend/src/lib/api.ts`를 함께 바꾼다.
- 멘토 이메일 등 연락처는 어떤 API 응답에도 넣지 않는다. 참여 동의(`consent`)가 false인 멘토는 어디에도 노출하지 않는다.
- backend를 바꾸면 `cd backend && pytest`, frontend를 바꾸면 `npm run lint && npm run build`로 확인한다.
