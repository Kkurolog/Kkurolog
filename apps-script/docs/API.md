# 메일 자동화 API 명세 (v0.4)

팀 백엔드 서버가 Apps Script 웹앱을 호출할 때 쓰는 형식입니다. 학생 화면(프론트)에서 직접 호출하지 않습니다.

## 변경 기록
| 버전 | 날짜 | 내용 |
|---|---|---|
| v0.2 | 2026-11-08 | 첫 명세 |
| v0.3 | 2026-11-10 | 멘토 ID 예시를 백엔드 형식(`mt-01`)으로 변경. `consent` → `privacyConsent`, `CONSENT_REQUIRED` → `PRIVACY_CONSENT_REQUIRED`로 이름 변경 (기존 코드의 멘토 참여 동의 `consent`와 헷갈리지 않게) |
| v0.3.1 | 2026-11-10 | 형식 변화 없음. "호출할 때 주의할 점" 추가 (리다이렉트, HTTP 200, 잘못된 JSON·mentorId 처리) |
| v0.3.2 | 2026-11-10 | 형식 변화 없음. 답장 자동 전달 규칙(문의번호 찾기 순서, 보낸 사람 확인, repliedAt = 첫 답장 시각) 정리 |
| v0.4 | 2026-11-12 | 에러 코드 `TOO_MANY_REQUESTS` 추가 (같은 학생 메일 10분 3건·하루 5건 제한). `submitInquiry`가 학생에게 "보낸 문의 사본"도 보냄 (요청·응답 형식은 그대로). 답장 없는 문의 10일째 멘토 리마인드 추가 (API 아님). 관리자 API 응답에 `remindedAt` 추가 예정 (Step 5-2) |

## 공통 규칙
- 모든 요청은 `POST`, `Content-Type: text/plain`, 본문은 JSON 문자열입니다. 기능은 본문의 `action`으로 구분합니다.
- 모든 요청에 `apiKey`가 필요합니다. 관리자 API는 `adminToken`도 필요합니다.
- 시간은 ISO 8601 한국 시간입니다. 예: `2026-11-08T14:03:00+09:00`
- 성공: `{"ok":true,"data":{...}}` / 실패: `{"ok":false,"error":{"code":"...","message":"..."}}`
- `mentorId`는 형식을 정해 두지 않은 **문자열**입니다. 시트 "멘토" 탭의 값과 똑같은지만 비교합니다. 예시의 `mt-01`은 지금 백엔드 데모 데이터의 형식입니다.
- 멘토 이메일은 어떤 응답에도 들어가지 않습니다.

## 호출할 때 주의할 점
- 웹앱은 응답 전에 한 번 리다이렉트(302)합니다. HTTP 클라이언트가 **리다이렉트를 따라가게** 설정해야 합니다. (curl은 `-L`, Python `requests`는 기본으로 따라감)
- HTTP 상태 코드는 성공·실패와 상관없이 **항상 200**입니다. 성공 여부는 본문의 `ok`로 판단합니다.
- 본문이 JSON 객체가 아니면 `INVALID_INPUT`입니다.
- 처리 순서: JSON 확인 → `apiKey` 확인(`UNAUTHORIZED`) → `action` 확인(`INVALID_ACTION`) → 입력 검사.
  - `submitInquiry`는 입력 검사 뒤에 멘토 확인(`MENTOR_NOT_FOUND`) → 발송 한도 확인(`SEND_FAILED`) → 횟수 제한(`TOO_MANY_REQUESTS`) → 저장·발송 순서입니다.
- `mentorId`가 문자열이 아니거나 비어 있으면 `INVALID_INPUT`, 문자열인데 시트에 없거나 비활성이면 `MENTOR_NOT_FOUND`입니다.
- 이름·제목·내용은 앞뒤 공백을 지운 뒤 길이를 셉니다. 학생 이메일도 앞뒤 공백을 지웁니다.
- `INTERNAL_ERROR`의 자세한 원인은 응답에 나가지 않고 Apps Script 실행 로그에만 남습니다.

