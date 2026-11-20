# 관리자 API 명세 — 관리자 페이지 담당자용

관리자 페이지가 문의 기록을 보고, 멘토와 메일 설정을 고칠 때 부르는 **팀 백엔드** API입니다.
(구현: `backend/app/admin/`, 설계: [SUPABASE_PLAN.md](./SUPABASE_PLAN.md))

## 공통
- 주소: 팀 백엔드 주소 + `/admin/...` (예: `https://YOUR_BACKEND.onrender.com/admin/inquiries`)
- 백엔드 환경변수 `MAIL_ENABLED=true`(+ Supabase·메일 설정)와 `ADMIN_PASSWORD`(12자 이상)가 있어야 동작합니다. 없으면 503.
- 로그인(`POST /admin/login`)을 뺀 모든 요청에 헤더 `Authorization: Bearer <token>`이 필요합니다. 없거나 틀리거나 만료되면 **401 → 로그인 화면으로** 보냅니다.
- 백엔드 `/docs` 화면에서 직접 시험할 때는 오른쪽 위 **Authorize**(자물쇠) 버튼에 token만 넣으면 모든 관리자 요청에 자동으로 붙습니다.
- 실패하면 `{"detail": "화면에 보여 줄 문구"}` (FastAPI 기본 형식). 422는 입력 형식 오류(FastAPI가 만든 목록 형식일 수도 있음).
- 시각은 ISO 8601 **한국 시간**(`+09:00`)으로, 초 단위까지 돌려줍니다. 예: `2026-11-17T15:03:00+09:00`
  (DB는 UTC로 저장하지만 백엔드가 바꿔서 돌려줍니다. 관리자 페이지는 받은 값을 그대로 보여 줘도 한국 시간입니다)
- 응답에 **학생 이름·메일, 멘토 메일**이 들어 있습니다. 화면을 캡처해 공유하거나 브라우저 저장소(localStorage)에 기록 내용을 남기지 않습니다.

## 1. 로그인
`POST /admin/login`
```json
{ "password": "YOUR_ADMIN_PASSWORD" }
```
```json
{ "token": "eyJleHAiOi...", "expires_at": "2026-11-18T12:00:00+09:00" }
```
- 관리자 모두가 같은 비밀번호(공용)를 씁니다. 누가 로그인했는지 구분하지 않고, 변경 기록도 남기지 않습니다.
- 로그인 표(`token`)는 **12시간** 유효합니다. 관리자 페이지는 표를 메모리나 `sessionStorage`에 두고, 401이 오면 다시 로그인하게 합니다.
- 같은 IP에서 10분에 10번까지만 시도할 수 있습니다. 넘으면 429 "로그인 시도가 너무 많아요. 10분 후 다시 시도해 주세요."
- 서버의 `ADMIN_PASSWORD`를 바꾸면 이전에 받은 표는 모두 쓸 수 없게 됩니다 (유출이 의심될 때 비밀번호만 바꾸면 됨).
- 틀린 비밀번호: 401 "비밀번호가 맞지 않아요."

## 2. 문의 목록
`GET /admin/inquiries?replied=false&page=1&page_size=20`

| 쿼리 | 뜻 |
|---|---|
| `replied` | `true` 답장 받음 / `false` 답장 전 / 생략 전체 |
| `page` | 1부터 (기본 1) |
| `page_size` | 1~100 (기본 20) |

```json
{ "total": 57, "page": 1, "page_size": 20,
  "items": [ {
    "id": "q20261117-0001", "created_at": "2026-11-17T15:03:00+09:00",
    "mentor_id": "mt-01", "mentor_name": "새벽",
    "student_name": "테스트학생", "student_email": "student@example.com",
    "title": "진로 고민이 있어요", "body": "문의 내용",
    "replied": false, "replied_at": null, "reminded_at": null } ] }
```
- 최신순 (보낸 일시가 늦은 것부터).

| 관리자 화면 항목 | 필드 |
|---|---|
| 학생 이름 | `student_name` |
| 학생 메일 | `student_email` |
| 멘토 이름 | `mentor_name` (멘토가 없으면 null) |
| 메일 제목 | `title` |
| 메일 내용 | `body` |
| 보낸 일시 | `created_at` |
| 멘토 답변 여부 | `replied` |
| 멘토 답변 일시 | `replied_at` (첫 답장, 없으면 null) |
| (추가) 리마인드 보낸 시각 | `reminded_at` (없으면 null) |

## 3. 문의 상세 + 답장 내역
`GET /admin/inquiries/{id}` (예: `q20261117-0001`, 대소문자 상관없음)
```json
{ "item": { "...": "2번 items 한 건과 같음" },
  "replies": [ {
    "message_id": "18c2f…", "inquiry_id": "q20261117-0001", "from_email": "mentor@example.com",
    "received_at": "2026-11-17T15:20:00+09:00",
    "status": "forwarded", "reason": null, "reply_text": "학생에게 전달한 본문" } ] }
```
- `replies`: 이 문의에 온 멘토 답장 처리 기록 (오래된 순). `status`: `forwarded` 학생에게 전달함 / `needs_review` 사람이 봐야 함
- `reason`: `sender_mismatch` 등록된 멘토 메일이 아닌 주소에서 옴, `empty_body` 전달할 내용이 없음
- 형식이 틀리면 422, 없으면 404.

