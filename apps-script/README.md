# 꾸로록 메일 자동화

학생이 사이트에서 멘토에게 보낸 문의를 **중계 Gmail 계정**을 거쳐 멘토에게 보내고,
멘토가 그 메일에 '답장'하면 답장을 학생에게 자동으로 전달하는 기능입니다. 학생과 멘토는 받은 메일에 '답장'하는 것만으로 **여러 번 이어서** 주고받을 수 있습니다.
기록(멘토·문의·답장·메일 문구)은 모두 **Supabase**에 남고, 관리자는 **관리자 API(관리자 페이지)**에서 보고 고칩니다.

```
학생(사이트 폼) → 백엔드 ─┬─ Supabase에 문의 저장 (횟수 제한·문의번호·기록은 백엔드가 판단)
                          └─ Apps Script 웹앱(sendMail) → 중계 Gmail → 멘토  (+ 학생에게 "보낸 문의 사본")

멘토 '답장' → 중계 Gmail → Apps Script 5분 트리거 → 백엔드 /internal/mail/inbound
            → 백엔드가 확인·기록 → Apps Script(sendMail) → 학생에게 "[꾸로록 답장]"
학생 '답장' → (같은 길) → 멘토에게 "[꾸로록 추가 질문]" → 멘토 '답장' → 학생 … (계속)

Apps Script 매일 10~11시 → 백엔드 /internal/mail/reminders → 10일째 답장 없는 문의를 멘토에게 한 번 더
```

| 문서 | 누가 보나 | 내용 |
|---|---|---|
| **이 문서** | 꾸로록 팀(개발·운영) | 구조, 설치·코드 갱신, 테스트, 한계 |
| [docs/HANDOVER.md](./docs/HANDOVER.md) | 기관 담당자 + 다음 개발자 | 평소 운영(관리자 기능), 계정 옮기기·키 바꾸기 |
| [docs/BACKEND_INTEGRATION.md](./docs/BACKEND_INTEGRATION.md) | 백엔드·프론트 담당자 | 백엔드 코드 위치, 환경변수, 학생 화면 응답, 관리자 페이지 만들 때 |
| [docs/API.md](./docs/API.md) | 백엔드 담당자 | 백엔드 ↔ Apps Script 요청 형식 (v1.0) |
| [docs/ADMIN_API.md](./docs/ADMIN_API.md) | 관리자 페이지 담당자 | 관리자 API 형식 |
| [docs/SUPABASE_PLAN.md](./docs/SUPABASE_PLAN.md) | 참고 | 시트 → Supabase로 옮긴 이유·결정·확인 기록 |

---

## 0. 꼭 지켜야 할 규칙

1. **Apps Script 작업은 중계 계정(메일을 보내는 공용 구글 계정)으로 로그인한 상태에서만** 합니다.
   - 함수를 실행하거나 트리거를 만들거나 배포하면, **그 버튼을 누른 사람의 계정**으로 메일이 나갑니다.
   - 브라우저에 여러 구글 계정이 로그인돼 있으면 헷갈리기 쉽습니다. 크롬 프로필이나 시크릿 창을 따로 써서 중계 계정만 로그인합니다.
2. 이 저장소는 공개(public)입니다. 아래 값은 **코드·문서·커밋 메시지에 절대 적지 않습니다.**
   - `API_KEY`, `MAIL_WEBHOOK_SECRET`, `ADMIN_PASSWORD`, Supabase 키, 메일 주소(중계 계정·멘토·학생), 시트 ID, 스크립트 ID, 웹앱 URL, 백엔드 주소
   - 문서에는 `YOUR_API_KEY`, `YOUR_BACKEND.onrender.com` 같은 자리표시자만 씁니다.
   - 팀원에게 값을 전달할 때는 1:1로만 합니다. 단체 채팅방·GitHub에는 올리지 않습니다.
3. 관리자 API 응답과 중계 메일함에는 학생 이름·메일, 멘토 메일(개인정보)이 있습니다. 캡처해서 공유하지 않습니다.

---

## 1. 폴더 구조

