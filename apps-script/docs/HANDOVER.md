# 메일 자동화 운영·인수인계 안내

꾸로록 사이트의 "멘토에게 문의하기" 메일 자동화를 운영하고 넘겨받는 방법입니다.

- **1부. 평소 운영**: 기관 담당자(관리자)용. 개발자가 아니어도 따라 할 수 있습니다. 코드는 고치지 않습니다.
- **2부. 설치·옮기기**: 다음 개발자용. 계정을 기관으로 옮기거나, 키를 바꾸거나, 처음부터 다시 설치할 때 봅니다.

```
학생(사이트 폼) → 꾸로록 서버(백엔드) → 중계 Gmail → 멘토        + 학생에게 "보낸 문의 사본"
멘토 '답장' → 중계 Gmail → (5분마다 자동 확인) → 꾸로록 서버 → 학생에게 "[꾸로록 답장]"
답장이 없으면 10일째에 멘토에게 "[꾸로록 리마인드]" 한 번
```

모든 기록(멘토, 문의, 답장 처리, 메일 문구)은 **Supabase**(데이터베이스)에 있고, 관리자는 **관리자 기능**으로 보고 고칩니다.
구글 시트에는 더 이상 기록이 쌓이지 않습니다. 시트는 위쪽 **메일 자동화** 메뉴를 쓰기 위해서만 남아 있습니다.

> 이 문서의 `YOUR_BACKEND.onrender.com`은 실제 서버 주소로 바꿔 읽습니다. 실제 주소·비밀번호는 꾸로록 팀에게 1:1로 받습니다.

---

# 1부. 평소 운영 (관리자용)

## 1-1. 관리자 기능 열기 (로그인)
지금은 관리자 화면 대신 서버의 **API 문서 화면(`/docs`)**에서 관리자 기능을 씁니다. 나중에 관리자 화면이 생기면 같은 기능을 버튼으로 쓰게 됩니다.

1. 브라우저에서 `https://YOUR_BACKEND.onrender.com/docs`를 엽니다.
   - 서버가 쉬고 있었다면 처음 열 때 30초~1분 걸릴 수 있습니다.
2. **POST /admin/login** → **Try it out** → Request body에 아래처럼 넣고 **Execute**
   ```json
   { "password": "관리자 비밀번호" }
   ```
3. 아래 **Response body**의 `"token"` 값을 큰따옴표 없이 복사합니다.
   - `401`이면 비밀번호가 틀린 것입니다. 10분에 10번까지만 시도할 수 있습니다.
4. 화면 오른쪽 위 **Authorize**(자물쇠) → 칸에 token만 붙여 넣고(`Bearer`는 쓰지 않음) **Authorize → Close**
5. 이제 `/admin/...` 기능을 **Try it out → Execute**로 쓸 수 있습니다.
   - 로그인은 **12시간** 유지됩니다. 중간에 `401`이 나오면 1~4번을 다시 합니다.

**`/docs` 화면 쓰는 법**
- 기능 이름을 누르면 펼쳐집니다 → **Try it out** → 칸을 채우고 → **Execute** → 아래 **Response body**가 결과입니다.
- 결과의 시각은 한국 시간입니다. 예: `2026-11-20T22:15:01+09:00` = 2026년 11월 20일 오후 10시 15분 1초
- 결과에는 학생·멘토 메일 주소가 있습니다. **화면을 캡처해 공유하지 않습니다.** 다 쓰면 브라우저 탭을 닫습니다.

## 1-2. 문의 기록 보기
**GET /admin/inquiries** (문의 목록, 최신순)
| 칸 | 넣는 값 |
|---|---|
| `replied` | 비우면 전체, `false` 답장 전, `true` 답장 받음 |
| `page`, `page_size` | 몇 번째 쪽, 한 쪽에 몇 건 (기본 1쪽, 20건) |

결과의 `total`이 전체 건수이고, `items`에 문의가 하나씩 있습니다.
| 항목 | 뜻 |
|---|---|
| `id` | 문의번호 (예: `q20261120-0001` = 2026년 11월 20일 첫 문의) |
| `created_at` | 보낸 일시 |
| `mentor_name` | 멘토 이름 |
| `student_name`, `student_email` | 학생 이름, 답장 받을 메일 |
| `title`, `body` | 제목, 내용 |
| `replied`, `replied_at` | 멘토 답장 여부, 첫 답장 일시 |
| `reminded_at` | 리마인드 보낸 일시 (없으면 null) |

