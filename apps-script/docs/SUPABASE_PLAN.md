# 메일 자동화 Supabase 이전 계획 (B 방식)

> 상태: **완료** (2026-11-20). B-1~B-5 코드·데이터를 main에 합치고(PR #18) 운영에 적용, 실제 왕복 테스트 통과 (11장).
> 이 문서는 옮긴 이유·결정·확인 기록입니다. 지금 구조와 사용법은 [README](../README.md), 운영·인수인계는 [HANDOVER.md](./HANDOVER.md)를 봅니다.

## 1. 왜 바꾸나

지금은 멘토 정보가 두 곳(백엔드 `mentors_demo.json`의 프로필·`available`, 구글 시트 "멘토" 탭의 메일·활성여부)에 나뉘어 있고,
문의 기록·설정은 구글 시트에만 있습니다. 두 곳을 맞추지 않으면 "사이트에서는 연락 가능인데 메일이 안 가는" 일이 생깁니다.

관리자 페이지를 만들면서 저장소를 **Supabase 한 곳**으로 합칩니다.

| 정한 것 (2026-11-17) | 내용 |
|---|---|
| 저장소 | 멘토·문의·답장 기록·메일 설정을 모두 Supabase에 둔다. 구글 시트는 쓰지 않는다 |
| 판단하는 곳 | 검사, 횟수 제한, 문의번호, 기록, 답장 판단(문의번호 찾기·보낸 사람 확인·인용문 지우기), 리마인드 대상 찾기를 **백엔드**가 한다 |
| Apps Script 역할 | 메일 보내기, 받은 메일을 백엔드로 넘기기, 시간 트리거만 한다 (중계 Gmail 계정을 쓰기 위해 남김) |
| 멘토 테이블 | 새 `mentors` 테이블. 인터뷰 인물(`people`)과는 따로 두고, 같은 사람이면 `person_id`로 연결 |
| 운영·인수인계 | 관리자는 **관리자 페이지에서만** 멘토·설정·문의 기록을 보고 고친다. 중계 Gmail·Apps Script 배포·서버 환경변수는 처음 한 번 설치 |
| 작업 범위 | 메일 담당이 `apps-script/`, `supabase/migrations/`, `backend/`, `scripts/`를 같은 브랜치에서 고치고, 백엔드 담당이 리뷰 |

## 2. 구조

```
학생 폼 → 백엔드 ─┬─ Supabase: mentors · inquiries · mail_replies · mail_settings (유일한 저장소)
                  └─ Apps Script(sendMail) → 중계 Gmail → 멘토 / 학생 사본

멘토 답장 → 중계 Gmail → Apps Script 5분 트리거 → 백엔드 /internal/mail/inbound
          → 백엔드가 판단·기록(Supabase) → Apps Script(sendMail)로 학생에게 전달

Apps Script 매일 트리거 → 백엔드 /internal/mail/reminders → 백엔드가 대상 찾고 sendMail
관리자 페이지 → 백엔드(관리자 로그인 확인) → Supabase 조회·수정
```

- 학생 화면(프론트)은 Supabase를 직접 읽지 않습니다. 모든 조회는 백엔드를 거칩니다 (DECISIONS.md 2026-11-09).
- 비밀값은 두 방향입니다.
  - 백엔드 → Apps Script: 지금의 `API_KEY` (Apps Script 스크립트 속성 ↔ 백엔드 `APPS_SCRIPT_API_KEY`)
  - Apps Script → 백엔드: 새 비밀값 `MAIL_WEBHOOK_SECRET` (Apps Script 스크립트 속성 ↔ 백엔드 환경변수)

## 3. Supabase 테이블 (B-1, `supabase/migrations/0002_mail_tables.sql`)

| 테이블 | 지금 위치 | 내용 |
|---|---|---|
| `mentors` | `mentors_demo.json` + 시트 "멘토" 탭 | id(mt-01), 이름, 엑시트 연도, 경로·요약·태그·주제, `consent`(참여 동의), `available`(문의 받음), `email`(백엔드만), `person_id`(선택) |
| `inquiries` | 시트 "문의" 탭 | 문의번호, 보낸 일시, mentor_id, 학생 이름·메일, 제목, 내용, 답장 여부·첫 답장 일시, 리마인드 일시 |
| `mail_replies` | (새로 생김) Apps Script가 기억하던 처리 기록 | 멘토 답장 한 통마다 한 줄: Gmail 메일 ID, 문의번호, 보낸 주소, 받은 시각, 결과(`forwarded`/`needs_review`/`failed`), 이유, 전달한 본문 |
| `mail_settings` | 시트 "설정" 탭 | 키·값·설명 16개 (기본값이 SQL에 들어 있음) |
| `inquiry_counters` | (새로 생김) | 날짜별 문의번호 순번. `next_inquiry_id()` 함수가 씀 |

**규칙 (DB가 직접 막는 것)**
- `available = true`인 멘토는 `consent = true`이고 `email`이 있어야 합니다. 메일 없는 멘토에게 문의가 가는 일이 생기지 않습니다.
- 문의 기록이 있는 멘토는 지울 수 없습니다. 쉬게 할 때는 `available`을 끕니다.
- 문의번호 형식 `q날짜-순번`, 이름 1~30자, 제목 1~100자, 내용 1~2000자, `replied`와 `replied_at`은 같이 움직입니다.
- `updated_at` 자동 갱신 함수는 다른 기능과 이름이 겹치지 않게 `mail_set_updated_at()`으로 만들었습니다.
- 모든 테이블은 RLS를 켜고 정책이 없습니다. 학생 화면(anon)은 아무것도 읽지 못하고, 백엔드(service_role)만 읽고 씁니다.
- `next_inquiry_id()`: 한국 날짜마다 0001부터 번호를 만듭니다. 동시에 여러 요청이 와도 겹치지 않습니다 (30개 동시 호출로 확인). 발송 실패로 지운 문의의 번호는 건너뜁니다.

**확인한 것**: 로컬 PostgreSQL 16 + pgvector에서 0001 → 0002 실행, 0002 두 번 실행(다시 실행해도 안전), 위 제약·권한·트리거 동작.

**적용 기록 (2026-11-17, 팀 Supabase, Postgres 17)**: 적용 전 확인(경험 데이터 39/40/274 있음, 같은 이름 테이블·함수 없음) → `run_sql.py`로 실행 → 테이블 5개 생성, `mail_settings` 16행, 경험 데이터 39/40/274 그대로.

**`people.is_mentor`**: 멘토 여부는 이제 `mentors` 테이블(필요하면 `person_id`로 연결)로 판단하므로 쓰지 않습니다. 데이터 스크립트(`build_dataset.py`)가 이 칸을 항상 false로 덮어쓰기 때문에, 멘토 정보를 `people`에 두지 않기로 했습니다. 칸 삭제는 경험 데이터 쪽 작업이라 그대로 둡니다.

**실행 방법** (팀원 중 Supabase 접속 정보가 있는 사람)
```bash
cd scripts && source .venv/bin/activate
python run_sql.py ../supabase/migrations/0002_mail_tables.sql
python run_sql.py --query "select count(*) from public.mail_settings"   # 16 이면 성공
```

## 4. 백엔드 ↔ Apps Script 약속 (B-2에서 확정)

자세한 형식은 [API.md](./API.md) v1.0에 있습니다. 요약:

| 방향 | 주소·action | 언제 | 인증 |
|---|---|---|---|
| 백엔드 → Apps Script | `sendMail` (받는 사람, 문의번호(선택), 보낸 이름, 제목, 글자·HTML 본문) | 문의·사본·답장 전달·리마인드를 보낼 때 | 본문 `apiKey` |
| 백엔드 → Apps Script | `getQuota` (오늘 남은 발송 수) | 문의 저장 전 (2통 필요) | 본문 `apiKey` |
| Apps Script → 백엔드 | `POST /internal/mail/inbound` (답장 후보, 최대 5통씩) | 5분마다 | 헤더 `X-Kkurolog-Mail-Secret` |
| Apps Script → 백엔드 | `POST /internal/mail/reminders` | 매일 10~11시 | 헤더 `X-Kkurolog-Mail-Secret` |

- **답장 주소(Reply-To)는 Apps Script가 만듭니다.** 백엔드는 `replyToInquiryId`(문의번호)만 넘기고, 웹앱이 `중계계정+문의번호@도메인`을 만듭니다. 백엔드는 중계 메일 주소를 몰라도 되고, 기관 계정으로 바뀌어도 백엔드 설정은 그대로입니다.
- **관계없는 메일은 백엔드로 보내지 않습니다.** Apps Script는 받는 주소에 `+문의번호`가 있거나 본문에 `문의번호: q…` 줄이 있는 메일만 넘깁니다. 최종 판단(진짜 그 문의인지, 보낸 사람이 멘토인지)은 백엔드가 합니다.
- **백엔드가 응답하지 않으면** Apps Script는 그 메일을 처리 완료로 기억하지 않고 다음 차례에 다시 보냅니다. 백엔드는 `mail_replies.message_id`로 같은 메일을 한 번만 처리합니다.
- Render 무료 플랜은 15분 동안 요청이 없으면 잠들고 깨는 데 30~60초가 걸립니다. 5분 트리거가 자주 깨우므로 보통은 깨어 있습니다.

**Apps Script 스크립트 속성 (B-2)**
| 이름 | 누가 넣나 | 백엔드 환경변수 |
|---|---|---|
| `API_KEY` | setup이 만듦 | `APPS_SCRIPT_API_KEY` (같은 값) |
| `MAIL_WEBHOOK_SECRET` | setup이 만듦 | `MAIL_WEBHOOK_SECRET` (같은 값) |
| `BACKEND_URL` | 직접 추가 (예: `https://YOUR_BACKEND.onrender.com`) | — |
| `TEST_STUDENT_EMAIL` | 직접 추가 (테스트 메일 받을 주소) | — |
| (이전 버전) `ADMIN_TOKEN` | setup이 지움 | — |

- 다른 계정이 프로젝트를 복사해 setup을 실행하면 `API_KEY`, `MAIL_WEBHOOK_SECRET`, `BACKEND_URL`, 처리 기록을 지우고 새로 만듭니다. 복사본이 이전 팀의 백엔드로 학생 메일을 넘기는 일을 막기 위해서입니다.
- 트리거 함수 이름(`checkReplies`, `sendReminders`)은 바꾸지 않았습니다. 코드를 바꿔 붙여넣어도 기존 트리거가 그대로 새 코드를 부릅니다.

## 5. 단계

| 스텝 | 내용 | 상태 |
|---|---|---|
| **B-1** | Supabase 테이블 SQL + 이 설계 문서 + `docs/DATA.md` 갱신 | ✅ (팀 Supabase 적용 완료) |
| **B-2** | Apps Script를 메일 전용으로 정리 (`sendMail`·`getQuota` action, 받은 메일을 백엔드로 넘기기, 리마인드 트리거가 백엔드를 부르기). 시트 읽기·쓰기 코드 삭제 | ✅ 코드 완료 (운영 시트 적용은 B-3 뒤) |
| **B-3** | 백엔드: Supabase에서 멘토 읽기(`mentors_demo.json` 대신), 문의 처리(검사·횟수 제한·번호·기록·sendMail), 답장 처리, 리마인드, 내부 API, 테스트 | ✅ 코드 완료 (`backend/app/mail/`, pytest 158개 통과). `MAIL_ENABLED=true`로 켜기 전까지는 예전과 같이 동작 |
| **B-4** | 데이터 옮기기: 멘토 프로필은 `scripts/load_mentors.py`로, 실제 메일·연락 가능은 Table Editor에서 직접. 기존 시트 문의(팀 테스트)는 옮기지 않고 새로 시작 | ✅ 스크립트 완료 (팀 Supabase 적용은 직접) |
| **B-5** | 관리자 API (문의 목록·상세, 멘토 수정, 설정 수정) + 관리자 로그인 방식 | ✅ 코드 완료 (`backend/app/admin/`, 명세 [ADMIN_API.md](./ADMIN_API.md), pytest 179개) |
| 마무리 | 운영 적용, 실제 왕복 테스트, 문서(README·HANDOVER·BACKEND_INTEGRATION) 정리, 관리자 응답 시각을 한국 시간으로 | ✅ 2026-11-20 (11장) |

## 6. 바뀌거나 없어지는 것

- **구글 시트**: 저장소로 쓰지 않습니다. Apps Script는 지금 시트에 붙은 프로젝트를 그대로 씁니다 (웹앱 링크·키·트리거 유지). 시트의 메뉴("메일 자동화")만 쓰고, 탭은 비워 두거나 지워도 됩니다.
- **`apps-script/src/Admin.gs`(관리자 API)**: B-2에서 지웠습니다. 관리자 조회는 백엔드가 Supabase에서 직접 합니다 (B-5). 시트·판단 관련 파일(`Sheets`, `Mentors`, `Inquiries`, `MailTemplates`, `ReplyParser`, `Replies`)과 `templates/*.csv`도 지웠습니다. 메일 문장 만들기·인용문 지우기는 B-3에서 백엔드(파이썬)로 옮깁니다.
- **`apps-script/docs/BACKEND_INTEGRATION.md`**: 새 구조 기준으로 다시 썼습니다 (2026-11-20).
- **`backend/app/data/mentors_demo.json`**: `MAIL_ENABLED=false`(로컬 개발·테스트)일 때 쓰는 가짜 데이터로 남깁니다. 운영 멘토는 Supabase `mentors`입니다.
- **인수인계**: "시트 사본 + 계정 교체"에서 "관리자 기능으로 운영 + 처음 한 번 설치(Supabase·백엔드·Apps Script)"로 바뀌었습니다. [HANDOVER.md](./HANDOVER.md) (2026-11-20).

## 7. 백엔드 구현 (B-3)

`backend/app/mail/` (구조는 `backend/CLAUDE.md`).

| 정한 것 | 내용 |
|---|---|
| 스위치 | `MAIL_ENABLED=true`일 때만 새 방식. 꺼져 있으면(기본) 멘토는 `mentors_demo.json`, 문의는 로그만 (예전과 같음). `SUPABASE_URL/KEY`는 RAG도 쓰기 때문에, RAG를 켰다고 멘토 목록이 바뀌지 않게 스위치를 따로 둠 |
| Supabase 연결 | 이미 설치된 `httpx`로 REST API를 직접 부름 (`store.py`). `supabase` 패키지를 기본 설치에 넣지 않음 |
| 학생 메일 | 소문자로 저장 (횟수 제한을 대소문자 상관없이 세기 위해) |
| 문의 실패 응답 | 429 너무 자주(웹앱 시절과 같은 문구), 503 발송 실패·한도 부족·설정 빠짐, 502 Supabase·메일 웹앱 연결 문제. `detail`에 학생용 문구 |
| 답장 처리 결과 | `forwarded` / `needs_review`(보낸 사람이 멘토가 아님 `sender_mismatch`, 내용 없음 `empty_body`) / `ignored`(문의번호 없음·없는 문의) / `retry`(학생에게 전달 실패, 기록 안 함) |
| 리마인드 | 한국 날짜 기준 `reminderDays`일째부터 대상, 한 번에 최대 30통, 비활성 멘토 건너뜀, 한도 부족이면 다음 날 |
| 멘토 목록 | Supabase `mentors`에서 `exit_year`가 비어 있는 멘토는 화면에서 뺌 (로그 경고) |

**확인한 것 (pytest 158개 통과)**: 기존 92개(스위치 꺼짐 = 예전과 같음) + 답장 정리·메일 문장 22개 + 흐름 31개(가짜 Supabase·가짜 메일 웹앱: 문의, 횟수 제한, 한도, 실패 시 삭제, 답장 전달·중복·확인필요·재시도, 리마인드, 내부 API 인증) + Supabase 요청 모양 13개.

**아직 확인하지 않은 것**: 진짜 Supabase·진짜 메일 웹앱과의 연결. B-4(데이터 옮기기) 뒤에 팀 Supabase + 운영 Apps Script로 실제 왕복 테스트를 한다.

## 8. 데이터 옮기기 (B-4)

| 정한 것 (2026-11-18) | 내용 |
|---|---|
| 멘토 프로필 | `scripts/load_mentors.py`가 `mentors_demo.json`의 10명(mt-01~10)을 넣음. 메일 없음, 연락 가능 false. 다시 돌려도 **이미 있는 멘토는 건드리지 않음** (대시보드에서 고친 이름 유지). JSON으로 덮어쓰려면 `--update-profiles` |
| 실제 메일·연락 가능 | Supabase 대시보드 Table Editor에서 mt-01~06에 직접 입력 (메일 주소가 파일·git에 남지 않음). **email을 먼저 넣고 available을 켬** (DB 규칙상 반대 순서는 막힘) |
| mt-07~09 | 메일 없이, 연락 가능 false로 둠 (프로필은 사이트에 보이고 연락만 막힘) |
| mt-10 | 참여 동의 false로 넣음. 어디에도 보이지 않음. 나중에 동의하면 consent만 켜면 됨 |
| 기존 시트 문의 | 팀 테스트 문의라 옮기지 않고 새로 시작. 전환 뒤 예전 테스트 메일에 온 답장은 "없는 문의"로 무시됨 |

**확인한 것**: 로컬 PostgreSQL(0001+0002)에서 `--dry-run`은 DB를 바꾸지 않음, 실제 실행 시 10명, 메일 없이 available=true는 DB가 막음, 이름을 바꾼 뒤 다시 실행해도 이름·email·available 유지(빠진 멘토만 새로 넣음), `--update-profiles`는 프로필만 덮어쓰고 email·available 유지.

## 9. 관리자 API (B-5)

명세: [ADMIN_API.md](./ADMIN_API.md). 구현: `backend/app/admin/`.

| 정한 것 (2026-11-18) | 내용 |
|---|---|
| 로그인 | **공용 비밀번호 하나** (`ADMIN_PASSWORD`, 12자 이상). 관리자를 구분하지 않음. 맞으면 12시간 로그인 표(서명한 글자, DB에 저장 안 함). 비밀번호를 바꾸면 기존 표는 모두 무효 |
| 시도 제한 | 같은 IP에서 10분에 10번 (서버 메모리) |
| 범위 | 문의 목록(최신순·답장 필터·20건씩)·상세(+답장 내역), 확인필요 목록, 멘토 목록(메일 포함)·추가·수정, 설정 보기·수정 |
| 변경 기록 | 남기지 않음 |
| 멘토 삭제 | 없음. 쉬게 할 때는 `available: false` (문의 기록이 멘토를 참조) |
| 형식 위치 | `backend/app/admin/models.py` (학생용 `schemas.py`와 분리). 프론트 타입은 관리자 페이지를 만들 때 추가 |
| CORS | `PATCH` 허용 추가. 관리자 페이지 주소가 다르면 `FRONTEND_ORIGINS`에 추가 |

**확인한 것 (pytest 179개 통과)**: 기존 158 + 관리자 15(로그인·시도 제한·표 만료·위조·비밀번호 변경, 목록 페이지·필터, 상세·답장 내역·확인필요, 멘토 추가·중복·규칙 위반·수정·메일 지우기, 설정 수정·검증·다음 메일 반영) + 요청 모양 6.

## 10. merge 전 실제 Supabase 연결 확인 (2026-11-18)

메일 담당 컴퓨터(Windows)에서 백엔드를 `MAIL_ENABLED=true`로 켜고 팀 Supabase에 연결해 확인했다. 메일 웹앱 주소는 일부러 가짜로 넣어 메일은 보내지 않았다.

| 확인 | 결과 |
|---|---|
| `GET /mentors` | Supabase `mentors`의 이름(대시보드에서 바꾼 이름)이 나옴, mt-10 숨김, 연락 가능 mt-01~06, 메일 주소 없음 |
| 관리자 로그인·멘토 목록(메일 포함)·설정 16개·문의 0건·확인필요 0건 | 200 |
| 메일 없는 멘토를 연락 가능으로 | 422 (DB 규칙) |
| 없는 문의번호 | 404 |
| 설정 수정(같은 값) | 200 |
| 출입증 없이 관리자 API | 401 |
| 문의 보내기 (메일 웹앱 연결 실패) | 502, 문의 저장 안 됨 (0건 그대로) |

**이때 찾아서 고친 것**
- `SUPABASE_URL`에 대시보드의 REST 주소(`…/rest/v1`)를 넣으면 404 PGRST125 → 끝의 `/rest/v1`을 떼고 쓰도록 수정. `.env.example`에 "프로젝트 주소까지만" 안내.
- `/docs`에서 관리자 API를 시험하면 출입증이 전달되지 않아 401 → 관리자 인증을 HTTP Bearer 방식으로 선언해 `/docs`에 Authorize 버튼이 생기게 수정 (관리자 페이지가 보내는 형식은 같음).
- Windows의 애플리케이션 제어 정책이 가상환경의 `uvicorn.exe`를 막음 → `python -m uvicorn app.main:app --reload`로 실행 (README·BACKEND_INTEGRATION에 반영).

**남은 확인**: 메일 웹앱과의 연결(sendMail·getQuota), Apps Script → 백엔드 자동 답장 전달 → 11장에서 확인.

## 11. 운영 적용과 실제 왕복 테스트 (2026-11-19 ~ 11-20)

**테스트 사본으로 먼저 확인 (2026-11-19)**: 운영 시트의 사본에 새 코드를 붙이고(setup·트리거는 실행 안 함) 웹앱을 따로 배포, 로컬 백엔드(`MAIL_ENABLED=true`)와 팀 Supabase로 확인.
| 확인 | 결과 |
|---|---|
| 문의 → 멘토 메일(Reply-To `중계계정+문의번호`) + 학생 사본, Supabase 기록, 관리자 조회 | 정상 |
| 답장(직접 만든 JSON을 `/internal/mail/inbound`로) | `forwarded`, 학생에게 인용문·멘토 주소 없이 전달, `replied=true` |
| 같은 메일 다시 | `forwarded`, 메일은 다시 안 감 |
| 다른 주소에서 온 답장 / 없는 문의번호 / 틀린 비밀값 | `needs_review`(`sender_mismatch`) / `ignored` / 401 |

정리: 테스트 문의 삭제(`inquiry_counters`는 문의번호 재사용을 막으려고 남김), 사본 웹앱 보관, 사본 시트 삭제.

**운영 적용 (2026-11-20)**
1. Render 백엔드: main 최신 커밋 배포 확인 (`SUPABASE_URL`·`SUPABASE_KEY`는 이미 있음).
2. 운영 Apps Script: `src/` 14개 파일로 교체, 옛 파일 삭제, `BACKEND_URL` 추가, setup(트리거 2개), 배포 관리 → 새 버전(URL 유지).
3. Render 환경변수 추가: `APPS_SCRIPT_URL`, `APPS_SCRIPT_API_KEY`, `MAIL_WEBHOOK_SECRET`, `ADMIN_PASSWORD`(운영용 새 값), `MAIL_ENABLED=true`.
4. 확인: 관리자 로그인·문의 0건, `testBackendConnection` ✅, 사이트 멘토 9명(동의한 멘토, 연락 가능 mt-01~06).

**실제 왕복 테스트 (Vercel 사이트에서)**: 문의 → 멘토 `[꾸로록 문의]` + 학생 `[꾸로록 보낸 문의]` → 멘토가 Gmail에서 '답장'(받는 주소 `+문의번호` 확인) → 5분 안에 학생에게 `[꾸로록 답장]`(멘토 문장만) → 관리자 상세 `replied=true`, `forwarded`. 리마인드 수동 실행 정상(대상 0건). 테스트 문의는 삭제.

**이때 바꾼 것**: 관리자 API가 시각을 UTC(`Z`)로 돌려줘 읽기 어려움 → 모든 관리자 응답 시각을 한국 시간(`+09:00`, 초 단위)으로 바꿈.

**운영 메모**
- mt-01~06은 팀원 메일을 넣은 demo 멘토로, 연락 가능 상태로 둡니다. 실제 졸업생으로 바꿀 때 관리자 API로 메일·프로필을 고칩니다.
- UptimeRobot이 `/health`를 주기적으로 불러 Render 무료 서버가 잠들지 않습니다.

## 12. 여러 번 왕복 (2026-11-21)

| 정한 것 | 내용 |
|---|---|
| 왕복 | 학생도 `[꾸로록 답장]` 메일에 '답장'하면 멘토에게 `[꾸로록 추가 질문]`으로 전달. 횟수·기간 제한 없음 |
| 보낸 사람 확인 | 그 문의의 멘토 메일 → 학생에게, 문의 때 적은 학생 메일 → 멘토에게, 둘 다 아니면 확인필요. 같은 주소면 멘토 |
| 학생 사본 | 지금처럼 답장해도 전달 안 됨 (멘토가 답하기 전 같은 질문이 두 번 가는 것을 막음) |
| 답장 여부·리마인드 | 멘토 첫 답장 기준 그대로 |
| 관리자 | 첫 왕복(학생 문의 + 멘토 첫 답장)만 봄. 그 뒤 메일은 `mail_replies.followup = true`로 중복 방지 표시만, 본문 저장 안 함 |
| 데이터 | `supabase/migrations/0003_mail_followup.sql`: `followup` 칸, 설정 키 2개(`mentorFollowupSubjectPrefix`, `mentorFollowupIntro`), `studentForwardFooter`를 "이 메일에 답장하면 멘토님께 전달돼요."로 (예전 기본 문구일 때만) |
| Apps Script | 변경 없음 (이미 `+문의번호` 메일을 넘기고, 중계 계정이 보낸 메일은 거름) |
| 신경 쓰지 않기로 한 것 | 미성년자 대화 정책, 자동 응답 반복, 발송 한도, 전달 속도, 대화 종료, 보낸 사람 위조, Apps Script 실행 시간 |
| 직접 확인할 것 | 메일 앱별 인용문 지우기 (실제 왕복 테스트에서) |

**적용 순서**: Supabase에 0003 실행 → (같은 날) merge·배포 → 실제 여러 번 왕복 테스트. 새 코드가 `followup` 칸을 쓰므로 SQL이 먼저다.