```
apps-script/
├── README.md              ← 지금 이 문서
├── .gitignore             ← 비밀 파일이 올라가지 않게 막는 목록
├── .clasp.json.example    ← (나중에) clasp 연결 설정 예시. 실제 .clasp.json 은 올리지 않음
├── src/                   ← Apps Script 편집기에 들어가는 코드 14개 (편집기에서는 .gs 없이 같은 이름)
│   ├── appsscript.json    ← 프로젝트 설정 (시간대 = 한국, 웹앱 = 배포한 사람 계정으로 실행)
│   ├── Main.gs            ← 웹앱 입구. action(sendMail, getQuota)별로 나눔
│   ├── Config.gs          ← 상수, 스크립트 속성 이름, 비밀값 만들기(initSecrets), 중계 주소·plus 주소
│   ├── Response.gs        ← 공통 응답 형식과 에러 코드
│   ├── MailApi.gs         ← sendMail(입력 검사 → 발송), getQuota
│   ├── Mailer.gs          ← 실제 발송 (나중에 메일 발송 전문 서비스로 바꿀 때 이 파일만 교체)
│   ├── Receiver.gs        ← 중계 메일함 읽기·라벨 붙이기 (바꿀 때 이 파일만 교체)
│   ├── Backend.gs         ← 백엔드 호출 (BACKEND_URL + 비밀 헤더)
│   ├── Inbound.gs         ← checkReplies: 답장 후보를 골라 백엔드로 넘기고 결과대로 라벨
│   ├── Reminders.gs       ← sendReminders: 백엔드에 리마인드 실행을 요청
│   ├── Triggers.gs        ← 자동 실행 트리거 켜기/끄기
│   ├── Setup.gs           ← setup(): 설치·점검 한 번에
│   ├── Menu.gs            ← 시트 위쪽 "메일 자동화" 메뉴
│   └── Test.gs            ← 편집기에서 실행하는 점검 함수 4개
└── docs/                  ← 위 표의 문서들
```

백엔드 쪽 코드는 `backend/app/mail/`(메일 흐름)과 `backend/app/admin/`(관리자 API), 테이블은 `supabase/migrations/0002_mail_tables.sql`에 있습니다.

- 용어 풀이
  - **Apps Script**: 구글 시트·Gmail을 자동으로 다루는 구글의 무료 코드 실행 도구. 여기서는 중계 Gmail로 메일을 보내고 받기 위해서만 씁니다.
  - **바인딩된 스크립트**: 특정 시트에 붙어 있는 스크립트. 시트를 '사본 만들기'하면 스크립트도 같이 복사됩니다. 시트에는 이제 데이터를 저장하지 않고, 위쪽 메뉴만 씁니다.
  - **웹앱**: 백엔드가 Apps Script를 부를 수 있게 해 주는 인터넷 주소(`…/exec`).
  - **트리거**: 정해진 시간마다 함수를 자동 실행하는 예약.
  - **plus 주소**: `중계계정+q20261120-0001@gmail.com`처럼 `+` 뒤에 글자를 붙인 주소. 같은 메일함으로 오면서, 어느 문의에 대한 답장인지 알 수 있습니다.

---

## 2. 어떻게 동작하나요?

### 2-1. 문의 보내기
1. 학생이 사이트 폼(이름, 답장 받을 메일, 제목, 내용)을 보냅니다.
2. 백엔드가 확인합니다: 연락 가능한 멘토인지 → 같은 학생 메일 횟수 제한(10분에 3건, 하루 5건) → 오늘 남은 Gmail 발송 수가 2통 이상인지.
3. 문의번호(`q날짜-순번`, 한국 날짜 기준)를 만들어 Supabase `inquiries`에 저장합니다.
4. 멘토에게 `[꾸로록 문의] 제목` 메일을 보냅니다. **답장 주소(Reply-To)는 `중계계정+문의번호`**이고, 본문 맨 아래에 `문의번호: q…` 줄이 들어갑니다.
   - 멘토 메일이 실패하면 저장한 문의를 지우고 학생에게 실패 문구를 보여 줍니다.
5. 학생에게 `[꾸로록 보낸 문의] 제목` 사본을 보냅니다. (사본이 실패해도 문의는 성공으로 둡니다)

### 2-2. 답장 전달 (여러 번 왕복)
1. 5분마다 `checkReplies`가 중계 메일함에서 새 메일을 봅니다.
2. **답장 후보만** 백엔드로 넘깁니다: 받는 주소에 `+문의번호`가 있거나 본문에 `문의번호: q…` 줄이 있는 메일. 광고 같은 관계없는 메일은 넘기지 않습니다.
3. 백엔드가 판단합니다.