## 1) getMentors — 활성 멘토 목록
```json
{ "apiKey": "YOUR_API_KEY", "action": "getMentors" }
```
```json
{ "ok": true, "data": { "mentors": [ { "mentorId": "mt-01", "name": "새벽 (demo)" } ] } }
```

## 2) submitInquiry — 문의 저장 + 멘토에게 발송
```json
{ "apiKey": "YOUR_API_KEY", "action": "submitInquiry", "mentorId": "mt-01",
  "studentName": "테스트학생", "studentEmail": "student@example.com",
  "title": "진로 고민이 있어요", "body": "문의 내용", "privacyConsent": true }
```
```json
{ "ok": true, "data": { "inquiryId": "q20261108-0001", "createdAt": "2026-11-08T14:03:00+09:00" } }
```
- `privacyConsent`: 학생이 개인정보(이름·메일) 수집과 멘토 전달에 동의했는지. 반드시 `true`여야 합니다.
- 검증: 학생 이름 1~30자, 이메일 형식, 제목 1~100자, 내용 1~2000자, `privacyConsent`는 `true`, 활성 멘토만.
- **횟수 제한** (v0.4): 같은 학생 메일(대소문자·앞뒤 공백 무시)로
  - 최근 **10분** 안에 이미 **3건**을 보냈으면 (4번째부터) `TOO_MANY_REQUESTS` (message: "현재 메일 발송량이 많아 전송이 잠시 제한되었어요. 10분 후 다시 시도해 주세요.")
  - 오늘(한국 시간 자정 기준) 이미 **5건**을 보냈으면 `TOO_MANY_REQUESTS` (message: "…하루에 5건까지 보낼 수 있어요. 내일 다시 시도해 주세요.")
  - 숫자는 시트 설정 탭 `rateLimitMinutes`(10), `rateLimitPerWindow`(3), `rateLimitPerDay`(5)에서 바꿀 수 있고, 0이면 그 제한을 쓰지 않습니다. (테스트 기간에는 0으로 꺼 둘 수 있음) 실제 숫자는 `message`에 들어 있으니 백엔드는 `message`를 그대로 학생에게 보여 주면 됩니다.
- **학생 사본** (v0.4): 멘토에게 보낸 직후 학생 메일로 "보낸 문의 사본"이 1통 갑니다 (멘토 이름·제목·내용·보낸 일시. 멘토 이메일·문의번호 없음).
  - 사본 발송이 실패해도 응답은 성공(`ok: true`)입니다. 실패는 실행 로그에만 남습니다.
  - 그래서 문의 1건에 Gmail 발송 2통을 씁니다. 오늘 남은 발송 수가 2통보다 적으면 `SEND_FAILED`입니다.

## 3) getInquiries — 문의 목록 (관리자, Step 5-2에서 구현 예정)
```json
{ "apiKey": "YOUR_API_KEY", "action": "getInquiries", "adminToken": "YOUR_ADMIN_TOKEN",
  "filter": { "replied": false }, "page": 1, "pageSize": 20 }
```
```json
{ "ok": true, "data": { "total": 1, "items": [ {
  "inquiryId": "q20261108-0001", "createdAt": "2026-11-08T14:03:00+09:00",
  "mentorId": "mt-01", "mentorName": "새벽 (demo)",
  "studentName": "테스트학생", "studentEmail": "student@example.com",
  "title": "진로 고민이 있어요", "body": "문의 내용",
  "replied": false, "repliedAt": null, "remindedAt": null } ] } }
```
- `filter.replied`는 `true` / `false` / 생략(전체). 최신순입니다. 답장 전이면 `replied: false`, `repliedAt: null`.
- `remindedAt`: 멘토에게 리마인드를 보낸 시각. 안 보냈으면 `null`. (관리자 화면 8개 항목에는 없는 추가 정보)
- 페이지: `page` 생략 시 1, `pageSize` 생략 시 20, `pageSize` 최대 100. 0·음수·소수·글자이거나 `pageSize`가 100보다 크면 `INVALID_INPUT`. 마지막 페이지를 넘는 `page`는 빈 목록(`items: []`). `total`은 필터를 적용한 전체 건수.
- `filter.replied`가 true/false가 아닌 값이면 `INVALID_INPUT`, `filter`를 생략하면 전체.