**GET /admin/inquiries/{inquiry_id}** (문의 하나 + 답장 처리 기록)
- `inquiry_id` 칸에 문의번호를 넣습니다.
- `replies`에 이 문의로 온 멘토 답장이 하나씩 있습니다. `status`가 `forwarded`면 학생에게 전달된 것이고, `reply_text`가 학생이 받은 내용입니다.

## 1-3. "확인필요" 답장 처리하기
자동으로 학생에게 전달하지 **못한** 답장입니다. 일주일에 한 번쯤 확인합니다.

1. **GET /admin/replies/review** → `total`이 0이면 할 일이 없습니다.
2. 있으면 `reason`을 봅니다.
   | `reason` | 뜻 | 할 일 |
   |---|---|---|
   | `sender_mismatch` | 등록된 멘토 메일이 **아닌** 주소에서 답장이 옴 (멘토가 다른 메일 계정으로 답장 등) | 중계 Gmail에서 원문 확인 → 멘토 본인이면 멘토 메일 주소를 고치고(1-4) 멘토에게 원래 메일에 다시 '답장'해 달라고 부탁하거나, 담당자가 학생에게 직접 전달 |
   | `empty_body` | 전달할 내용이 비어 있음 (인용만 있고 쓴 글이 없음 등) | 중계 Gmail에서 원문 확인 → 필요하면 멘토에게 다시 답장 부탁 |
3. 중계 Gmail에서는 라벨 **`메일자동화/확인필요`**로 같은 메일을 찾을 수 있습니다. 처리한 뒤 라벨을 떼도 됩니다.

## 1-4. 멘토 추가·수정·쉬기
**GET /admin/mentors**: 멘토 전체(메일 주소 포함)

**멘토 정보 수정: PATCH /admin/mentors/{mentor_id}**
- `mentor_id`에 멘토 ID(예: `mt-03`)를 넣고, Request body에는 **바꿀 칸만** 넣습니다.
  ```json
  { "email": "새 메일 주소" }
  ```
  ```json
  { "available": false }
  ```
- **쉬게 하기**: `"available": false` → 사이트에 "지금 연락을 받지 않아요"로 보이고 문의를 받지 않습니다. 이미 받은 문의의 답장은 계속 전달됩니다.
- **다시 받기**: `"available": true` (참여 동의와 메일 주소가 있어야 합니다. 없으면 `422`)
- **사이트에서 아예 숨기기**: `"consent": false` (참여 동의 철회)
- 멘토는 **지울 수 없습니다.** 문의 기록이 멘토를 가리키고 있기 때문입니다. 쉬게 하거나 숨깁니다.
- 멘토가 답장할 메일 주소와 `email`이 **같아야** 답장이 자동 전달됩니다.

**멘토 추가: POST /admin/mentors**
```json
{ "id": "mt-11", "name": "학생에게 보이는 이름", "exit_year": 2022,
  "career_paths": [], "path_summary": "한 줄 요약", "summary": "경험 소개",
  "tags": [], "topics": [], "consent": true, "available": true, "email": "멘토 메일 주소" }
```
- `id`는 영어 소문자·숫자·`-`로, 다른 멘토와 겹치지 않게 정합니다. **한 번 정하면 바꿀 수 없습니다.**
- `exit_year`(엑시트 연도)가 비어 있으면 사이트 목록에 나오지 않습니다.
- `tags`, `topics`, `career_paths`에 넣을 값은 팀 문서 `docs/TAGS.md`의 기준을 따릅니다. 잘 모르겠으면 비워 두고 꾸로록 팀에 부탁합니다.
- **참여에 동의한 멘토만** 넣습니다.

## 1-5. 메일 문구·숫자 바꾸기
- **GET /admin/settings**: 지금 설정 16개 (`key`, `value`, `description`)
- **PATCH /admin/settings**: 바꿀 것만 넣습니다. **바로 다음 메일부터** 적용됩니다.
  ```json
  { "values": { "senderName": "꾸로록", "rateLimitPerDay": "5" } }
  ```

