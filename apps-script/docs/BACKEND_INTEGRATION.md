# 백엔드 연결 안내 (Step 7) — 백엔드·프론트 담당자용

멘토 문의 메일 자동화(Apps Script 웹앱)를 꾸로록 백엔드 `/contact-requests`에 연결하는 방법입니다.
메일 담당은 `/apps-script` 밖의 파일을 직접 고치지 않습니다. **아래 예시 코드를 보고 백엔드·프론트 담당자가 반영해 주세요.**

- 웹앱 API 명세: [API.md](./API.md) (v0.5)
- 이 문서의 예시 코드는 2026-11-16 main 기준으로 작성했고, 복사본에서 실제로 돌려 확인했습니다.
  - backend: `pytest` 107개 통과 (기존 92 + 새 15)
  - frontend: `npm run lint && npm run build` 통과

```
학생 폼 → (확인 창) → 백엔드 /contact-requests → Apps Script 웹앱(submitInquiry) → 중계 Gmail → 멘토
                                                  └→ 학생에게 "보낸 문의 사본" 메일
멘토 '답장' → 중계 Gmail → (5분마다 자동 확인) → 학생에게 전달      ← 백엔드는 할 일 없음
```

---

## 0. 순서 한눈에 보기

| 순서 | 할 일 | 누가 |
|---|---|---|
| 1 | 웹앱 v0.5 배포 (개인정보 동의 검사 빼기) — [README 10-1](../README.md#10-백엔드-연결-step-7) | 메일 담당 |
| 2 | 멘토 데이터 맞추기 (2장) | 백엔드 |
| 3 | `requirements.txt`, `contact.py`, 테스트 반영 (3~5장) → `pytest` | 백엔드 |
| 4 | 확인 창 추가, demo 문구 삭제 (6장) → `npm run lint && npm run build` | 프론트 |
| 5 | 내 `.env`와 Render 환경변수에 웹앱 주소·키 넣기 (3장). 값은 메일 담당에게 직접 받기 | 백엔드 |
| 6 | 실제 왕복 테스트 (8장) | 다 같이 |

> 1번이 먼저입니다. 이 예시 코드는 `privacyConsent`를 보내지 않아서, 옛 웹앱(v0.4)에 연결하면 모든 문의가 거절됩니다.
> 환경변수(5번)를 넣기 전까지는 예전처럼 **로그만 남기는 demo 방식**으로 동작하므로, 2~4번은 먼저 merge해도 안전합니다.

---

## 1. 바뀌는 점 요약

| 항목 | 지금 | 연결 후 |
|---|---|---|
| `/contact-requests` | 로그만 남김 | 환경변수가 있으면 웹앱을 불러 실제로 메일 발송. 없으면 지금처럼 로그만 (demo) |
| API 요청·응답 모양 | — | **바뀌지 않음** (`schemas.py`, `api.ts` 수정 없음) |
| 실패 응답 | 404, 409, 422 | + 429(너무 자주 보냄), 503(발송 실패), 502(웹앱 연결 문제). 모두 `detail`에 학생용 한국어 문구 |
| 프론트 | '보내기' → 바로 전송 | '보내기' → **"이대로 보내시겠습니까?"** 창 → '확인'을 눌러야 전송 |
| 개인정보 동의 체크박스 | 없음 | 없음 (팀 결정: 받지 않음. 웹앱도 v0.5에서 요구하지 않음) |

필드 이름 변환 (백엔드 → 웹앱): `mentor_id`→`mentorId`, `sender_name`→`studentName`, `reply_email`→`studentEmail`, `subject`→`title`, `message`→`body`

---

## 2. 멘토 데이터 맞추기 (`backend/app/data/mentors_demo.json`)

**왜 필요한가요?** 멘토 정보가 두 곳에 나뉘어 있습니다.
- 백엔드 `mentors_demo.json`: 사이트에 보이는 프로필과 연락 가능 여부(`available`)
- 메일 자동화 구글 시트 "멘토" 탭: **멘토 메일 주소**와 활성여부

학생이 사이트에서 멘토를 고르면 백엔드가 그 ID(`mt-01` 등)를 웹앱에 넘기고, 웹앱은 시트에서 **같은 ID의 메일 주소**를 찾아 보냅니다.
지금 시트에 실제 메일 주소가 있는 멘토는 **mt-01 ~ mt-06 (6명)** 뿐입니다.

| 그대로 두면 생기는 일 | |
|---|---|
| mt-07·08·09가 `available: true` | 학생이 연락 버튼을 누를 수 있지만, 시트에 메일이 없어 "찾을 수 없는 멘토예요." 오류가 남 |
| mt-05가 `available: false` | 시트에 메일이 있는 팀원인데 사이트에서 연락할 수 없음 |

**바꿀 것** (삭제하지 않고 `available` 값만):

| ID | available |
|---|---|
| mt-01 ~ mt-06 | `true` (mt-05를 false → true로) |
| mt-07, mt-08, mt-09 | `false` (true → false로) |
| mt-10 | 그대로 (참여 동의 `consent: false`라 원래 어디에도 안 보임) |

- `available: false`면 프로필은 그대로 보이고(추천 데모에도 쓰임), 연락만 "이 선배는 지금 연락을 받지 않아요."(409)로 막힙니다.
- **규칙**: 백엔드 `available`과 시트 `활성여부`가 **둘 다 켜진 멘토만** 실제로 메일을 받습니다. 멘토를 추가·중지할 때 두 곳을 같이 바꿉니다.

**같이 고칠 테스트**: `backend/tests/test_contact.py`의 `test_contact_unavailable_mentor`가 mt-05를 쓰고 있어서, mt-05를 true로 바꾸면 실패합니다. 한 줄만 바꿉니다.

```python
def test_contact_unavailable_mentor():
    assert post(mentor_id="mt-07").status_code == 409  # mt-07~09 는 available: false (메일 시트에 없는 멘토)
```

---

## 3. 환경변수

`backend/.env.example`의 `FRONTEND_ORIGINS=...` 아래에 추가합니다. (`.env.example`에는 **자리표시자만**, 실제 값은 각자 `.env`와 Render에만)

```bash
# ---- 멘토 문의 메일 (Apps Script 웹앱). 둘 중 하나라도 비워 두면 demo(로그만 남김) ----
# 값은 메일 담당에게 직접 받는다. GitHub·채팅·문서에 쓰지 않는다
# APPS_SCRIPT_URL=YOUR_WEB_APP_URL
# APPS_SCRIPT_API_KEY=YOUR_API_KEY
```

| 이름 | 값 | 어디에 |
|---|---|---|
| `APPS_SCRIPT_URL` | 웹앱 주소 (`https://script.google.com/macros/s/.../exec` 모양) | 내 `.env`, Render → Environment |
| `APPS_SCRIPT_API_KEY` | 웹앱 키 (64자) | 내 `.env`, Render → Environment |

- 관리자 API(Step 5-2)를 만들 때 `APPS_SCRIPT_ADMIN_TOKEN`이 추가됩니다. 지금은 필요 없습니다.
- 기관에 넘긴 뒤에는 기관이 새로 만든 웹앱 주소·키로 **값만 바꾸면** 됩니다. 코드는 그대로입니다.
- 웹앱 주소는 메일 담당이 "새 배포"를 하면 바뀝니다. 평소에는 "배포 관리 → 새 버전"으로 주소를 유지합니다.

---

## 4. `backend/requirements.txt`

웹앱 호출에 `httpx`를 씁니다. **이미 설치돼 있는 패키지**(지금은 테스트에만 씀)라 새로 설치할 것은 없고, 위치와 설명만 옮깁니다.
(이 파일은 한글 금지 규칙이 있어 영어 주석만 씁니다)

전체 파일:
```text
# Python packages for the backend.
# Install: pip install -r requirements.txt
# NOTE: keep this file ASCII-only (no Korean). pip on Korean Windows reads it
#       as cp949 and fails on non-ASCII characters.
fastapi>=0.115,<1.0      # API server framework
uvicorn[standard]>=0.30  # server that runs FastAPI
pydantic>=2.7,<3.0       # request/response data shapes
python-dotenv>=1.0       # read environment variables from .env
httpx>=0.27              # call the mail web app (Apps Script); also used by TestClient

# For tests (run `pytest` in the backend folder)
pytest>=8.0              # test runner

# To be added later (not installed yet)
# supabase      # DB + pgvector
# openai        # embeddings
# anthropic     # Claude answers
```

> 왜 httpx? 웹앱은 한 번 리다이렉트(302)한 뒤 답합니다. `follow_redirects=True`, `timeout=30`을 코드에 분명하게 쓸 수 있어 고릅니다.
> 파이썬 기본 `urllib`로도 가능하지만 리다이렉트 처리가 코드에 덜 드러납니다. (팀에서 바꾸고 싶으면 `_call_web_app` 함수 하나만 바꾸면 됩니다)

---

## 5. 백엔드 코드

### 5-1. `backend/app/services/contact.py` (파일 전체를 바꿉니다)

- `deliver_contact_request`의 이름과 인자는 그대로라 **`main.py`는 고치지 않아도 됩니다.**
  (원하면 `main.py`의 `/contact-requests` 설명 중 "(지금은 실제 메일을 보내지 않음)"만 지우면 됩니다)
- 실패하면 `HTTPException`을 던집니다. 프론트 `ContactModal`은 `detail` 문구를 그대로 보여 주므로 프론트 수정이 필요 없습니다.

```python
"""
학생 → 꾸로록 → 멘토 로 첫 연락을 전달하는 곳.

실제 발송은 메일 자동화(Google Apps Script 웹앱)가 한다. 이 파일은 그 웹앱을 대신 불러 주는 역할만 한다.
  학생 폼 → 이 서버(/contact-requests) → Apps Script 웹앱(submitInquiry) → 중계 Gmail → 멘토
  멘토가 '답장'하면 웹앱이 학생에게 자동으로 전달한다. (이 서버는 할 일 없음)
웹앱 API 명세: apps-script/docs/API.md

환경변수 (.env 또는 Render 환경변수. 코드·GitHub에 값을 쓰지 않는다)
  APPS_SCRIPT_URL      웹앱 주소
  APPS_SCRIPT_API_KEY  웹앱 키
  → 둘 중 하나라도 비어 있으면 예전처럼 **실제 메일을 보내지 않고 로그만 남긴다 (demo)**.
    키가 없는 팀원도 화면 개발을 계속할 수 있다.

개인정보 주의:
  - 멘토 이메일은 이 서버에 없다. (웹앱의 구글 시트 "멘토" 탭에만 있음)
  - 학생 이메일은 로그에 가려서(ab***@example.com) 남긴다. 재학생 상당수가 미성년자다.
  - 웹앱 주소·키는 로그에 남기지 않는다.
"""

import json
import logging
import os

import httpx
from fastapi import HTTPException

from app.schemas import ContactRequest, Mentor

# uvicorn 이 화면에 출력해 주는 로거를 같이 쓴다 (따로 설정하지 않아도 터미널에 보인다)
logger = logging.getLogger("uvicorn.error")

# 웹앱은 메일을 2통(멘토 + 학생 사본) 보내고 답하므로 몇 초 걸린다. 넉넉하게 30초까지 기다린다.
TIMEOUT_SECONDS = 30

# 웹앱이 응답하지 않거나, 키가 틀렸거나, 알 수 없는 오류일 때 학생에게 보여 줄 문구
UNAVAILABLE_MESSAGE = "지금은 문의를 보낼 수 없어요. 잠시 후 다시 시도해 주세요."

# 웹앱 에러 코드 → (HTTP 상태, 학생에게 보여 줄 문구)
# 문구가 None 이면 웹앱이 준 message 를 그대로 보여 준다. (예: 횟수 제한 안내)
# 여기에 없는 코드(UNAUTHORIZED, INTERNAL_ERROR 등)는 502 + UNAVAILABLE_MESSAGE.
# 문구나 상태를 바꾸고 싶으면 이 표만 고치면 된다.
ERROR_MAP: dict[str, tuple[int, str | None]] = {
    "TOO_MANY_REQUESTS": (429, None),
    "MENTOR_NOT_FOUND": (404, "찾을 수 없는 멘토예요."),
    "INVALID_EMAIL": (422, None),
    "INVALID_INPUT": (422, None),
    "SEND_FAILED": (503, "메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요."),
}


def _mask_email(email: str) -> str:
    """로그용으로 이메일 앞부분을 가린다. 예: abcdef@example.com → ab***@example.com"""
    local, _, domain = email.partition("@")
    return f"{local[:2]}***@{domain}"


def _web_app_settings() -> tuple[str, str] | None:
    """환경변수에서 웹앱 주소와 키를 읽는다. 하나라도 없으면 None (= demo 모드)."""
    url = os.getenv("APPS_SCRIPT_URL", "").strip()
    api_key = os.getenv("APPS_SCRIPT_API_KEY", "").strip()
    if not url or not api_key:
        return None
    return url, api_key


def _call_web_app(url: str, payload: dict) -> dict:
    """
    웹앱에 요청을 보내고 응답(JSON)을 돌려준다. (테스트에서는 이 함수를 가짜로 바꿔 끼운다)

    웹앱 호출 규칙 (apps-script/docs/API.md)
      - POST, Content-Type: text/plain, 본문은 JSON 문자열
      - 웹앱은 한 번 리다이렉트(302)한 뒤 답한다 → follow_redirects=True 가 꼭 필요하다
      - HTTP 상태는 성공·실패와 상관없이 200 → 성공 여부는 응답의 ok 로 판단한다
    """
    response = httpx.post(
        url,
        content=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "text/plain; charset=utf-8"},
        follow_redirects=True,
        timeout=TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return response.json()


def deliver_contact_request(request: ContactRequest, mentor: Mentor) -> None:
    """
    연락 요청을 멘토에게 전달한다.
    - 성공하면 아무것도 돌려주지 않는다. (main.py 가 201 응답을 만든다)
    - 실패하면 HTTPException 을 던진다. 프론트는 detail 문구를 그대로 학생에게 보여 준다.
    """
    settings = _web_app_settings()
    if settings is None:
        logger.info(
            "[demo] 연락 요청 (APPS_SCRIPT_URL/APPS_SCRIPT_API_KEY 가 없어 실제 메일은 보내지 않음) "
            "mentor=%s from=%s reply=%s subject=%r message_len=%d",
            mentor.id,
            request.sender_name,
            _mask_email(request.reply_email),
            request.subject,
            len(request.message),
        )
        return

    url, api_key = settings
    # 백엔드 필드 이름 → 웹앱 필드 이름
    payload = {
        "apiKey": api_key,
        "action": "submitInquiry",
        "mentorId": request.mentor_id,
        "studentName": request.sender_name,
        "studentEmail": request.reply_email,
        "title": request.subject,
        "body": request.message,
    }

    try:
        result = _call_web_app(url, payload)
    except (httpx.HTTPError, ValueError) as err:
        # 연결 실패·시간 초과·응답이 JSON 이 아님. (err 문구에는 웹앱 주소가 들어 있을 수 있어 종류만 남긴다)
        logger.error("메일 웹앱 호출 실패: %s mentor=%s", type(err).__name__, mentor.id)
        raise HTTPException(status_code=502, detail=UNAVAILABLE_MESSAGE) from None

    if not isinstance(result, dict):
        logger.error("메일 웹앱 응답 형식이 이상함 mentor=%s", mentor.id)
        raise HTTPException(status_code=502, detail=UNAVAILABLE_MESSAGE)

    if result.get("ok") is True:
        data = result.get("data") or {}
        logger.info(
            "문의 전달 완료 inquiry=%s mentor=%s reply=%s",
            data.get("inquiryId"),
            mentor.id,
            _mask_email(request.reply_email),
        )
        return

    error = result.get("error") or {}
    code = error.get("code")
    status_code, fixed_message = ERROR_MAP.get(code, (502, UNAVAILABLE_MESSAGE))
    detail = fixed_message or error.get("message") or UNAVAILABLE_MESSAGE
    # UNAUTHORIZED 는 서버의 APPS_SCRIPT_API_KEY 가 웹앱 키와 다르다는 뜻 (기관 인수 후 키가 바뀐 경우 등)
    logger.warning(
        "메일 웹앱 에러 code=%s → %d mentor=%s reply=%s",
        code,
        status_code,
        mentor.id,
        _mask_email(request.reply_email),
    )
    raise HTTPException(status_code=status_code, detail=detail)
```

### 5-2. `backend/tests/conftest.py` (파일 전체)

내 `.env`에 실제 웹앱 주소·키가 있어도, **`pytest`가 진짜 메일을 보내지 않게** 막는 설정(`no_real_mail`)을 추가합니다. 꼭 같이 넣어 주세요.

```python
"""모든 테스트에 공통으로 적용되는 설정."""

import pytest

from app.rate_limit import ask_limiter


@pytest.fixture(autouse=True)
def reset_rate_limit():
    """테스트마다 호출 횟수 카운터를 0으로 되돌린다. (앞 테스트의 호출이 뒤 테스트를 막지 않게)"""
    ask_limiter.reset()
    yield
    ask_limiter.reset()


@pytest.fixture(autouse=True)
def no_real_mail(monkeypatch):
    """
    테스트 중에는 절대 진짜 메일 웹앱을 부르지 않는다.
    내 .env 에 APPS_SCRIPT_URL·APPS_SCRIPT_API_KEY 가 있어도 테스트에서는 지워서 demo 모드로 돈다.
    (웹앱 연결을 검사하는 테스트는 test_contact_web_app.py 에서 가짜 웹앱을 따로 끼운다)
    """
    monkeypatch.delenv("APPS_SCRIPT_URL", raising=False)
    monkeypatch.delenv("APPS_SCRIPT_API_KEY", raising=False)
```

### 5-3. `backend/tests/test_contact_web_app.py` (새 파일)

진짜 웹앱 대신 가짜 응답을 끼워서, 필드 이름 변환과 에러 → HTTP 상태 변환을 확인합니다. 메일은 나가지 않습니다.

```python
"""POST /contact-requests → 메일 웹앱(Apps Script) 연결 테스트.

진짜 웹앱은 부르지 않는다. contact._call_web_app 을 가짜로 바꿔 끼워서
"웹앱이 이렇게 답하면 학생에게 이렇게 보인다"를 확인한다.
"""

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import contact
from app.services.mentors import list_mentors

client = TestClient(app)

VALID = {
    "mentor_id": "mt-01",
    "sender_name": "하늘",
    "reply_email": "student@example.org",
    "subject": "창업 고민 질문드려요",
    "message": "창업을 먼저 하신 이유가 궁금해요. 이야기 들려주실 수 있을까요?",
}

FAKE_URL = "https://web-app.example.invalid/exec"
FAKE_KEY = "TEST_API_KEY"


@pytest.fixture
def web_app(monkeypatch):
    """
    가짜 웹앱. calls 에 보낸 내용이 쌓이고, reply 에 넣은 값을 응답으로 돌려준다.
    reply 에 예외를 넣으면 그 예외를 던진다 (연결 실패 흉내).
    """
    monkeypatch.setenv("APPS_SCRIPT_URL", FAKE_URL)
    monkeypatch.setenv("APPS_SCRIPT_API_KEY", FAKE_KEY)
    state = {"calls": [], "reply": {"ok": True, "data": {"inquiryId": "q20261116-0001", "createdAt": "2026-11-16T10:00:00+09:00"}}}

    def fake_call(url, payload):
        state["calls"].append({"url": url, "payload": payload})
        if isinstance(state["reply"], Exception):
            raise state["reply"]
        return state["reply"]

    monkeypatch.setattr(contact, "_call_web_app", fake_call)
    return state


def post(**changes):
    return client.post("/contact-requests", json={**VALID, **changes})


def error_reply(code, message="웹앱 문구"):
    return {"ok": False, "error": {"code": code, "message": message}}


def test_success_sends_renamed_fields(web_app):
    res = post()
    assert res.status_code == 201
    assert res.json()["status"] == "delivered"
    assert len(web_app["calls"]) == 1
    call = web_app["calls"][0]
    assert call["url"] == FAKE_URL
    assert call["payload"] == {
        "apiKey": FAKE_KEY,
        "action": "submitInquiry",
        "mentorId": "mt-01",
        "studentName": "하늘",
        "studentEmail": "student@example.org",
        "title": "창업 고민 질문드려요",
        "body": VALID["message"],
    }


def test_too_many_requests_shows_web_app_message(web_app):
    message = "현재 메일 발송량이 많아 전송이 잠시 제한되었어요. 10분 후 다시 시도해 주세요."
    web_app["reply"] = error_reply("TOO_MANY_REQUESTS", message)
    res = post()
    assert res.status_code == 429
    assert res.json()["detail"] == message


@pytest.mark.parametrize(
    "code, status, detail",
    [
        ("MENTOR_NOT_FOUND", 404, "찾을 수 없는 멘토예요."),
        ("INVALID_EMAIL", 422, "웹앱 문구"),
        ("INVALID_INPUT", 422, "웹앱 문구"),
        ("SEND_FAILED", 503, "메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요."),
        ("UNAUTHORIZED", 502, contact.UNAVAILABLE_MESSAGE),
        ("INTERNAL_ERROR", 502, contact.UNAVAILABLE_MESSAGE),
        ("SOMETHING_NEW", 502, contact.UNAVAILABLE_MESSAGE),
    ],
)
def test_error_codes(web_app, code, status, detail):
    web_app["reply"] = error_reply(code)
    res = post()
    assert res.status_code == status
    assert res.json()["detail"] == detail


@pytest.mark.parametrize(
    "error",
    [httpx.ConnectError("연결 실패"), httpx.ReadTimeout("시간 초과"), ValueError("JSON 아님")],
)
def test_web_app_unreachable(web_app, error):
    web_app["reply"] = error
    res = post()
    assert res.status_code == 502
    assert res.json()["detail"] == contact.UNAVAILABLE_MESSAGE
    assert FAKE_KEY not in res.text and FAKE_URL not in res.text  # 키·주소는 학생에게 안 보인다


def test_odd_response_is_502(web_app):
    web_app["reply"] = ["not", "a", "dict"]
    assert post().status_code == 502


def test_demo_mode_without_env(monkeypatch):
    """환경변수가 없으면 웹앱을 부르지 않고 로그만 남긴다 (예전 동작)."""
    called = []
    monkeypatch.setattr(contact, "_call_web_app", lambda url, payload: called.append(payload))
    res = post()
    assert res.status_code == 201
    assert called == []


def test_unavailable_mentor_is_checked_before_web_app(web_app):
    """백엔드에서 available: false 인 멘토는 웹앱까지 가지 않는다 (409)."""
    unavailable = next(m.id for m in list_mentors() if not m.available)  # 데이터가 바뀌어도 동작하게 직접 찾음
    assert post(mentor_id=unavailable).status_code == 409
    assert web_app["calls"] == []
```

### 5-4. 확인
```bash
cd backend && source .venv/bin/activate && pytest
```

---

## 6. 프론트 (`frontend/src/components/ContactModal.tsx`)

'보내기'를 누르면 바로 보내지 않고 확인 창을 띄웁니다. 이미 있는 `ConfirmDialog`("작성을 그만둘까요?"에 쓰는 것)를 그대로 씁니다.
프론트 파일은 자주 바뀌어서 전체 대신 **바꿀 곳 6군데**만 적습니다. (각 블록의 위 코드를 찾아 아래 코드로 바꾸기)

**① 맨 위 설명 주석**
```tsx
// (지금은 실제 메일을 보내지 않고 서버 로그에만 남긴다)
```
```tsx
// (backend 에 메일 웹앱 환경변수가 없으면 실제 메일은 보내지 않고 서버 로그에만 남긴다)
```
그리고 `// - 작성 중인 내용이 있을 때 X·바깥 배경·Esc 를 …` 줄 바로 아래에 한 줄 추가:
```tsx
// - '보내기'를 누르면 "이대로 보내시겠습니까?" 확인 창을 띄우고, '확인'을 눌러야 실제로 보낸다.
```

**② 상태 하나 추가** (`confirmClose` 바로 아래)
```tsx
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
```

**③ Esc 키: 확인 창이 떠 있으면 모달을 닫지 않게**
```tsx
      if (e.key === "Escape" && !confirmClose) requestClose();
```
```tsx
      if (e.key === "Escape" && !confirmClose && !confirmSend) requestClose();
```

**④ 보내기: 확인 창부터 띄우고, '확인'에서 실제로 보내기** (`handleSubmit` 윗부분)
```tsx
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!filled) return;
    setStatus("sending");
```
```tsx
  // '보내기': 바로 보내지 않고 확인 창부터 띄운다
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!filled) return;
    setConfirmSend(true);
  }

  // 확인 창에서 '확인'을 눌렀을 때 실제로 보낸다
  async function send() {
    setConfirmSend(false);
    setStatus("sending");
```
(그 아래 `setError(null); try { await sendContactRequest(...) ...`는 그대로 `send` 안에 남습니다)

**⑤ 완료 화면의 demo 문구 삭제** (실제 연결하면 사실이 아니게 됨)
```tsx
              <p className="pt-2 text-xs text-muted">(demo: 실제 메일은 보내지 않고 서버 로그에만 남겨요)</p>
```
→ 이 줄을 지웁니다.

**⑥ 확인 창 추가** (맨 아래 `{confirmClose && (` 바로 앞에)
```tsx
      {confirmSend && (
        <div onClick={(e) => e.stopPropagation()}>
          <ConfirmDialog
            title="이대로 보내시겠습니까?"
            body={`${mentor.name} 선배에게 메일이 전송돼요.`}
            cancelLabel="취소"
            confirmLabel="확인"
            onCancel={() => setConfirmSend(false)}
            onConfirm={send}
          />
        </div>
      )}

```

확인: `cd frontend && npm run lint && npm run build`

> `ConfirmDialog`는 처음에 '취소' 쪽에 초점을 둡니다. 실수로 엔터를 눌러도 바로 보내지지 않습니다.

---

## 7. 웹앱 에러 → 학생에게 보이는 응답

`contact.py`의 `ERROR_MAP` 표 하나만 고치면 바꿀 수 있습니다.

| 웹앱 에러 | HTTP | 학생에게 보이는 문구 (`detail`) |
|---|---|---|
| (성공) | 201 | 기존과 같음. 프론트 완료 화면: "메일 전송이 완료되었어요!" / "작성하신 메일 사본을 적어주신 메일로도 보내드렸어요." |
| TOO_MANY_REQUESTS | 429 | 웹앱 문구 그대로. 예: "현재 메일 발송량이 많아 전송이 잠시 제한되었어요. 10분 후 다시 시도해 주세요." / "같은 메일 주소로는 하루에 5건까지 보낼 수 있어요. 내일 다시 시도해 주세요." |
| MENTOR_NOT_FOUND | 404 | "찾을 수 없는 멘토예요." |
| INVALID_EMAIL, INVALID_INPUT | 422 | 웹앱 문구 그대로 (백엔드가 먼저 검사하므로 거의 나오지 않음) |
| SEND_FAILED | 503 | "메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요." (Gmail 하루 한도 등) |
| UNAUTHORIZED, INTERNAL_ERROR, 그 밖의 코드 | 502 | "지금은 문의를 보낼 수 없어요. 잠시 후 다시 시도해 주세요." |
| 연결 실패, 30초 시간 초과, JSON 아님 | 502 | 위와 같음 |

- 원인(키가 틀림 등)은 학생에게 보이지 않고 **서버 로그**에만 남습니다. 로그에는 웹앱 주소·키가 남지 않고, 학생 메일은 가려집니다.
- 서버 로그에 `code=UNAUTHORIZED`가 보이면 `APPS_SCRIPT_API_KEY`가 웹앱의 키와 다른 것입니다.

---

## 8. 실제 왕복 테스트 (다 같이, 환경변수를 넣은 뒤)

준비: 멘토 역할 팀원 1명(시트 멘토 탭에 메일이 있는 사람), 학생 역할 1명(본인 메일).
메일 담당이 원본 시트 설정 탭의 `rateLimitMinutes`·`rateLimitPerDay`를 0으로 두면 테스트 중 횟수 제한에 걸리지 않습니다. (끝나면 10·5로 되돌리기)

1. 사이트에서 멘토(mt-01~06 중 협조자)를 고르고 폼 작성 → '보내기' → **"이대로 보내시겠습니까?"** 창 → '취소'를 누르면 아무 일도 없는지.
2. 다시 '보내기' → '확인' → 완료 화면(demo 문구 없음)이 나오는지.
3. 멘토 메일함에 `[꾸로록 문의] 제목` 메일이 왔는지 (**스팸함도 확인**). 학생 메일함에 `[꾸로록 보낸 문의] 제목` 사본이 왔는지.
4. 멘토가 받은 메일에서 **'답장' 버튼**으로 회신 (새 메일로 보내면 전달되지 않음).
5. 5분 안에 학생 메일함에 `[꾸로록 답장] 제목`이 오는지. 멘토 메일 주소가 보이지 않는지.
6. 메일 담당이 시트 "문의" 탭에서 그 줄의 답장여부 TRUE, 답장일시를 확인.
7. 오류 화면 확인 (선택): mt-07을 골라 "이 선배는 지금 연락을 받지 않아요." 문구가 나오는지.
8. 시트 공유 범위가 **팀원까지만**인지 확인 (학생 이름·메일이 쌓임).

---

## 9. (선택) IP 기준 횟수 제한

웹앱은 **같은 학생 메일** 기준(10분 3건·하루 5건)으로만 막습니다. 메일 주소를 바꿔 가며 보내는 것은 막지 못합니다.
Gmail 하루 약 100통 한도를 문의(1건 = 2통)·답장 전달·리마인드가 같이 쓰므로, 필요하면 `/ask`에 쓰는 `app/rate_limit.py`처럼 `/contact-requests`에도 IP 기준 제한을 붙일 수 있습니다. 붙일지와 숫자는 백엔드 담당이 정합니다.

---

## 10. 자주 생기는 문제

| 증상 | 확인할 것 |
|---|---|
| 완료 화면은 뜨는데 메일이 안 옴 | 서버 로그에 `[demo]`가 찍히면 환경변수가 비어 있음. 스팸함. 멘토가 시트 멘토 탭에 있고 활성인지 |
| 항상 "지금은 문의를 보낼 수 없어요" (502) | 서버 로그의 `code=` 확인. `UNAUTHORIZED`면 키 불일치, `ConnectError`·`ReadTimeout`이면 주소 오류나 웹앱 장애. 웹앱 주소가 "새 배포"로 바뀌지 않았는지 |
| "찾을 수 없는 멘토예요." (404) | 백엔드 `mentors_demo.json`의 id와 시트 멘토 탭 `mentorId`가 글자 하나까지 같은지, 시트 활성여부가 켜져 있는지 |
| "메일을 보내지 못했어요" (503) | 중계 Gmail 하루 발송 한도. 메일 담당이 시트 메뉴 → 상태 보기에서 남은 발송 수 확인 |
| `pytest`가 진짜 메일을 보냄 | `tests/conftest.py`에 `no_real_mail`이 빠졌는지 확인 (5-2) |
