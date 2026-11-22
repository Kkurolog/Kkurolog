# backend (Python + FastAPI)

## 구조
```
backend/
├─ app/
│  ├─ main.py            # 앱 시작점: CORS 설정, 모든 라우트
│  ├─ schemas.py         # 요청/응답 형식 (Pydantic). 프론트 lib/api.ts 타입과 맞춘다
│  ├─ data/
│  │  └─ mentors_demo.json  # 가짜 멘토 10명 (이메일 포함 = 내부 전용, mt-10은 동의 안 함)
│  ├─ services/
│  │  ├─ answer.py       # 답변 생성 로직. 지금은 demo, 나중에 실제 RAG로 교체할 곳
│  │  ├─ mentors.py      # 멘토 목록(동의한 멘토만) + 추천. MAIL_ENABLED=true 면 Supabase mentors, 아니면 demo JSON
│  │  └─ contact.py      # 첫 연락 전달. MAIL_ENABLED=true 면 app/mail 로 실제 메일, 아니면 로그만
│  └─ mail/              # 멘토 문의 메일 (Supabase + 메일 웹앱). 설계: apps-script/docs/SUPABASE_PLAN.md
│     ├─ config.py       # 환경변수 (MAIL_ENABLED 등)
│     ├─ store.py        # Supabase 읽기·쓰기 (REST API, httpx). 테스트는 가짜로 바꿔 끼움
│     ├─ apps_script.py  # 메일 웹앱 호출 sendMail·getQuota (apps-script/docs/API.md v1.0)
│     ├─ mail_settings.py # 메일 문구·숫자 설정 (Supabase mail_settings + 기본값)
│     ├─ templates.py    # 메일 제목·본문 만들기
│     ├─ reply_parser.py # 멘토 답장에서 문의번호 찾기·인용문 지우기
│     ├─ contact_flow.py # 문의 보내기 (횟수 제한 → 번호 → 저장 → 멘토 메일 → 학생 사본)
│     ├─ inbound.py      # 멘토 답장 처리 (확인 → 학생에게 전달 → 기록)
│     ├─ reminders.py    # 10일째 리마인드
│     ├─ models.py       # 내부 API 요청·응답 형식 (프론트와 무관)
│     └─ router.py       # 내부 API /internal/mail/* (Apps Script 전용, 비밀 헤더 필요)
│  └─ admin/             # 관리자 API /admin/* (명세: apps-script/docs/ADMIN_API.md)
│     ├─ auth.py         # 공용 비밀번호(ADMIN_PASSWORD) 로그인 → 12시간 로그인 표, 10분 10회 시도 제한
│     ├─ models.py       # 관리자 요청·응답 형식 (학생용 schemas.py 와 분리)
│     └─ router.py       # 문의 목록·상세, 확인필요 목록, 멘토 목록·추가·수정, 설정 보기·수정
├─ tests/                # pytest 테스트 (API마다 하나씩)
├─ pytest.ini            # pytest 설정
├─ requirements.txt      # Python 패키지 목록
└─ .env.example          # 환경변수 예시 (복사해서 .env로)
```

## API
| 주소 | 요청 | 응답 |
|---|---|---|
| `GET /health` | - | `{"status": "ok"}` |
| `POST /ask` | `{question, previous_question?, previous_answer?, seen_source_ids?, safety_notice_shown?, crisis_notice_shown?, more_hint_shown?}` (대화 맥락은 선택, 저장 안 함) | `{answer, sources[], has_enough_evidence}` (형식 고정) |
| `GET /mentors` | - | `Mentor[]` (동의한 멘토만. `email`, `consent` 필드 없음) |
| `POST /mentors/recommend` | `{question}` | `{recommendations: [{mentor, reason}], is_fallback}` 최대 3명, 연락 가능한 멘토만 |
| `POST /contact-requests` | `{mentor_id, sender_name, reply_email, subject, message}` | 201 `{status: "delivered", message}` / 404 없는 멘토 / 409 연락 불가 / 422 입력 오류 / (MAIL_ENABLED) 429 너무 자주·503 발송 실패·502 연결 문제 (`detail`에 학생용 문구) |
| `POST /internal/mail/inbound` | Apps Script 전용. 헤더 `X-Kkurolog-Mail-Secret` | 멘토 답장 후보 처리 결과 (apps-script/docs/API.md 2장) |
| `POST /internal/mail/reminders` | Apps Script 전용. 헤더 `X-Kkurolog-Mail-Secret` | `{summary}` |
| `POST /admin/login` 외 `/admin/*` | 관리자 페이지 전용. `Authorization: Bearer <token>` | apps-script/docs/ADMIN_API.md |

## 실행
```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload    # http://localhost:8000/docs
pytest                           # 테스트
```

## 멘토 문의 메일 (MAIL_ENABLED)
- 기본은 꺼짐(demo): 멘토는 `mentors_demo.json`, 문의는 로그만. 키가 없어도 개발·테스트할 수 있다.
- 켜려면 `.env`에 `MAIL_ENABLED=true` + `SUPABASE_URL`, `SUPABASE_KEY`, `APPS_SCRIPT_URL`, `APPS_SCRIPT_API_KEY`, `MAIL_WEBHOOK_SECRET` (`.env.example` 참고).
  Supabase `mentors` 테이블에 데이터가 있어야 멘토 목록이 보인다.
- 테스트는 `tests/conftest.py`가 메일 관련 환경변수를 지워서 항상 demo로 돈다. 메일 테스트(`test_mail_*.py`)는 가짜 저장소·가짜 메일을 끼운다. 진짜 메일·DB는 부르지 않는다.
- 멘토 이메일·학생 이메일은 로그에 그대로 남기지 않는다 (`mask_email`).
- 관리자 API(`/admin/*`)는 `MAIL_ENABLED=true`와 `ADMIN_PASSWORD`(12자 이상)가 있어야 동작한다. 응답에 학생·멘토 메일이 들어 있으니 학생용 API 에 섞지 않는다.

## 규칙
- 응답 형식(`schemas.py`)을 바꾸면 `frontend/src/lib/api.ts`도 같이 바꾼다.
- 데모 데이터가 아닌 실제 인터뷰 원문이나 API 키는 코드에 넣지 않는다 (.env 사용).
- 멘토를 밖으로 내보낼 때는 항상 `services/mentors.py`의 함수를 거친다 (동의 필터 + 이메일 제거).
- 새 API를 만들면 `tests/`에 테스트를 하나 추가한다.