| 키 | 하는 일 | 기본값 |
|---|---|---|
| serviceName | 서비스 이름 | 꾸로록 |
| senderName | 메일 '보낸 사람'에 보이는 이름 | 꾸로록 |
| mentorSubjectPrefix | 멘토에게 가는 메일 제목 앞 말머리 | [꾸로록 문의] |
| mentorFooter | 멘토 메일 맨 아래 안내 문구 | |
| studentSubjectPrefix | 학생에게 전달되는 답장 메일 말머리 | [꾸로록 답장] |
| studentForwardIntro / studentForwardFooter | 답장 전달 메일 맨 위 / 맨 아래 문구 | |
| studentCopySubjectPrefix | 학생에게 가는 사본 말머리 | [꾸로록 보낸 문의] |
| studentCopyIntro / studentCopyFooter | 사본 메일 맨 위 / 맨 아래 문구 | |
| rateLimitMinutes / rateLimitPerWindow | 같은 학생 메일로 몇 분 안에 몇 건까지 | 10분 / 3건 |
| rateLimitPerDay | 같은 학생 메일로 하루(자정 기준) 몇 건까지 | 5건 |
| reminderDays | 답장이 없을 때 며칠째에 리마인드 | 10 (0이면 안 보냄) |
| mentorReminderSubjectPrefix / mentorReminderIntro | 리마인드 말머리 / 맨 위 문구 | [꾸로록 리마인드] |

- 숫자 칸은 `"5"`처럼 **따옴표 안에 0 이상의 정수**로 씁니다. `0`이면 그 제한이 꺼집니다.
- `reminderDays`를 바꾸면 `mentorReminderIntro`의 "열흘 전"도 같이 고칩니다.
- `key`(왼쪽 이름)는 바꾸지 않습니다. 없는 키를 넣으면 `422`.

## 1-6. 알아 둘 동작
- **리마인드**: 매일 오전 10~11시에 자동으로, 답장이 없고 보낸 날짜로부터 10일째가 된 문의를 멘토에게 **한 번만** 다시 보냅니다. (예: 11월 1일 문의 → 11월 11일)
- **횟수 제한**: 같은 학생 메일로 10분에 3건, 하루 5건이 넘으면 사이트에서 막히고 안내 문구가 나옵니다. 정상입니다.
- **멘토는 받은 메일의 '답장' 버튼으로** 회신해야 합니다. 새 메일로 보내면 전달되지 않습니다.
- 답장은 **글자만** 전달됩니다(첨부·이미지 제외). 멘토가 본문에 쓴 서명·전화번호는 그대로 전달되니 멘토에게 미리 안내합니다.
- 학생이 전달받은 메일에 다시 답장해도 멘토에게 가지 않습니다.

## 1-7. 중계 Gmail 메일함
- 라벨 `메일자동화/전달완료`: 학생에게 전달한 답장. 할 일 없음.
- 라벨 `메일자동화/확인필요`: 1-3 참고.
- 멘토 답장이 **스팸함**에 들어가면 처리되지 않습니다. 가끔 스팸함을 보고, 멘토 메일이 있으면 "스팸 아님"으로 옮깁니다.
- 메일을 열어 봐도(읽음 처리) 자동 전달에는 영향이 없습니다. 라벨은 지우지 않습니다.

## 1-8. 문제가 생겼을 때
| 증상 | 확인할 것 |
|---|---|
| 답장이 학생에게 안 감 | ① 1-3 확인필요 목록 ② 멘토가 '답장' 버튼으로 보냈는지 ③ 중계 Gmail 스팸함 ④ 운영 시트 **메일 자동화 → 상태 보기**에서 `답장 확인 트리거: 1개`인지 (0개면 **자동 실행 켜기**) ⑤ 상태 보기의 백엔드 응답이 정상인지 |
| 사이트에서 문의가 안 보내짐 | 안내 문구가 횟수 제한이면 정상. 아니면 **상태 보기**의 "오늘 남은 Gmail 발송 수"가 1 이하인지 (문의 1건에 2통 필요, 다음 날 풀림). 그 밖에는 꾸로록 팀(개발자)에게 문의 |
| 리마인드가 안 감 | 상태 보기 `리마인드 트리거: 1개`, 설정 `reminderDays`가 0이 아닌지, 멘토가 `available: true`인지. 한 문의에 한 번만 갑니다 |
| 트리거 실패 알림 메일이 옴 | 서버가 잠깐 응답하지 않으면 생길 수 있고, 다음 차례에 다시 처리합니다. 하루 넘게 계속 오면 개발자에게 문의 (Apps Script 편집기 왼쪽 **☰ 실행**에 오류 내용이 있음) |
| 관리자 로그인 `503` | 서버 설정 문제. 개발자에게 문의 (2-4) |

