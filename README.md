# 꾸로록 (Kkurolog)

> 한 사람의 경험이 다음 학생의 선택지가 되도록.

**꾸로록**은 거꾸로캠퍼스 졸업생과 코치의 경험을 기록하고, 재학생이 필요할 때 질문으로 꺼내볼 수 있게 하는 서비스다.
졸업생이 *어디로 갔는지*보다 **왜 그 선택을 했는지, 어떤 고민과 시행착오가 있었는지**에 집중한다.

- 프로젝트 맥락: [docs/CONTEXT.md](docs/CONTEXT.md)
- 결정 기록: [docs/DECISIONS.md](docs/DECISIONS.md)
- 데이터 구조 초안: [docs/DATA.md](docs/DATA.md)

## 지금 되는 것
질문 입력 → backend `/ask` 호출 → **demo 답변 + demo 출처** 표시.
근거가 부족하면 "멘토 찾아보기" 안내를 보여준다 (질문에 `근거없음`을 넣으면 확인할 수 있다).
실제 인터뷰 데이터, RAG, 멘토 기능은 아직 없다.

## 폴더 구조
```
Kkurolog/
├─ frontend/   # Next.js + TypeScript + Tailwind (화면)
├─ backend/    # Python + FastAPI (API)
├─ docs/       # 프로젝트 문서
└─ scripts/    # 나중에 데이터 정제·적재 스크립트
```

## 로컬 실행 방법

### 0. 필요한 것
- [Node.js](https://nodejs.org) 20 이상 (22 LTS 권장)
- [Python](https://www.python.org) 3.11 이상
- Git

### 1. backend 실행 (터미널 1)
```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # Windows: copy .env.example .env
uvicorn app.main:app --reload
```
- http://localhost:8000/health 에서 `{"status":"ok"}`가 나오면 성공
- http://localhost:8000/docs 에서 `/ask`를 직접 눌러볼 수 있다

### 2. frontend 실행 (터미널 2)
```bash
cd frontend
npm install
cp .env.example .env.local       # Windows: copy .env.example .env.local
npm run dev
```
- http://localhost:3000 에서 질문을 입력해 본다

두 번째부터는 설치 과정 없이 아래만 실행하면 된다.
- backend: `cd backend && source .venv/bin/activate && uvicorn app.main:app --reload`
- frontend: `cd frontend && npm run dev`

## 협업 규칙
- `main`에서 바로 작업하지 않는다. 브랜치를 만들고 PR로 올린다.
- API 키, 인터뷰 원문, 개인정보는 커밋하지 않는다 (`.env`, `data/raw/`는 자동으로 제외됨).
- 중요한 결정은 `docs/DECISIONS.md`에 한 줄씩 남긴다.
