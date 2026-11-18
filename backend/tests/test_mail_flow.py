"""
메일 기능 흐름 테스트 (MAIL_ENABLED=true). 진짜 Supabase·메일 웹앱은 부르지 않는다.

- FakeStore: app/mail/store.py 의 SupabaseMailStore 와 같은 메서드를 메모리로 흉내 낸다.
- FakeMail: app/mail/apps_script.py 의 send_mail / get_quota 를 흉내 낸다 (보낸 메일을 모아 둠).
"""

from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.mail import apps_script, store as store_module, timeutil
from app.mail.apps_script import MailSendError
from app.mail.mail_settings import DEFAULTS
from app.mail.reminders import reminder_cutoff
from app.mail.store import StoreError
from app.main import app

client = TestClient(app)
SECRET = "TEST_WEBHOOK_SECRET"
NOW = datetime(2026, 11, 17, 15, 0, tzinfo=timeutil.KST)

MENTORS = [
    {"id": "mt-01", "name": "새벽", "exit_year": 2020, "career_paths": ["창업"], "path_summary": "요약",
     "summary": "경험", "tags": ["창업"], "topics": ["창업"], "consent": True, "available": True,
     "email": "mentor1@example.com"},
    {"id": "mt-02", "name": "도토리", "exit_year": 2021, "career_paths": ["취업"], "path_summary": "",
     "summary": "", "tags": [], "topics": [], "consent": True, "available": False, "email": "mentor2@example.com"},
    {"id": "mt-03", "name": "연도없음", "exit_year": None, "career_paths": [], "path_summary": "", "summary": "",
     "tags": [], "topics": [], "consent": True, "available": True, "email": "mentor3@example.com"},
    {"id": "mt-10", "name": "비공개", "exit_year": 2019, "career_paths": [], "path_summary": "", "summary": "",
     "tags": [], "topics": [], "consent": False, "available": False, "email": None},
]


class FakeStore:
    def __init__(self):
        self.mentors = [dict(m) for m in MENTORS]
        self.settings = {}
        self.inquiries: dict[str, dict] = {}
        self.replies: dict[str, dict] = {}
        self.seq = 0
        self.fail = False

    def _check(self):
        if self.fail:
            raise StoreError("fake down")

    def list_mentors(self):
        self._check()
        return [dict(m) for m in self.mentors]

    def get_settings(self):
        self._check()
        return dict(self.settings)

    def recent_inquiry_times(self, email, since):
        return [r["created_at"] for r in self.inquiries.values()
                if r["student_email"] == email and timeutil.parse_ts(r["created_at"]) >= since]

    def next_inquiry_id(self):
        self.seq += 1
        return f"q{timeutil.now().strftime('%Y%m%d')}-{self.seq:04d}"

    def insert_inquiry(self, row):
        self._check()
        saved = {**row, "created_at": timeutil.to_iso(timeutil.now()), "replied": False, "replied_at": None,
                 "reminded_at": None}
        self.inquiries[row["id"]] = saved
        return dict(saved)

    def delete_inquiry(self, inquiry_id):
        self.inquiries.pop(inquiry_id, None)

    def get_inquiry(self, inquiry_id):
        row = self.inquiries.get(inquiry_id)
        return dict(row) if row else None

    def mark_replied(self, inquiry_id, at):
        row = self.inquiries[inquiry_id]
        if not row["replied"]:
            row["replied"], row["replied_at"] = True, timeutil.to_iso(at)

    def due_reminders(self, before, limit):
        rows = [r for r in self.inquiries.values() if not r["replied"] and r["reminded_at"] is None
                and timeutil.parse_ts(r["created_at"]) < before]
        return [dict(r) for r in sorted(rows, key=lambda r: r["created_at"])[:limit]]

    def mark_reminded(self, inquiry_id, at):
        row = self.inquiries[inquiry_id]
        if row["reminded_at"] is None:
            row["reminded_at"] = timeutil.to_iso(at)

    def get_reply(self, message_id):
        return self.replies.get(message_id)

    def insert_reply(self, row):
        self.replies.setdefault(row["message_id"], dict(row))


class FakeMail:
    def __init__(self):
        self.sent: list[dict] = []
        self.quota = 100
        self.fail_to: dict[str, str] = {}  # 받는 사람 → 에러 코드

    def send_mail(self, **kwargs):
        code = self.fail_to.get(kwargs["to"])
        if code:
            raise MailSendError(code)
        self.sent.append(kwargs)
        self.quota -= 1

    def get_quota(self):
        return self.quota


