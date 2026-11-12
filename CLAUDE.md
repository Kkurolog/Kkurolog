# 꾸로록 (Kkurolog)

거꾸로캠퍼스 졸업생·코치의 경험(선택의 이유, 고민, 시행착오)을 기록하고, 재학생이 질문으로 꺼내볼 수 있게 하는 프로토타입.
프로젝트 배경과 원칙: @docs/CONTEXT.md

## 폴더 구조
- `frontend/`: Next.js(App Router) + TypeScript + Tailwind. 학생이 보는 화면 (Vercel 배포 예정)
- `backend/`: Python + FastAPI (Render 배포 예정). `/health`, `/ask`(demo 답변), `/mentors`, `/mentors/recommend`, `/contact-requests`(메일 미발송, 로그만). 멘토는 `backend/app/data/mentors_demo.json`의 가짜 데이터
- `docs/`: CONTEXT(맥락), DECISIONS(결정 기록), DATA(데이터·테이블 구조), TAGS(태그 기준), WORKFLOW(브랜치·PR 작업 방법)
- `scripts/`: 데이터 수집·청킹·태그 검사·Supabase 적재 스크립트 (Python 환경은 `scripts/.venv`로 backend와 따로). 사용법은 `scripts/README.md`
- `supabase/migrations/`: Supabase 테이블·함수 SQL. `python scripts/run_sql.py <파일>`로 실행
- `data/`: 수집·가공한 데이터 (git에 올리지 않음)

## 실행
```bash
# backend (터미널 1) → http://localhost:8000/docs
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload

# frontend (터미널 2) → http://localhost:3000
cd frontend && npm run dev
```
처음 설치 방법은 README.md를 본다.

## Git·PR 규칙 (main 보호됨, 자세한 건 `docs/WORKFLOW.md`)
- main에서 작업하지 않는다. 작업 시작 시 main이면 먼저 최신 main을 받고 브랜치를 만든다 (`feat/`, `fix/`, `docs/`, `chore/` + 짧은 설명, 이슈가 있으면 번호 포함).
- main에 push하지 않는다. force push도 하지 않는다 (GitHub에서도 막혀 있다).
- push한 뒤에는 사용자에게 "GitHub에 올렸지만 아직 main에 합쳐지지 않았다"고 알리고, PR 만드는 방법을 안내하거나 직접 만들어 준다. 리뷰어(본인 말고 다른 팀원 1명) 지정도 안내한다.
- PR 설명은 `.github/pull_request_template.md` 양식으로 채운다.
- 커밋 작성자가 사용자 본인으로 기록되지 않는 환경(예: 웹 Claude Code)이면, 첫 커밋 전에 사용자의 GitHub 이름과 이메일을 물어보고 모든 커밋 메시지 끝에 `Co-authored-by: 이름 <이메일>` 줄을 넣는다. 로컬에서는 `git config user.email`이 비어 있으면 설정 방법(WORKFLOW.md 7번)을 안내한다.
- 이미 승인된 PR에 새 커밋을 올리면 승인이 취소된다. 올리기 전에 사용자에게 미리 알려준다.

## 작업 습관
- 처음 개발하는 팀원도 읽을 수 있게 변경 내용을 쉽게 설명한다.
- 중요한 결정이 생기면 `docs/DECISIONS.md`에 한 줄 추가를 제안한다.
- API 키, 인터뷰 원문, 개인정보는 커밋하지 않는다 (`.env`, `data/` 폴더 전체가 .gitignore에 있다).
- API 요청·응답 형식을 바꾸면 `backend/app/schemas.py`와 `frontend/src/lib/api.ts`를 함께 바꾼다.
- 멘토 이메일 등 연락처는 어떤 API 응답에도 넣지 않는다. 참여 동의(`consent`)가 false인 멘토는 어디에도 노출하지 않는다.
- backend를 바꾸면 `cd backend && pytest`, frontend를 바꾸면 `npm run lint && npm run build`로 확인한다.

## 태그 관리
- 데이터(조각·인물)에 쓰는 태그는 반드시 `docs/TAGS.md`에 있는 것만 쓴다. 저장은 영어 `code`, 화면·embed_text에는 한글 이름을 쓴다. `python scripts/check_tags.py`로 확인한다.
- 맞는 태그가 없으면 `etc` + 상세 칸(`topic_detail`, `path_detail`, `field_detail`)에 구체적인 내용을 적는다. 새 태그를 바로 만들지 않는다.
- 같은 상세 값이 career는 인물 3명 이상, topic은 조각 5개 이상 모이면 정식 태그로 승격한다 (TAGS.md 표·변경 기록 수정 + 기존 데이터 다시 태깅). 2명 이하뿐인 태그는 만들지 않는다. 승격 후보는 check_tags.py가 보여준다.
- 태그를 추가·변경·폐기하면 TAGS.md의 해당 표와 "변경 기록"을 같이 고치고, 기존 데이터도 새 태그로 바꾼다.
- 폐기된 태그는 지우지 않고 TAGS.md의 "폐기된 태그" 표로 옮긴다.
