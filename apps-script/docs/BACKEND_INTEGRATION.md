# 백엔드·프론트 연결 안내 — 백엔드·프론트 담당자용

멘토 문의 메일 자동화가 백엔드·프론트와 어떻게 연결되어 있는지 정리한 문서입니다.
2026-11-20에 운영 환경(Vercel 사이트 → Render 백엔드 → Supabase → 운영 Apps Script → Gmail)에서 실제 왕복 테스트를 마친 구조입니다.

- 전체 구조·동작: [../README.md](../README.md)
- 백엔드 ↔ Apps Script 형식: [API.md](./API.md) v1.0
- 관리자 API 형식: [ADMIN_API.md](./ADMIN_API.md)
- 이전 버전(시트 방식, API v0.6)의 연결 안내는 git 기록에만 남아 있습니다.

```
학생 폼 → POST /contact-requests ─┬─ Supabase (mentors, inquiries, mail_settings, inquiry_counters)
                                  └─ Apps Script 웹앱 sendMail → 중계 Gmail → 멘토 / 학생 사본
Apps Script 5분 트리거 → POST /internal/mail/inbound   → 판단·기록(mail_replies) → sendMail → 학생
Apps Script 매일 트리거 → POST /internal/mail/reminders → 대상 찾기 → sendMail → 멘토
관리자 → /admin/* → Supabase
```

---

## 1. 코드 위치

| 위치 | 내용 |
|---|---|
| `backend/app/services/mentors.py` | 멘토 목록·추천. `MAIL_ENABLED=true`면 Supabase `mentors`, 아니면 `app/data/mentors_demo.json`. 동의 필터·이메일 제거는 항상 여기서 |
| `backend/app/services/contact.py` | `POST /contact-requests`. `MAIL_ENABLED=true`면 `app/mail/contact_flow.py`, 아니면 로그만 |
| `backend/app/mail/` | 메일 흐름 전체 (구성은 `backend/CLAUDE.md`). 문의, 답장 처리, 리마인드, Supabase·웹앱 호출, 메일 문장 |
| `backend/app/admin/` | 관리자 API (`/admin/*`), 공용 비밀번호 로그인 |
| `supabase/migrations/0002_mail_tables.sql` | 메일 테이블·규칙·문의번호 함수 |
| `scripts/load_mentors.py` | demo 멘토 프로필을 Supabase에 넣기 (`scripts/README.md`) |
| `apps-script/src/` | 중계 Gmail 쪽 코드 |

## 2. 환경변수 (`backend/.env`, Render → Environment)

| 이름 | 값 | 없으면 |
|---|---|---|
| `MAIL_ENABLED` | `true` / `false`(기본) | demo: 멘토는 JSON, 문의는 로그만 |
| `SUPABASE_URL` | `https://(프로젝트ID).supabase.co` (**끝에 `/rest/v1` 붙이지 않음**) | `MAIL_ENABLED=true`면 문의 503 |
| `SUPABASE_KEY` | service_role 키 (RAG와 같은 값) | 〃 |
| `APPS_SCRIPT_URL` | 운영 웹앱 URL (`…/exec`) | 〃 |
| `APPS_SCRIPT_API_KEY` | 웹앱 스크립트 속성 `API_KEY`와 같은 값 | 〃 |
| `MAIL_WEBHOOK_SECRET` | 웹앱 스크립트 속성 `MAIL_WEBHOOK_SECRET`과 같은 값 | 내부 API 503 |
| `ADMIN_PASSWORD` | 관리자 공용 비밀번호, 12자 이상 | 관리자 API 503 |
| `FRONTEND_ORIGINS` | 사이트 주소(쉼표로 여러 개). 관리자 페이지 주소가 다르면 추가 | CORS 막힘 |

