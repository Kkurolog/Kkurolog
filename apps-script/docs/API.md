# 메일 자동화 API 명세 (v0.3)

팀 백엔드 서버가 Apps Script 웹앱을 호출할 때 쓰는 형식입니다. 학생 화면(프론트)에서 직접 호출하지 않습니다.

## 변경 기록
| 버전 | 날짜 | 내용 |
|---|---|---|
| v0.2 | 2026-11-08 | 첫 명세 |
| v0.3 | 2026-11-10 | 멘토 ID 예시를 백엔드 형식(`mt-01`)으로 변경. `consent` → `privacyConsent`, `CONSENT_REQUIRED` → `PRIVACY_CONSENT_REQUIRED`로 이름 변경 (기존 코드의 멘토 참여 동의 `consent`와 헷갈리지 않게) |

## 공통 규칙
- 모든 요청은 `POST`, `Content-Type: text/plain`, 본문은 JSON 문자열입니다. 기능은 본문의 `action`으로 구분합니다.
- 모든 요청에 `apiKey`가 필요합니다. 관리자 API는 `adminToken`도 필요합니다.
- 시간은 ISO 8601 한국 시간입니다. 예: `2026-11-08T14:03:00+09:00`
- 성공: `{"ok":true,"data":{...}}` / 실패: `{"ok":false,"error":{"code":"...","message":"..."}}`
- `mentorId`는 형식을 정해 두지 않은 **문자열**입니다. 시트 "멘토" 탭의 값과 똑같은지만 비교합니다. 예시의 `mt-01`은 지금 백엔드 데모 데이터의 형식입니다.
- 멘토 이메일은 어떤 응답에도 들어가지 않습니다.

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

## 3) getInquiries — 문의 목록 (관리자, Step 5)
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
  "replied": false, "repliedAt": null } ] } }
```
- `filter.replied`는 `true` / `false` / 생략(전체). 최신순입니다. 답장 전이면 `replied: false`, `repliedAt: null`.

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

## 4) getInquiry — 한 건 조회 (관리자, 선택)
```json
{ "apiKey": "YOUR_API_KEY", "action": "getInquiry", "adminToken": "YOUR_ADMIN_TOKEN",
  "inquiryId": "q20261108-0001" }
```
응답은 `data.item`이고, 3번 `items`의 한 건과 같은 모양입니다.

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
| SEND_FAILED | 메일 발송 실패 |
| INTERNAL_ERROR | 그 밖의 서버 오류 |

## 답장 자동 전달 (API 아님)
5분마다 도는 시간 트리거가 처리합니다. 멘토가 **'답장' 버튼**으로 보내야 문의번호가 매칭됩니다. 새 메일로 보내면 매칭되지 않습니다.