@pytest.fixture
def env(monkeypatch):
    for name, value in {"MAIL_ENABLED": "true", "SUPABASE_URL": "https://db.example.invalid",
                        "SUPABASE_KEY": "TEST_KEY", "APPS_SCRIPT_URL": "https://mail.example.invalid/exec",
                        "APPS_SCRIPT_API_KEY": "TEST_API_KEY", "MAIL_WEBHOOK_SECRET": SECRET}.items():
        monkeypatch.setenv(name, value)
    store, mail = FakeStore(), FakeMail()
    clock = {"now": NOW}
    monkeypatch.setattr(store_module, "get_store", lambda: store)
    monkeypatch.setattr(apps_script, "send_mail", mail.send_mail)
    monkeypatch.setattr(apps_script, "get_quota", mail.get_quota)
    monkeypatch.setattr(timeutil, "now", lambda: clock["now"])
    return {"store": store, "mail": mail, "clock": clock}


VALID = {
    "mentor_id": "mt-01",
    "sender_name": "하늘",
    "reply_email": " Student@Example.org ",
    "subject": "창업 고민 질문드려요",
    "message": "창업을 먼저 하신 이유가 궁금해요. 이야기 들려주실 수 있을까요?",
}


def post(**changes):
    return client.post("/contact-requests", json={**VALID, **changes})


# ---------------------------------------------------------------- 멘토 목록
def test_mentors_come_from_store_without_email(env):
    res = client.get("/mentors")
    assert res.status_code == 200
    ids = [m["id"] for m in res.json()]
    assert ids == ["mt-01", "mt-02"]  # mt-03 은 exit_year 없어서 빠짐, mt-10 은 동의 안 함
    assert "@" not in res.text and "consent" not in res.text


def test_mentors_store_down_is_502(env):
    env["store"].fail = True
    assert client.get("/mentors").status_code == 502


# ---------------------------------------------------------------- 문의 보내기
def test_contact_saves_and_sends_mentor_mail_and_copy(env):
    res = post()
    assert res.status_code == 201
    store, mail = env["store"], env["mail"]
    [inquiry] = store.inquiries.values()
    assert inquiry["id"] == "q20261117-0001"
    assert inquiry["student_email"] == "student@example.org"  # 공백 제거 + 소문자
    to_mentor, copy = mail.sent
    assert to_mentor["to"] == "mentor1@example.com"
    assert to_mentor["reply_to_inquiry_id"] == "q20261117-0001"
    assert to_mentor["subject"] == "[꾸로록 문의] 창업 고민 질문드려요"
    assert "student@example.org" not in to_mentor["text_body"]  # 멘토에게 학생 메일 안 보임
    assert "문의번호: q20261117-0001" in to_mentor["text_body"]
    assert copy["to"] == "student@example.org" and "reply_to_inquiry_id" not in copy
    assert copy["subject"].startswith("[꾸로록 보낸 문의]")
    assert "mentor1@example.com" not in res.text


def test_contact_unavailable_mentor_does_not_send(env):
    assert post(mentor_id="mt-02").status_code == 409
    assert env["mail"].sent == [] and env["store"].inquiries == {}


def test_contact_rate_limit_window(env):
    for _ in range(3):
        assert post().status_code == 201
    res = post(reply_email="STUDENT@example.org")  # 대소문자만 다른 같은 주소
    assert res.status_code == 429
    assert res.json()["detail"] == "현재 메일 발송량이 많아 전송이 잠시 제한되었어요. 10분 후 다시 시도해 주세요."
    env["clock"]["now"] = NOW + timedelta(minutes=11)
    assert post().status_code == 201  # 10분 지나면 다시 됨


def test_contact_rate_limit_day(env):
    for i in range(5):
        env["clock"]["now"] = NOW + timedelta(minutes=11 * i)
        assert post().status_code == 201
    env["clock"]["now"] = NOW + timedelta(hours=2)
    res = post()
    assert res.status_code == 429 and "하루에 5건" in res.json()["detail"]
    env["clock"]["now"] = NOW + timedelta(hours=10)  # 다음 날 (한국 자정 지남)
    assert post().status_code == 201


def test_contact_rate_limit_off_with_zero(env):
    env["store"].settings = {"rateLimitMinutes": "0", "rateLimitPerDay": "0"}
    for _ in range(7):
        assert post().status_code == 201


def test_contact_quota_too_low(env):
    env["mail"].quota = 1
    res = post()
    assert res.status_code == 503 and env["store"].inquiries == {}


def test_contact_mentor_mail_failure_deletes_inquiry(env):
    env["mail"].fail_to["mentor1@example.com"] = "SEND_FAILED"
    res = post()
    assert res.status_code == 503
    assert res.json()["detail"] == "메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요."
    assert env["store"].inquiries == {}


