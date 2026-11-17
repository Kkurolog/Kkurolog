# 메일 자동화 Supabase 이전 계획 (B 방식)

> 상태: **진행 중** (B-1 완료: 테이블 SQL, 2026-11-17 팀 Supabase에 적용 / B-2 완료: Apps Script 메일 전용 코드, 운영 시트 적용은 B-3 뒤). 이 문서는 단계마다 갱신합니다.
> 지금 운영 중인 구조(구글 시트 + Apps Script)는 B-3까지 끝나고 실제 왕복 테스트를 통과할 때까지 그대로 둡니다.

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
| B-3 | 백엔드: Supabase에서 멘토 읽기(`mentors_demo.json` 대신), 문의 처리(검사·횟수 제한·번호·기록·sendMail), 답장 처리, 리마인드, 내부 API, 테스트 | |
| B-4 | 데이터 옮기기: 데모 멘토 프로필 + 시트 멘토 메일, 기존 문의 기록을 Supabase로 적재하는 스크립트 (실제 메일은 git에 올리지 않음) | |
| B-5 | 관리자 API (문의 목록·상세, 멘토 수정, 설정 수정) + 관리자 로그인 방식 | |
| 마무리 | 실제 왕복 테스트, 문서(README·HANDOVER·BACKEND_INTEGRATION) 정리, PR | |

## 6. 바뀌거나 없어지는 것

- **구글 시트**: 저장소로 쓰지 않습니다. Apps Script는 지금 시트에 붙은 프로젝트를 그대로 씁니다 (웹앱 링크·키·트리거 유지). 시트의 메뉴("메일 자동화")만 쓰고, 탭은 비워 두거나 지워도 됩니다.
- **`apps-script/src/Admin.gs`(관리자 API)**: B-2에서 지웠습니다. 관리자 조회는 백엔드가 Supabase에서 직접 합니다 (B-5). 시트·판단 관련 파일(`Sheets`, `Mentors`, `Inquiries`, `MailTemplates`, `ReplyParser`, `Replies`)과 `templates/*.csv`도 지웠습니다. 메일 문장 만들기·인용문 지우기는 B-3에서 백엔드(파이썬)로 옮깁니다.
- **`apps-script/docs/BACKEND_INTEGRATION.md`**: 시트 방식 기준의 연결 안내라 B-3이 끝나면 새 구조로 다시 씁니다.
- **`backend/app/data/mentors_demo.json`**: B-3에서 `mentors` 테이블로 바뀝니다. 테스트용 가짜 데이터로만 남길지 B-3에서 정합니다.
- **인수인계**: "시트 사본 + 계정 교체"에서 "관리자 페이지로 운영 + 처음 한 번 설치(Supabase·백엔드·Apps Script)"로 바뀝니다. `HANDOVER.md`는 마무리 단계에서 다시 씁니다.
