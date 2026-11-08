# 꾸로록 (Kkurolog)

> 한 사람의 경험이 다음 학생의 선택지가 되도록.

**꾸로록**은 거꾸로캠퍼스 졸업생과 코치의 경험을 기록하고, 재학생이 필요할 때 질문으로 꺼내볼 수 있게 하는 서비스다.
졸업생이 *어디로 갔는지*보다 **왜 그 선택을 했는지, 어떤 고민과 시행착오가 있었는지**에 집중한다.

- 프로젝트 맥락: [docs/CONTEXT.md](docs/CONTEXT.md)
- 결정 기록: [docs/DECISIONS.md](docs/DECISIONS.md)
- 데이터 구조 초안: [docs/DATA.md](docs/DATA.md)

## 지금 되는 것
> 모든 답변·멘토는 **가짜(demo) 데이터**이며 실존 인물이 아니다.

| 화면 | 기능 |
|---|---|
| **질문하기** (`/`) | 채팅 형태로 질문 → demo 답변 + 출처 카드 + **관련 경험을 가진 멘토 1~3명** 추천. 근거가 부족하면(질문에 `근거없음` 포함) 추천 멘토를 크게 강조 |
| **멘토 찾기** (`/mentors`) | 멘토 카드 목록. 진로 경로 탭 + 이름·태그·주제 검색 |
| **연락하기** 팝업 | 멘토 카드의 "연락하기" → 이름·답장 이메일·제목·질문 입력 → 꾸로록이 전달 (**지금은 실제 메일을 보내지 않고 서버 로그에만 남김**) |

아직 없는 것: 실제 인터뷰 데이터, RAG(임베딩·Claude), 실제 이메일 발송, 대화 내역 저장(새로고침하면 사라짐).

### backend API
| 주소 | 하는 일 |
|---|---|
| `GET /health` | 서버 확인 |
| `POST /ask` | 질문 → 답변 + 출처 + 근거 충분 여부 (demo) |
| `GET /mentors` | 멘토 목록 (참여 동의한 멘토만, 이메일 제외) |
| `POST /mentors/recommend` | 질문 → 추천 멘토 최대 3명 + 추천 이유 |
| `POST /contact-requests` | 멘토에게 첫 연락 전달 (지금은 로그만) |

자세한 요청·응답 형식은 backend를 켠 뒤 http://localhost:8000/docs 에서 볼 수 있다.

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
source .venv/bin/activate        # Windows는 아래 표 참고
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

**Windows 사용자:** 가상환경 켜는 명령이 터미널마다 다르다. 켜지면 줄 앞에 `(.venv)`가 붙는다.

| 터미널 | 가상환경 켜기 |
|---|---|
| Git Bash (VS Code 기본 터미널이 `bash`/`MINGW64`일 때) | `source .venv/Scripts/activate` |
| PowerShell | `.venv\Scripts\Activate.ps1` |

- PowerShell에서 "스크립트를 실행할 수 없습니다" 오류가 나면 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`를 한 번 실행한다.
- Python이 여러 버전 깔려 있으면 `py -3.12 -m venv .venv`처럼 버전을 지정해 만든다.
- http://localhost:8000/health 에서 `{"status":"ok"}`가 나오면 성공
- http://localhost:8000/docs 에서 API를 직접 눌러볼 수 있다
- 테스트: `pytest` (backend 폴더, venv 켠 상태)

### 2. frontend 실행 (터미널 2)
```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```
- http://localhost:3000 에서 질문을 입력해 본다, http://localhost:3000/mentors 에서 멘토를 찾아본다

두 번째부터는 설치 과정 없이 아래만 실행하면 된다.
- backend: `cd backend && source .venv/bin/activate && uvicorn app.main:app --reload` (Windows는 activate 부분만 위 표대로)
- frontend: `cd frontend && npm run dev`

## 협업 규칙
- `main`에서 바로 작업하지 않는다. 브랜치를 만들고 PR로 올린다.
- API 키, 인터뷰 원문, 개인정보는 커밋하지 않는다 (`.env`, `data/raw/`는 자동으로 제외됨).
- 중요한 결정은 `docs/DECISIONS.md`에 한 줄씩 남긴다.