def test_contact_web_app_unreachable_is_502(env):
    env["mail"].fail_to["mentor1@example.com"] = "UNREACHABLE"
    assert post().status_code == 502 and env["store"].inquiries == {}


def test_contact_copy_failure_is_ignored(env):
    env["mail"].fail_to["student@example.org"] = "SEND_FAILED"
    assert post().status_code == 201
    assert len(env["store"].inquiries) == 1


def test_contact_store_down_is_502(env):
    env["store"].fail = True
    assert post().status_code == 502


def test_contact_settings_change_applies_immediately(env):
    env["store"].settings = {"mentorSubjectPrefix": "[새 말머리]", "senderName": "꾸로록 운영팀"}
    post()
    assert env["mail"].sent[0]["subject"] == "[새 말머리] 창업 고민 질문드려요"
    assert env["mail"].sent[0]["from_name"] == "꾸로록 운영팀"


def test_contact_missing_env_is_503_not_crash(env, monkeypatch):
    monkeypatch.delenv("APPS_SCRIPT_URL")  # MAIL_ENABLED=true 인데 설정 하나가 빠짐
    res = post()
    assert res.status_code == 503 and env["mail"].sent == [] and env["store"].inquiries == {}


# ---------------------------------------------------------------- 내부 API 인증
def inbound(messages, secret=SECRET):
    headers = {"X-Kkurolog-Mail-Secret": secret} if secret else {}
    return client.post("/internal/mail/inbound", json={"messages": messages}, headers=headers)


def test_inbound_requires_secret(env):
    assert inbound([], secret=None).status_code == 401
    assert inbound([], secret="WRONG").status_code == 401
    res = inbound([])
    assert res.status_code == 200 and res.json() == {"results": []}


def test_inbound_disabled_is_503(monkeypatch):
    monkeypatch.setenv("MAIL_WEBHOOK_SECRET", SECRET)  # MAIL_ENABLED 는 꺼져 있음 (conftest)
    assert inbound([]).status_code == 503


def test_internal_api_hidden_from_docs():
    assert "/internal/mail" not in client.get("/openapi.json").text


# ---------------------------------------------------------------- 답장 처리
def make_reply(env, body="좋은 질문이에요.\n\n2026년 11월 17일 (월) 오후 3:00, 꾸로록 <relay>님이 작성:\n> 원래 문의",
               sender="Mentor1@Example.com", message_id="msg-1"):
    post()
    inquiry_id = next(iter(env["store"].inquiries))
    env["mail"].sent.clear()
    return inquiry_id, {
        "messageId": message_id,
        "receivedAt": "2026-11-17T15:20:00+09:00",
        "from": sender,
        "recipients": [f"꾸로록 <relay+{inquiry_id}@gmail.com>"],
        "subject": "Re: [꾸로록 문의] 창업 고민 질문드려요",
        "plainBody": body,
    }


def test_inbound_forwards_to_student(env):
    inquiry_id, message = make_reply(env)
    res = inbound([message])
    assert res.json() == {"results": [{"messageId": "msg-1", "result": "forwarded"}]}
    [forward] = env["mail"].sent
    assert forward["to"] == "student@example.org" and "reply_to_inquiry_id" not in forward
    assert forward["subject"] == "[꾸로록 답장] 창업 고민 질문드려요"
    assert "좋은 질문이에요." in forward["text_body"] and "원래 문의" not in forward["text_body"]
    assert "mentor1@example.com" not in forward["text_body"].lower()
    inquiry = env["store"].inquiries[inquiry_id]
    assert inquiry["replied"] is True and inquiry["replied_at"].startswith("2026-11-17T15:20")
    assert env["store"].replies["msg-1"]["status"] == "forwarded"


def test_inbound_duplicate_message_is_not_forwarded_twice(env):
    _, message = make_reply(env)
    inbound([message])
    env["mail"].sent.clear()
    res = inbound([message])
    assert res.json()["results"][0]["result"] == "forwarded"
    assert env["mail"].sent == []


def test_inbound_second_reply_keeps_first_replied_at(env):
    inquiry_id, message = make_reply(env)
    inbound([message])
    first = env["store"].inquiries[inquiry_id]["replied_at"]
    second = {**message, "messageId": "msg-2", "receivedAt": "2026-11-18T10:00:00+09:00"}
    assert inbound([second]).json()["results"][0]["result"] == "forwarded"
    assert env["store"].inquiries[inquiry_id]["replied_at"] == first
    assert len(env["mail"].sent) == 2