- 값은 메일 담당·Supabase 관리자에게 1:1로 받습니다. 저장소·채팅에 쓰지 않습니다.
- 로컬 개발은 `MAIL_ENABLED`를 비워 두면(= false) 키 없이 화면을 만들 수 있습니다. 로컬에서 `true`로 켜면 **운영 Supabase에 실제 기록이 남고 실제 메일이 나갑니다.** 확인이 필요하면 [README 5-4](../README.md#5-4-운영을-건드리지-않고-고친-코드를-확인하고-싶을-때-테스트-사본)의 테스트 사본 방법을 씁니다.
- `pytest`는 `tests/conftest.py`가 메일 환경변수를 지워서 항상 demo로 돕니다.

## 3. 학생 화면 API (`backend/app/schemas.py` ↔ `frontend/src/lib/api.ts`)

형식은 바뀌지 않았습니다. `MAIL_ENABLED=true`일 때 달라지는 점만 적습니다.

**`GET /mentors`, `POST /mentors/recommend`**
- Supabase `mentors`에서 읽습니다. `consent=false`는 어디에도 안 나오고, `exit_year`가 비어 있는 멘토도 목록에서 뺍니다 (서버 로그 경고).
- `available=false`면 목록에는 나오지만 추천·연락 대상에서 빠집니다. 응답에 `email`은 없습니다.

**`POST /contact-requests`**
| 상태 | 언제 | `detail` (학생에게 그대로 보여 줌) |
|---|---|---|
| 201 | 문의 저장 + 멘토 메일 성공 (학생 사본은 실패해도 201) | — |
| 404 | 없는 멘토 | |
| 409 | 연락 불가 멘토 (`available=false`, 메일 없음) | 이 선배는 지금 연락을 받지 않아요. |
| 422 | 입력 형식 오류 | (FastAPI 목록 형식) |
| 429 | 같은 학생 메일 횟수 제한 | 현재 메일 발송량이 많아 전송이 잠시 제한되었어요. 10분 후 다시 시도해 주세요. / 같은 메일 주소로는 하루에 5건까지 … |
| 503 | 설정 빠짐, 오늘 Gmail 한도 부족, 발송 실패 | 지금은 문의를 보낼 수 없어요. … / 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요. |
| 502 | Supabase·메일 웹앱 연결 문제 | 지금은 문의를 보낼 수 없어요. 잠시 후 다시 시도해 주세요. |

- 실패하면 문의는 저장되지 않습니다 (멘토 메일이 실패하면 저장한 문의를 지움).
- 학생 메일은 소문자로 저장합니다. 횟수 숫자는 관리자 설정(`rateLimit…`)을 따라 바뀝니다.
- Render 무료 플랜이 잠들어 있으면 첫 요청이 30~60초 걸릴 수 있습니다. 프론트는 보내는 중 표시를 충분히 길게 유지합니다.

## 4. 내부 API (`/internal/mail/*`)
Apps Script만 부릅니다. 헤더 `X-Kkurolog-Mail-Secret`가 맞아야 하고(틀리면 401), `/docs` 목록에는 보이지 않습니다. 형식은 [API.md 2장](./API.md#2-apps-script--백엔드).
- `MAIL_ENABLED=false`이거나 설정이 빠졌거나 Supabase가 응답하지 않으면 503 → Apps Script는 처리하지 않은 것으로 보고 다음 차례에 다시 보냅니다.

## 5. 관리자 페이지를 만들 때
- 형식은 [ADMIN_API.md](./ADMIN_API.md), 타입 원본은 `backend/app/admin/models.py`입니다. 프론트 타입은 학생용 `api.ts`와 섞지 않고 따로 만듭니다 (응답에 학생·멘토 메일이 있음).
- 로그인 표는 메모리나 `sessionStorage`에 두고, 401이면 로그인 화면으로 보냅니다. 기록 내용을 `localStorage`에 남기지 않습니다.
- 시각은 이미 한국 시간(`+09:00`)으로 옵니다.
- 지금은 관리자가 백엔드 `/docs`에서 같은 기능을 씁니다 ([HANDOVER 1부](./HANDOVER.md#1부-평소-운영-관리자용)).

## 6. 테스트
```bash
cd backend && pytest
```
| 파일 | 내용 |
|---|---|
| `tests/test_mail_parser.py` | 답장에서 문의번호 찾기, 인용문 지우기 |
| `tests/test_mail_flow.py` | 문의·횟수 제한·한도·실패 시 삭제·답장 전달·중복·확인필요·리마인드·내부 API (가짜 저장소 `FakeStore`, 가짜 웹앱 `FakeMail`) |
| `tests/test_mail_store.py` | Supabase REST 요청 모양 (`httpx.MockTransport`) |
| `tests/test_admin.py` | 관리자 로그인·목록·상세·멘토·설정·한국 시간 |

진짜 Supabase·Gmail은 부르지 않습니다. 새 동작을 추가하면 가짜 저장소에 같은 메서드를 더해 테스트합니다.

## 7. 자주 생기는 문제
| 증상 | 원인·해결 |
|---|---|
| Supabase 404 `PGRST125` | `SUPABASE_URL` 끝에 `/rest/v1`이 붙어 있음 → 프로젝트 주소까지만 |
| 문의 503 "지금은 문의를 보낼 수 없어요" | `MAIL_ENABLED=true`인데 환경변수 5개 중 빠진 것이 있음 (서버 로그에 이름이 나옴) |
| 문의 502 | `APPS_SCRIPT_URL`·`APPS_SCRIPT_API_KEY`가 틀림, 또는 웹앱을 "새 배포"해서 URL이 바뀜 |
| 답장이 전달되지 않음, Apps Script 로그에 401 | `MAIL_WEBHOOK_SECRET` 값이 양쪽이 다름 → `testBackendConnection`으로 확인 |
| `/docs`에서 관리자 API 401 | 오른쪽 위 **Authorize**에 token만 넣었는지 (`Bearer` 중복, 12시간 만료) |
| Windows에서 `uvicorn` 실행이 막힘 | 애플리케이션 제어 정책 → `python -m uvicorn app.main:app --reload` |
| 사이트 멘토 목록이 비어 있음 | Supabase `mentors`에 `consent=true`이고 `exit_year`가 있는 멘토가 없음 |