| 관리자 화면 항목 | 응답 필드 |
|---|---|
| 학생 이름 | studentName |
| 학생 메일 | studentEmail |
| 멘토 이름 | mentorName |
| 메일 제목 | title |
| 메일 내용 | body |
| 보낸 일시 | createdAt |
| 멘토 답변 여부 | replied |
| 멘토 답변 일시 | repliedAt |

## 4) getInquiry — 한 건 조회 (관리자, Step 5-2에서 구현 예정)
```json
{ "apiKey": "YOUR_API_KEY", "action": "getInquiry", "adminToken": "YOUR_ADMIN_TOKEN",
  "inquiryId": "q20261108-0001" }
```
응답은 `data.item`이고, 3번 `items`의 한 건과 같은 모양입니다.
- 문의번호 대소문자는 구분하지 않습니다. 형식이 틀리면 `INVALID_INPUT`, 시트에 없으면 `INQUIRY_NOT_FOUND`.
- 관리자 API 처리 순서: JSON → `apiKey` → `action` → `adminToken`(`UNAUTHORIZED`) → 입력 검사.

## 에러 코드
| 코드 | 뜻 |
|---|---|
| UNAUTHORIZED | apiKey 또는 adminToken이 틀림 |
| INVALID_ACTION | 없는 action |
| INVALID_EMAIL | 학생 이메일 형식 오류 |
| INVALID_INPUT | 이름·제목·내용 길이 오류 등 |
| PRIVACY_CONSENT_REQUIRED | `privacyConsent`가 `true`가 아님 |
| MENTOR_NOT_FOUND | 없는 멘토이거나 비활성 멘토 |
| INQUIRY_NOT_FOUND | 없는 문의번호 |
| SEND_FAILED | 메일 발송 실패 (오늘 Gmail 발송 한도 부족 포함) |
| TOO_MANY_REQUESTS | 같은 학생 메일로 너무 자주 보냄 (v0.4) |
| INTERNAL_ERROR | 그 밖의 서버 오류 |

## 답장 자동 전달 (API 아님)
5분마다 도는 시간 트리거(`checkReplies`)가 처리합니다. 백엔드가 호출할 것은 없습니다.
- 문의번호 찾기: ① 받는 주소의 `+문의번호` → ② 인용 부분의 `문의번호: q...` 줄 → ③ 없으면 무시
- 보낸 사람이 그 문의의 멘토(시트 등록 메일)일 때만 학생에게 전달합니다.
- 전달되면 `getInquiries`(Step 5-2)에서 `replied: true`, `repliedAt` = **첫 답장 시각**으로 보입니다. 여러 번 답장해도 `repliedAt`은 바뀌지 않습니다.
- 멘토가 **'답장' 버튼**이 아니라 새 메일로 보내면 문의번호가 없어 매칭되지 않습니다.

## 멘토 리마인드 (API 아님, v0.4)
매일 오전 10시~11시 사이에 도는 시간 트리거(`sendReminders`)가 처리합니다. 백엔드가 호출할 것은 없습니다.
- 대상: 답장여부 FALSE + 리마인드를 아직 안 보냄 + 보낸 날짜 + 10일째(한국 날짜 기준)가 됐거나 지남. 예: 11월 1일 문의 → 11월 11일.
- 멘토가 지금 비활성이면 보내지 않습니다.
- 원래 문의 메일과 같은 내용에, 제목 말머리 `[꾸로록 리마인드]`와 맨 위 리마인드 문구가 붙습니다. 한 문의에 **한 번만** 보냅니다.
- 답장 주소는 원래와 같은 `중계계정+문의번호`라서, 멘토가 리마인드 메일에 '답장'해도 학생에게 자동 전달됩니다.
- 보낸 시각은 시트 "문의" 탭 `리마인드일시`에 남고, Step 5-2의 관리자 API에서 `remindedAt`으로 보입니다.