def test_inbound_sender_mismatch_needs_review(env):
    _, message = make_reply(env, sender="stranger@example.com")
    assert inbound([message]).json()["results"][0]["result"] == "needs_review"
    assert env["mail"].sent == []
    assert env["store"].replies["msg-1"]["reason"] == "sender_mismatch"


def test_inbound_empty_body_needs_review(env):
    _, message = make_reply(env, body="2026년 11월 17일 (월) 오후 3:00, 꾸로록 <relay>님이 작성:\n> 원래 문의")
    assert inbound([message]).json()["results"][0]["result"] == "needs_review"
    assert env["store"].replies["msg-1"]["reason"] == "empty_body"


def test_inbound_unknown_inquiry_is_ignored(env):
    _, message = make_reply(env)
    message["recipients"] = ["relay+q20000101-9999@gmail.com"]
    assert inbound([message]).json()["results"][0]["result"] == "ignored"
    message["recipients"], message["plainBody"] = ["relay@gmail.com"], "관계없는 메일"
    assert inbound([message]).json()["results"][0]["result"] == "ignored"
    assert env["store"].replies == {}


def test_inbound_send_failure_is_retry_and_not_recorded(env):
    inquiry_id, message = make_reply(env)
    env["mail"].fail_to["student@example.org"] = "QUOTA_EXCEEDED"
    assert inbound([message]).json()["results"][0]["result"] == "retry"
    assert "msg-1" not in env["store"].replies and env["store"].inquiries[inquiry_id]["replied"] is False
    del env["mail"].fail_to["student@example.org"]
    assert inbound([message]).json()["results"][0]["result"] == "forwarded"  # 다음 차례에 성공


def test_inbound_inactive_mentor_reply_still_forwarded(env):
    _, message = make_reply(env)
    env["store"].mentors[0]["available"] = False  # 문의 뒤에 쉬게 된 멘토
    assert inbound([message]).json()["results"][0]["result"] == "forwarded"


def test_inbound_store_down_is_503(env):
    _, message = make_reply(env)
    env["store"].fail = True
    assert inbound([message]).status_code == 503


# ---------------------------------------------------------------- 리마인드
def reminders(secret=SECRET):
    return client.post("/internal/mail/reminders", headers={"X-Kkurolog-Mail-Secret": secret})


def test_reminder_cutoff_counts_calendar_days():
    now = datetime(2026, 11, 11, 10, 0, tzinfo=timeutil.KST)
    cutoff = reminder_cutoff(now, 10)
    assert datetime(2026, 11, 1, 23, 59, tzinfo=timeutil.KST) < cutoff  # 11/01 문의 → 11/11 대상
    assert not datetime(2026, 11, 2, 0, 1, tzinfo=timeutil.KST) < cutoff  # 11/02 문의는 아직


def test_reminders_send_once_on_day_ten(env):
    post()
    inquiry_id = next(iter(env["store"].inquiries))
    env["mail"].sent.clear()
    env["clock"]["now"] = NOW + timedelta(days=9)
    assert "없음" in reminders().json()["summary"]
    env["clock"]["now"] = NOW + timedelta(days=10)
    res = reminders()
    assert res.status_code == 200 and "1건 보냄" in res.json()["summary"]
    [mail] = env["mail"].sent
    assert mail["to"] == "mentor1@example.com" and mail["reply_to_inquiry_id"] == inquiry_id
    assert mail["subject"] == "[꾸로록 리마인드] 창업 고민 질문드려요"
    assert mail["text_body"].startswith(DEFAULTS["mentorReminderIntro"])
    assert env["store"].inquiries[inquiry_id]["reminded_at"] is not None
    assert "없음" in reminders().json()["summary"]  # 한 번만


def test_reminders_skip_replied_and_inactive(env):
    post()
    inquiry_id = next(iter(env["store"].inquiries))
    env["clock"]["now"] = NOW + timedelta(days=10)
    env["store"].mentors[0]["available"] = False
    assert "건너뜀" in reminders().json()["summary"]
    assert env["store"].inquiries[inquiry_id]["reminded_at"] is None
    env["store"].mentors[0]["available"] = True
    env["store"].inquiries[inquiry_id]["replied"] = True
    env["store"].inquiries[inquiry_id]["replied_at"] = "2026-11-18T10:00:00+09:00"
    assert "없음" in reminders().json()["summary"]


def test_reminders_off_with_zero_days(env):
    env["store"].settings = {"reminderDays": "0"}
    assert "0" in reminders().json()["summary"]


def test_reminders_require_secret(env):
    assert reminders(secret="WRONG").status_code == 401