| 결과 | 언제 | 중계 메일함 라벨 |
|---|---|---|
| `forwarded` | 그 문의의 **멘토** 메일에서 옴 → 인용문을 지우고 학생에게 `[꾸로록 답장]`으로 전달<br>그 문의의 **학생** 메일(문의 때 적은 주소)에서 옴 → 멘토에게 `[꾸로록 추가 질문]`으로 전달 | `메일자동화/전달완료` |
| `needs_review` | 보낸 주소가 그 문의의 멘토·학생 메일과 다름(`sender_mismatch`), 전달할 내용이 없음(`empty_body`) | `메일자동화/확인필요` |
| `ignored` | 문의번호가 없거나 없는 문의 | 없음 |
| `retry` | 상대에게 보내기 실패, 백엔드가 응답 안 함 | 없음 (다음 차례에 다시) |

- 전달하는 메일의 답장 주소는 모두 `중계계정+문의번호`입니다. 그래서 받은 사람이 '답장'만 누르면 대화가 이어집니다.
- 멘토와 학생 주소가 같으면(팀 테스트) 멘토 답장으로 봅니다.
- 같은 메일은 한 번만 전달합니다 (Gmail 메일 ID로 확인).
- 학생에게 가는 메일에는 멘토 메일 주소가, 멘토에게 가는 메일에는 학생 메일 주소가 없습니다. 보낸 사람은 꾸로록(중계 계정)입니다.
- 학생 사본(`[꾸로록 보낸 문의]`)은 답장해도 전달되지 않습니다. 멘토가 답하기 전에 같은 질문이 두 번 가는 것을 막기 위해서입니다.
- **답장 여부(`replied`)와 리마인드는 멘토의 첫 답장 기준**입니다.
- **관리자는 첫 왕복(학생 문의 + 멘토 첫 답장)만** 봅니다. 그 뒤 메일은 같은 메일을 두 번 보내지 않기 위한 처리 표시(`mail_replies.followup = true`)만 남기고 **내용은 저장하지 않습니다.** 확인필요도 첫 왕복 것만 관리자 API에 나오고, 그 뒤 것은 중계 Gmail 라벨로만 보입니다.

### 2-3. 리마인드
- 매일 10~11시에 `sendReminders`가 백엔드에 요청합니다.
- 백엔드는 답장이 없고, 보낸 날짜로부터 `reminderDays`(기본 10)일째가 된 문의를 찾아 멘토에게 `[꾸로록 리마인드]`를 **한 번만** 보냅니다. 쉬는 멘토(`available=false`)는 건너뜁니다.
- 리마인드에 답장해도 학생에게 전달됩니다 (같은 plus 주소).

### 2-4. 값 연결 (비밀값은 두 방향)

| Apps Script 스크립트 속성 | 누가 넣나 | 백엔드(Render) 환경변수 |
|---|---|---|
| `API_KEY` | setup이 만듦 | `APPS_SCRIPT_API_KEY` (같은 값, **이름이 다름**) |
| `MAIL_WEBHOOK_SECRET` | setup이 만듦 | `MAIL_WEBHOOK_SECRET` (같은 값) |
| `BACKEND_URL` | 직접 추가: `https://YOUR_BACKEND.onrender.com` (끝에 `/` 없이) | — |
| `TEST_STUDENT_EMAIL` | 직접 추가 (점검용 테스트 메일 받을 주소) | — |
| `SETUP_OWNER`, `REPLY_LAST_CHECKED_AT`, `REPLY_PROCESSED_IDS` | 코드가 씀 (건드리지 않음) | — |
| — | 웹앱 URL(배포할 때 나옴) | `APPS_SCRIPT_URL` |
| — | — | `MAIL_ENABLED=true`, `SUPABASE_URL`, `SUPABASE_KEY`, `ADMIN_PASSWORD` |

---

## 3. 처음 설치

