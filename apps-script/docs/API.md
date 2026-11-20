# 메일 자동화 API 명세 (v1.0 — B 방식: Supabase + 메일 전용 Apps Script)

메일 자동화는 두 방향으로 요청을 주고받습니다. 저장·판단은 팀 백엔드 + Supabase가 하고, Apps Script는 중계 Gmail로 메일을 보내고 받기만 합니다.
(전체 설계: [SUPABASE_PLAN.md](./SUPABASE_PLAN.md))

| 방향 | 무엇 | 인증 |
|---|---|---|
| 백엔드 → Apps Script 웹앱 | `sendMail`, `getQuota` (1장) | 요청 본문의 `apiKey` = 웹앱 스크립트 속성 `API_KEY` = 백엔드 `APPS_SCRIPT_API_KEY` |
| Apps Script → 백엔드 | `POST /internal/mail/inbound`, `POST /internal/mail/reminders` (2장) | 헤더 `X-Kkurolog-Mail-Secret` = 웹앱 스크립트 속성 `MAIL_WEBHOOK_SECRET` = 백엔드 `MAIL_WEBHOOK_SECRET` |

## 변경 기록
| 버전 | 날짜 | 내용 |
|---|---|---|
| v0.2 ~ v0.6 | 2026-11-08 ~ 11-16 | 시트 방식. 웹앱이 `getMentors`, `submitInquiry`, `getInquiries`, `getInquiry`를 제공하고 구글 시트에 저장 (main의 이전 버전 문서 참고) |
| **v1.0** | 2026-11-18 | B 방식. 웹앱 action을 `sendMail`, `getQuota` 두 개로 줄임. 문의·답장·리마인드·관리자 조회는 백엔드가 Supabase로 처리. Apps Script → 백엔드 내부 API 2개 추가. 에러 코드 `QUOTA_EXCEEDED` 추가, 문의 관련 에러(`MENTOR_NOT_FOUND`, `TOO_MANY_REQUESTS` 등)는 백엔드로 이동 |

---

## 1. 백엔드 → Apps Script 웹앱

### 공통 규칙
- 모든 요청은 `POST`, `Content-Type: text/plain`, 본문은 JSON 문자열. 기능은 `action`으로 구분합니다.
- 웹앱은 응답 전에 한 번 리다이렉트(302)합니다. 클라이언트가 리다이렉트를 따라가야 합니다 (httpx `follow_redirects=True`, curl `-L`).
- HTTP 상태는 항상 200입니다. 성공 여부는 본문의 `ok`로 판단합니다.
- 성공 `{"ok":true,"data":{...}}` / 실패 `{"ok":false,"error":{"code":"...","message":"..."}}`
- 처리 순서: JSON 확인(`INVALID_INPUT`) → `apiKey`(`UNAUTHORIZED`) → `action`(`INVALID_ACTION`) → 입력 검사
- 웹앱은 메일 내용·주소를 저장하지 않고, 로그에도 남기지 않습니다.

### 1-1. sendMail — 메일 한 통 보내기
```json
{ "apiKey": "YOUR_API_KEY", "action": "sendMail",
  "to": "student@example.com",
  "replyToInquiryId": "q20261117-0001",
  "fromName": "꾸로록",
  "subject": "[꾸로록 문의] 진로 고민이 있어요",
  "textBody": "글자 버전 본문",
  "htmlBody": "<p>HTML 버전 본문</p>" }
```
```json
{ "ok": true, "data": { "sentAt": "2026-11-17T14:03:00+09:00" } }
```

| 필드 | 필수 | 규칙 |
|---|---|---|
| `to` | ○ | 메일 형식, 254자 이하. 앞뒤 공백은 지움 |
| `replyToInquiryId` | | 문의번호 형식 `q숫자8개-숫자4개 이상`. 주면 Reply-To가 **`중계계정+문의번호@도메인`** 이 됩니다 (웹앱이 만듦). 멘토에게 보내는 문의·리마인드 메일에 씁니다. 학생에게 보내는 메일(사본·답장 전달)에는 넣지 않습니다 |
| `fromName` | ○ | 1~100자. 메일 '보낸 사람' 이름 (mail_settings `senderName`) |
| `subject` | ○ | 1~200자 |
| `textBody` | ○ | 1~50000자. 글자만 보이는 메일 앱용 |
| `htmlBody` | | 1~100000자. 없으면 글자 메일만 보냄 |

- 백엔드가 멘토 메일 맨 아래에 `문의번호: q…` 한 줄을 꼭 넣어 주세요. 멘토가 Reply-To를 지우고 답장해도, 인용된 본문의 이 줄로 답장 후보를 찾습니다 (2-1).
- 오늘 남은 Gmail 발송 수가 0이면 보내지 않고 `QUOTA_EXCEEDED`.

### 1-2. getQuota — 오늘 남은 발송 수
```json
{ "apiKey": "YOUR_API_KEY", "action": "getQuota" }
```
```json
{ "ok": true, "data": { "remaining": 87 } }
```
- 문의 1건 = 2통(멘토 + 학생 사본). 백엔드는 문의를 저장하기 전에 `remaining >= 2`인지 확인합니다.