## 4. 확인필요 목록
`GET /admin/replies/review?page=1&page_size=20`
```json
{ "total": 1, "page": 1, "page_size": 20,
  "items": [ { "message_id": "…", "inquiry_id": "q20261117-0001", "from_email": "someone@example.com",
               "received_at": "…", "status": "needs_review", "reason": "sender_mismatch", "reply_text": null,
               "inquiry_title": "진로 고민이 있어요", "student_name": "테스트학생", "mentor_id": "mt-01" } ] }
```
- 학생에게 자동으로 전달하지 못한 답장입니다. 관리자가 중계 Gmail 메일함(라벨 `메일자동화/확인필요`)에서 원문을 보고 처리합니다.
  예: 멘토가 다른 주소로 답장했다면 멘토의 메일 주소를 고친 뒤 멘토에게 다시 '답장'을 부탁합니다.

## 5. 멘토
`GET /admin/mentors` → 멘토 전체 (참여 동의 안 한 멘토 포함, **메일 주소 포함**)
```json
[ { "id": "mt-01", "name": "새벽", "exit_year": 2020, "career_paths": ["창업"], "path_summary": "…",
    "summary": "…", "tags": ["창업"], "topics": ["창업"], "consent": true, "available": true,
    "email": "mentor@example.com" } ]
```

`POST /admin/mentors` → 추가 (201)
```json
{ "id": "mt-11", "name": "새 멘토", "exit_year": 2022, "career_paths": [], "path_summary": "", "summary": "",
  "tags": [], "topics": [], "consent": true, "available": true, "email": "mentor@example.com" }
```
- `id`: 영어 소문자·숫자·`-`, 50자 이하. **정하면 바꿀 수 없습니다** (문의 기록이 이 값으로 멘토를 찾음). 같은 id가 있으면 409.
- `exit_year` 1990~2100 또는 null. `name` 1~50자.

`PATCH /admin/mentors/{id}` → 수정 (보낸 칸만 바뀜)
```json
{ "available": false }
```
- 쉬게 할 때는 `available: false` (멘토는 지울 수 없습니다. 문의 기록이 남아 있기 때문).
- `email`에 빈 글자나 `null`을 보내면 메일 주소를 지웁니다.
- **규칙**: `available: true`이려면 `consent: true`이고 `email`이 있어야 합니다. 어기면 422 "연락 가능으로 두려면 참여 동의와 메일 주소가 모두 있어야 해요."
- 학생 화면(사이트)에는 바로 반영됩니다: `consent: false`면 어디에도 안 보이고, `available: false`면 "지금 연락을 받지 않아요".

## 6. 메일 설정
`GET /admin/settings` → 16개
```json
[ { "key": "mentorFooter", "value": "답장을 보내실 때, …", "description": "멘토에게 가는 메일 맨 아래 안내 문구" } ]
```

`PATCH /admin/settings` → 값 수정, 고친 뒤 전체 목록을 돌려줌
```json
{ "values": { "mentorSubjectPrefix": "[꾸로록 문의]", "rateLimitPerDay": "5" } }
```
- 바로 다음 메일부터 적용됩니다.
- 없는 키는 422. 숫자 키(`rateLimitMinutes`, `rateLimitPerWindow`, `rateLimitPerDay`, `reminderDays`)는 0 이상의 정수 글자만. 값은 1000자까지.
- 값을 비우면 기본값으로 동작합니다.

| 키 | 하는 일 |
|---|---|
| serviceName / senderName | 서비스 이름 / 메일 '보낸 사람' 이름 |
| mentorSubjectPrefix / mentorFooter | 멘토 메일 제목 말머리 / 맨 아래 안내 문구 |
| mentorReminderSubjectPrefix / mentorReminderIntro | 리마인드 메일 말머리 / 맨 위 문구 |
| studentSubjectPrefix / studentForwardIntro / studentForwardFooter | 학생에게 전달하는 답장 메일 |
| studentCopySubjectPrefix / studentCopyIntro / studentCopyFooter | 학생에게 가는 "보낸 문의 사본" |
| rateLimitMinutes / rateLimitPerWindow / rateLimitPerDay | 같은 학생 메일 횟수 제한 (기본 10분에 3건, 하루 5건, 0이면 제한 없음) |
| reminderDays | 답장 없을 때 며칠째에 멘토에게 다시 보낼지 (기본 10, 0이면 안 보냄) |

## CORS
백엔드는 `FRONTEND_ORIGINS`에 있는 주소에서 오는 `GET`, `POST`, `PATCH` 요청만 받습니다. 관리자 페이지가 학생 사이트와 다른 주소라면 `FRONTEND_ORIGINS`에 추가합니다.