처음부터 새로 설치하거나 **기관 계정으로 옮길 때**의 순서는 [HANDOVER.md 2부](./docs/HANDOVER.md#2부-설치옮기기-다음-개발자용)에 있습니다.
요약하면 Supabase 테이블·멘토 → 백엔드 배포 → Apps Script(코드, `BACKEND_URL`, setup, 웹앱 배포) → 백엔드 환경변수 + `MAIL_ENABLED=true` → 실제 왕복 테스트입니다.

---

## 4. 코드를 바꿨을 때 (운영 Apps Script에 반영)

1. 중계 계정으로 운영 시트 → **확장 프로그램 → Apps Script**
2. 바뀐 파일을 GitHub `main`의 `apps-script/src/`에서 복사해 같은 이름의 파일에 통째로 붙여 넣고 **Ctrl+S**
   - 새 파일은 **＋ → 스크립트**로 만들고 이름은 `.gs` 없이 씁니다. `appsscript.json`은 **⚙ 프로젝트 설정 → "편집기에서 appsscript.json 매니페스트 파일 표시"**를 켜야 보입니다.
   - `src/`에 없는 파일이 편집기에 남아 있으면 지웁니다 (파일 이름 옆 **⋮ → 삭제**).
3. 운영 시트를 새로고침 → **메일 자동화 → ① 설치·점검 (setup)**. 새 권한이 필요하면 승인 창이 뜹니다.
4. **배포 → 배포 관리 → ✏(수정) → 버전: 새 버전 → 배포**
   - **"새 배포"를 누르면 웹앱 URL이 바뀝니다.** 그러면 백엔드 `APPS_SCRIPT_URL`도 바꿔야 합니다.
5. **⏰ 트리거**에 `checkReplies`(5분마다)와 `sendReminders`(매일) **딱 2개**인지 봅니다. 다른 이름이 있으면 지웁니다.

트리거 함수 이름(`checkReplies`, `sendReminders`)은 바꾸지 않습니다. 바꾸면 기존 트리거가 없는 함수를 부릅니다.

---

## 5. 점검·테스트

### 5-1. 시트 메뉴 "메일 자동화"
| 메뉴 | 하는 일 |
|---|---|
| ① 설치·점검 (setup) | 비밀값 준비, 트리거 2개 켜기, 백엔드 연결·남은 발송 수 확인. 여러 번 눌러도 안전 |
| 상태 보기 | 키·`BACKEND_URL` 유무, 트리거 개수, 마지막 답장 확인 시각, 남은 발송 수, 백엔드 응답 |
| 답장 지금 확인 | 5분을 기다리지 않고 `checkReplies` 실행 |
| 리마인드 지금 요청 | `sendReminders` 실행 (대상이 없으면 0건이 정상) |
| 자동 실행 켜기 / 끄기 | 트리거 2개 켜기 / 끄기 |

### 5-2. 편집기에서 실행하는 점검 함수 (`Test.gs`)
편집기 위쪽 함수 선택 칸에서 고르고 **▷ 실행** → 아래 **실행 로그**를 봅니다.

| 함수 | 확인하는 것 | 메일 |
|---|---|---|
| `testSendMailValidation` | sendMail 입력 검사 (잘못된 키·주소·길이) | 안 보냄 |
| `testSendMail` | 실제 발송 1통, 답장 주소가 `중계계정+q20000101-0001`인지 | `TEST_STUDENT_EMAIL`로 1통 |
| `testInboundFilter` | 답장 후보 고르기 규칙 | 안 보냄 |
| `testBackendConnection` | 백엔드 응답 + `MAIL_WEBHOOK_SECRET`이 서로 같은지 (`비밀값 확인` ✅) | 안 보냄 |

### 5-3. 백엔드 테스트
```bash
cd backend && pytest
```
메일 테스트는 가짜 저장소·가짜 메일 웹앱을 써서 진짜 Supabase·Gmail을 부르지 않습니다.

### 5-4. 운영을 건드리지 않고 고친 코드를 확인하고 싶을 때 (테스트 사본)
1. 중계 계정으로 운영 시트를 **파일 → 사본 만들기** → 사본의 Apps Script에 고친 코드를 붙여 넣습니다.
2. 사본에서는 **setup·트리거를 실행하지 않습니다.** 같은 메일함을 운영 트리거와 함께 읽게 됩니다.
3. 사본 편집기에서 `initSecrets`만 실행하고 **배포 → 새 배포(웹 앱)**.
4. 내 컴퓨터 백엔드 `backend/.env`에 `MAIL_ENABLED=true`, 사본 웹앱 URL·`API_KEY`, `MAIL_WEBHOOK_SECRET=local-test-secret`(아무 글자), Supabase 값, `ADMIN_PASSWORD`를 넣고 백엔드를 켭니다.
   - Windows에서 `uvicorn` 실행이 막히면 `python -m uvicorn app.main:app --reload`로 켭니다.
5. 사이트 대신 `http://localhost:8000/docs`에서 문의를 보내 봅니다.
6. 답장 처리는 Apps Script 대신 직접 보내 볼 수 있습니다. 아래 내용을 **저장소 밖**에 `inbound-test.json`(UTF-8)으로 저장하고 값을 바꿉니다.
   ```json
   {"messages":[{"messageId":"manual-test-1","receivedAt":"2026-11-20T15:00:00+09:00","from":"MENTOR_EMAIL","recipients":["relay+q20261120-0001@gmail.com"],"subject":"Re: [꾸로록 문의] 테스트","plainBody":"테스트 답장입니다.\n\n2026년 11월 20일 (목) 오후 3:00, 꾸로록 <relay@gmail.com>님이 작성:\n> 원래 문의 내용"}]}
   ```
   PowerShell:
   ```powershell
   $body = Get-Content -Raw -Encoding UTF8 "$HOME\Documents\inbound-test.json"
   ```
   ```powershell
   Invoke-RestMethod -Method Post -Uri "http://localhost:8000/internal/mail/inbound" -Headers @{ "X-Kkurolog-Mail-Secret" = "local-test-secret" } -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) | ConvertTo-Json -Depth 5
   ```
   - 처음 `forwarded`, 같은 `messageId`로 다시 보내면 `forwarded`지만 메일은 다시 안 감, `from`을 다른 주소로 바꾸면 `needs_review`, 없는 문의번호는 `ignored`, 비밀값이 틀리면 401.
7. 끝나면 정리합니다: Supabase 테스트 문의 삭제([HANDOVER 2-5](./docs/HANDOVER.md#2-5-테스트-문의-지우기)), `backend/.env`를 `MAIL_ENABLED=false`로, 사본 웹앱 **배포 관리 → 보관**, 사본 시트 삭제.

---

## 6. 알아 둘 한계 (MVP)

- Gmail로 보내기 때문에 **하루 약 100통**까지입니다 (멘토 문의 + 학생 사본 + 답장 전달 + 리마인드 합계, 문의 1건 = 2통). 스팸함에 들어갈 수 있습니다. 규모가 커지면 기관 도메인 + 메일 발송 전문 서비스로 바꾸는 것을 권장합니다 (`Mailer.gs`·`Receiver.gs`만 바꾸면 됨).
- 멘토는 받은 메일의 **'답장' 버튼**으로 회신해야 합니다. 새 메일로 보내면 전달되지 않습니다.
- 첨부파일·이미지는 지원하지 않습니다. 답장은 **글자만** 전달합니다.
- 인용문 지우기는 Gmail·네이버·다음·아웃룩의 인용 모양에 맞춰 두었습니다. 다른 메일 앱에서 이전 대화가 같이 전달되면 `backend/app/mail/reply_parser.py`에 그 모양을 추가합니다.
- 왕복 횟수·기간 제한이 없습니다. 오래된 메일에 답장해도 대화가 이어집니다.
- 멘토가 답장 본문에 직접 적은 서명·전화번호는 학생에게 그대로 전달됩니다. 멘토에게 미리 안내해 주세요.
- 멘토 답장이 중계 계정의 **스팸함**에 들어가면 처리되지 않습니다.
- 횟수 제한은 학생 메일 주소 기준이라, 주소를 바꿔 가며 보내는 것까지 막지는 못합니다.
- 학생이 메일 주소를 잘못 적으면 사본과 답장이 모두 그 주소로 갑니다.
- 백엔드(Render 무료 플랜)가 잠들어 있으면 첫 문의가 30~60초 걸릴 수 있습니다. 답장 처리는 실패해도 5분 뒤 다시 시도합니다.

---

## 7. 확인 기록

| 날짜 | 확인 | 결과 |
|---|---|---|
| 2026-11-18 | 백엔드(로컬) ↔ 팀 Supabase | 멘토 목록·관리자 API·DB 규칙 정상 ([SUPABASE_PLAN 10장](./docs/SUPABASE_PLAN.md#10-merge-전-실제-supabase-연결-확인-2026-11-18)) |
| 2026-11-19 | 백엔드(로컬) ↔ 테스트 사본 웹앱 ↔ 팀 Supabase | 문의·멘토 메일·학생 사본, 답장 `forwarded`·중복 방지·`needs_review`·`ignored`·비밀값 401 |
| 2026-11-20 | **운영**: Vercel 사이트 → Render 백엔드 → Supabase → 운영 Apps Script → Gmail | 문의 → 멘토 메일 → 멘토 '답장' → 학생 `[꾸로록 답장]` 자동 전달(인용문·멘토 주소 없음), 관리자 상세 `replied`·`forwarded`, 리마인드 수동 실행 정상 |