### 1-3. 에러 코드
| 코드 | 뜻 |
|---|---|
| UNAUTHORIZED | `apiKey`가 틀림 |
| INVALID_ACTION | 없는 action |
| INVALID_EMAIL | `to` 형식 오류 |
| INVALID_INPUT | JSON 아님, 길이·형식 오류 |
| QUOTA_EXCEEDED | 오늘 Gmail 발송 한도를 다 씀 |
| SEND_FAILED | Gmail 발송 실패 |
| INTERNAL_ERROR | 그 밖의 오류 (원인은 Apps Script 실행 로그에만) |

---

## 2. Apps Script → 백엔드

### 공통 규칙
- 주소: 웹앱 스크립트 속성 `BACKEND_URL` + 경로. 예: `https://YOUR_BACKEND.onrender.com/internal/mail/inbound`
- `POST`, `Content-Type: application/json`, 헤더 `X-Kkurolog-Mail-Secret: YOUR_MAIL_WEBHOOK_SECRET`
- 백엔드는 헤더 값이 다르거나 없으면 401로 거절합니다. (학생 화면에서 부르는 API가 아님)
- 백엔드는 처리하면 200과 JSON을 돌려줍니다. 200이 아니거나 응답이 없으면(서버가 잠들었다 깨는 중 등) Apps Script는 **처리하지 않은 것으로 보고 다음 차례에 다시** 보냅니다.

### 2-1. POST /internal/mail/inbound — 멘토 답장 후보 (5분마다)
Apps Script는 중계 Gmail에 새로 온 메일 중 **답장 후보만** 보냅니다. 후보 = 받는 주소에 `중계계정+문의번호`가 있거나, 본문에 `문의번호: q…` 줄이 있는 메일. 관계없는 메일(광고 등)은 보내지 않습니다.
한 번에 최대 5통, 한 차례(5분)에 최대 20통.

```json
{ "messages": [
  { "messageId": "18c2f…",
    "receivedAt": "2026-11-17T15:20:00+09:00",
    "from": "mentor@example.com",
    "recipients": ["꾸로록 <relay+q20261117-0001@gmail.com>"],
    "subject": "Re: [꾸로록 문의] 진로 고민이 있어요",
    "plainBody": "좋은 질문이에요 …\n\n2026년 11월 17일 (월) … 작성:\n> …" } ] }
```
```json
{ "results": [ { "messageId": "18c2f…", "result": "forwarded" } ] }
```

| 필드 | 설명 |
|---|---|
| `messageId` | Gmail 메일 ID. `mail_replies.message_id`로 써서 같은 메일을 두 번 처리하지 않음 |
| `from` | 보낸 주소 (소문자) |
| `recipients` | To, Cc, Delivered-To, X-Original-To (원문 그대로) |
| `plainBody` | 글자 본문. 20000자에서 자름 |

백엔드가 하는 일: 문의번호 찾기(받는 주소의 `+문의번호` → 본문의 `문의번호:` 줄) → 문의 확인 → 보낸 사람 = 그 문의 멘토의 메일인지 확인 → 인용문·안내 문구·문의번호 줄 지우기 → 학생에게 `sendMail`(Reply-To 없음) → `inquiries.replied/replied_at`(첫 답장만), `mail_replies` 기록.

| `result` | 뜻 | Apps Script가 하는 일 |
|---|---|---|
| `forwarded` | 학생에게 전달함 | `메일자동화/전달완료` 라벨 (`확인필요` 라벨은 뗌), 처리 완료로 기억 |
| `needs_review` | 사람이 봐야 함 (보낸 사람이 멘토가 아님, 전달할 내용이 비어 있음 등) | `메일자동화/확인필요` 라벨, 처리 완료로 기억 |
| `ignored` | 문의와 관계없음 (없는 문의번호 등) | 처리 완료로 기억 |
| `retry` | 지금은 못 함 (발송 한도, 일시 오류) | 기억하지 않고 다음 차례에 다시 보냄 |

- 같은 `messageId`가 다시 오면(백엔드는 처리했지만 응답이 늦어 Apps Script가 못 받은 경우) 백엔드는 다시 전달하지 않고 이전 결과를 돌려줍니다.
- `messages`가 빈 목록이면 `{"results": []}`를 돌려줍니다. (Apps Script `testBackendConnection`이 비밀값 확인에 씀)

### 2-2. POST /internal/mail/reminders — 리마인드 실행 (매일 10~11시)
```json
{}
```
```json
{ "summary": "리마인드 2건 보냄, 비활성 멘토 1건 건너뜀" }
```
백엔드가 하는 일: `mail_settings.reminderDays`(0이면 안 함) 기준으로, 답장 없음 + 리마인드 안 함 + 보낸 날짜로부터 그 일수째(한국 날짜)가 된 문의를 찾아, 멘토가 활성이면 리마인드 메일을 `sendMail`(Reply-To = 그 문의번호)로 보내고 `inquiries.reminded_at`을 기록.
- `summary`는 Apps Script 실행 로그에만 남습니다. 개인정보를 넣지 않습니다.