**메일 자동화 메뉴는 반드시 중계 계정으로 로그인한 상태에서** 누릅니다.

---

# 2부. 설치·옮기기 (다음 개발자용)

## 2-1. 구성 요소와 계정
| 무엇 | 하는 일 | 계정·설정 위치 |
|---|---|---|
| Supabase 프로젝트 | 기록 저장 (`mentors`, `inquiries`, `mail_replies`, `mail_settings`, `inquiry_counters`) | 팀 Supabase. 테이블: `supabase/migrations/0002_mail_tables.sql` |
| 백엔드 (Render) | 판단·기록, 학생 API, 관리자 API, 내부 API | Render 서비스 → Environment |
| 사이트 (Vercel) | 학생 화면 | Vercel |
| 중계 Gmail + 운영 시트의 Apps Script | 메일 보내기·받기, 5분/매일 트리거 | 중계 계정. 코드: `apps-script/src/` |
| UptimeRobot | 무료 Render 서버가 잠들지 않게 `/health`를 주기적으로 부름 | 팀 계정 |

값이 어디서 어디로 가는지는 [README 2-4](../README.md#2-4-값-연결-비밀값은-두-방향)에 있습니다.

## 2-2. 처음 설치 / 기관 계정으로 옮기기
기관용 새 Gmail(중계 계정)로 옮기는 경우를 기준으로 씁니다. 처음 설치도 같은 순서입니다.

**준비**
- 기관용 새 Gmail 계정 1개 (예: `YOUR_RELAY_ACCOUNT@gmail.com`)
- Render 환경변수를 고칠 수 있는 권한
- (처음 설치일 때만) Supabase에 `0002_mail_tables.sql` 실행, 멘토 넣기 (`scripts/load_mentors.py` → Table Editor에서 메일을 먼저 넣고 `available` 켜기, `scripts/README.md`)

**순서**
1. **새 중계 계정으로 로그인**한 브라우저(시크릿 창 권장)에서 운영 시트를 엽니다. 시트는 기존 중계 계정이 새 계정에 공유해 둡니다.
2. **파일 → 사본 만들기** → 이름 `꾸로록 메일 자동화` → 새 사본에서 작업합니다. Apps Script도 같이 복사됩니다.
   - 처음 설치라면: 새 구글 시트를 만들고 **확장 프로그램 → Apps Script**에 `apps-script/src/` 14개 파일을 붙여 넣습니다 ([README 4장](../README.md#4-코드를-바꿨을-때-운영-apps-script에-반영) 2번 방법).
3. 사본 **확장 프로그램 → Apps Script → ⚙ 프로젝트 설정 → 스크립트 속성**에 추가합니다.
   - `BACKEND_URL` = `https://YOUR_BACKEND.onrender.com`
   - `TEST_STUDENT_EMAIL` = 테스트 메일 받을 담당자 주소
4. 시트를 새로고침 → **메일 자동화 → ① 설치·점검 (setup)** → 승인 창(중계 계정 선택 → 고급 → 이동 → 허용) → 메뉴를 한 번 더 누름
   - `⚠ 계정이 바뀌어 … 새로 만듭니다`는 정상입니다. 이전 계정의 키를 지우고 새 계정의 `API_KEY`·`MAIL_WEBHOOK_SECRET`을 만든 것입니다. (`BACKEND_URL`도 지워졌으니 3번을 다시 넣고 setup을 한 번 더 누릅니다)
   - 결과에 실행 계정이 **새 중계 계정**인지, 트리거 2개, 백엔드 응답 정상인지 봅니다.
5. Apps Script **배포 → 새 배포 → ⚙ 웹 앱** → 실행: **나**, 액세스: **모든 사용자** → **배포** → 웹앱 URL 복사
6. Render → 서비스 → **Environment**에서 값을 바꾸고 한 번에 **Save and deploy**
   | 환경변수 | 값 |
   |---|---|
   | `APPS_SCRIPT_URL` | 5번 웹앱 URL |
   | `APPS_SCRIPT_API_KEY` | 스크립트 속성 `API_KEY` |
   | `MAIL_WEBHOOK_SECRET` | 스크립트 속성 `MAIL_WEBHOOK_SECRET` |
   | `MAIL_ENABLED` | `true` |
   | `ADMIN_PASSWORD` | (처음이거나 바꿀 때) 12자 이상 |
   | `SUPABASE_URL`, `SUPABASE_KEY` | (처음일 때) `https://(프로젝트ID).supabase.co`까지만, service_role 키 |
7. 확인
   - Apps Script 편집기 → `Test` → `testBackendConnection` 실행 → `비밀값 확인` ✅
   - 사이트에서 테스트 문의 → 멘토 '답장' → 학생에게 `[꾸로록 답장]` 도착 (README 7장의 운영 확인과 같은 방법)
8. **예전 중계 계정 정리**: 예전 시트의 Apps Script에서 **⏰ 트리거를 모두 삭제**하고 **배포 관리 → 보관**. 두 계정의 트리거가 동시에 돌면 안 됩니다.
9. 테스트 문의를 지웁니다 (2-5).

## 2-3. 키 바꾸기 (유출이 의심될 때)
| 키 | 바꾸는 방법 |
|---|---|
| `API_KEY` / `MAIL_WEBHOOK_SECRET` | 스크립트 속성에서 그 줄 삭제 → 시트 메뉴 setup → 새 값을 Render `APPS_SCRIPT_API_KEY` / `MAIL_WEBHOOK_SECRET`에 넣고 저장. 넣기 전까지 문의 보내기(앞) 또는 답장 전달(뒤)이 멈춥니다. 답장은 넣은 뒤 자동으로 다시 처리됩니다 |
| `ADMIN_PASSWORD` | Render에서 바꾸고 저장. 이전에 받은 로그인은 모두 풀립니다 |
| Supabase `service_role` 키 | Supabase에서 새로 만든 뒤 Render `SUPABASE_KEY` 교체 (RAG도 같은 값을 씀) |
| 웹앱 URL | 바뀌는 경우는 "새 배포"를 했을 때뿐. Render `APPS_SCRIPT_URL` 교체 |

## 2-4. 메일 기능 잠시 끄기
Render `MAIL_ENABLED`를 `false`로 저장하면, 사이트는 demo 멘토(`backend/app/data/mentors_demo.json`)를 보여 주고 문의는 서버 로그에만 남습니다. 관리자 API는 `503`이 됩니다.
Apps Script 트리거는 그동안 실패(백엔드 503)하지만 답장은 지워지지 않고, 다시 켜면 처리됩니다. 오래 끌 때는 시트 메뉴 **자동 실행 끄기**도 누릅니다.

## 2-5. 테스트 문의 지우기
Supabase → **SQL Editor**:
```sql
select id, created_at, student_name, title, replied from public.inquiries order by created_at;
```
```sql
delete from public.inquiries where id in ('q20261120-0001', 'q20261120-0002');
```
- 답장 처리 기록(`mail_replies`)은 같이 지워집니다.
- **`inquiry_counters`는 지우지 않습니다.** 지우면 같은 문의번호가 다시 쓰여서, 테스트 메일에 늦게 온 답장이 실제 학생에게 전달될 수 있습니다.
- 답장 없는 테스트 문의를 남겨 두면 10일째에 멘토에게 리마인드가 갑니다.

## 2-6. 코드가 바뀌었을 때
[README 4장](../README.md#4-코드를-바꿨을-때-운영-apps-script에-반영)을 따릅니다. 백엔드는 `main`에 merge되면 Render가 자동 배포합니다.
