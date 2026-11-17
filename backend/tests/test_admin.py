"""
관리자 API (/admin/*) 테스트. 진짜 Supabase 는 부르지 않는다 (test_mail_flow 의 가짜 저장소에 관리자 기능을 더함).
"""

import time
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.admin import auth
from app.mail import apps_script, store as store_module, timeutil
from app.mail.mail_settings import DEFAULTS
from app.mail.store import StoreError
from app.main import app
from tests.test_mail_flow import NOW, SECRET, FakeMail, FakeStore

client = TestClient(app)
PASSWORD = "test-admin-password-123"


class AdminFakeStore(FakeStore):
    def __init__(self):
        super().__init__()
        self.settings = {key: value for key, value in DEFAULTS.items()}

    def _with_mentor(self, row):
        mentor = next((m for m in self.mentors if m["id"] == row["mentor_id"]), None)
        return {**row, "mentors": {"name": mentor["name"]} if mentor else None}

    def list_inquiries(self, replied, offset, limit):
        rows = [r for r in self.inquiries.values() if replied is None or r["replied"] == replied]
        rows.sort(key=lambda r: (r["created_at"], r["id"]), reverse=True)
        return [self._with_mentor(r) for r in rows[offset:offset + limit]], len(rows)

    def get_inquiry_with_mentor(self, inquiry_id):
        row = self.inquiries.get(inquiry_id)
        return self._with_mentor(row) if row else None

    def list_replies(self, inquiry_id):
        return sorted((r for r in self.replies.values() if r["inquiry_id"] == inquiry_id),
                      key=lambda r: r["received_at"])

    def list_review_replies(self, offset, limit):
        rows = [r for r in self.replies.values() if r["status"] in ("needs_review", "failed")]
        out = []
        for r in rows[offset:offset + limit]:
            inquiry = self.inquiries.get(r["inquiry_id"]) or {}
            out.append({**r, "inquiries": {"title": inquiry.get("title"), "student_name": inquiry.get("student_name"),
                                           "mentor_id": inquiry.get("mentor_id")}})
        return out, len(rows)

    @staticmethod
    def _check_rule(row):
        if row.get("available") and not (row.get("consent") and row.get("email")):
            raise StoreError("check", "23514")

    def insert_mentor(self, row):
        if any(m["id"] == row["id"] for m in self.mentors):
            raise StoreError("dup", "23505")
        self._check_rule(row)
        self.mentors.append(dict(row))
        return dict(row)

    def update_mentor(self, mentor_id, values):
        mentor = next((m for m in self.mentors if m["id"] == mentor_id), None)
        if not mentor:
            return None
        updated = {**mentor, **values}
        self._check_rule(updated)
        mentor.update(values)
        return dict(mentor)

    def list_settings(self):
        return [{"key": k, "value": v, "description": f"{k} 설명"} for k, v in sorted(self.settings.items())]

    def upsert_settings(self, values):
        self.settings.update(values)


@pytest.fixture
def env(monkeypatch):
    for name, value in {"MAIL_ENABLED": "true", "SUPABASE_URL": "https://db.example.invalid",
                        "SUPABASE_KEY": "TEST_KEY", "APPS_SCRIPT_URL": "https://mail.example.invalid/exec",
                        "APPS_SCRIPT_API_KEY": "TEST_API_KEY", "MAIL_WEBHOOK_SECRET": SECRET,
                        "ADMIN_PASSWORD": PASSWORD}.items():
        monkeypatch.setenv(name, value)
    store, mail = AdminFakeStore(), FakeMail()
    clock = {"now": NOW}
    monkeypatch.setattr(store_module, "get_store", lambda: store)
    monkeypatch.setattr(apps_script, "send_mail", mail.send_mail)
    monkeypatch.setattr(apps_script, "get_quota", mail.get_quota)
    monkeypatch.setattr(timeutil, "now", lambda: clock["now"])
    return {"store": store, "mail": mail, "clock": clock}


def login(password=PASSWORD):
    return client.post("/admin/login", json={"password": password})


@pytest.fixture
def headers(env):
    token = login().json()["token"]
    return {"Authorization": f"Bearer {token}"}


def add_inquiries(env, count, **changes):
    """학생 문의를 count 건 보낸다 (가짜 시간을 11분씩 옮겨 횟수 제한을 피함)."""
    env["store"].settings.update({"rateLimitMinutes": "0", "rateLimitPerDay": "0"})
    for i in range(count):
        env["clock"]["now"] = NOW + timedelta(minutes=11 * i)
        res = client.post("/contact-requests", json={
            "mentor_id": "mt-01", "sender_name": f"학생{i}", "reply_email": f"s{i}@example.org",
            "subject": f"제목{i}", "message": "창업을 먼저 하신 이유가 궁금해요. 알려주세요.", **changes})
        assert res.status_code == 201
    return sorted(env["store"].inquiries)


# ---------------------------------------------------------------- 로그인
def test_login_and_token(env):
    res = login()
    assert res.status_code == 200
    token = res.json()["token"]
    assert auth.verify_token(token)
    assert login("wrong-password-123").status_code == 401


def test_login_rate_limited(env):
    for _ in range(10):
        login("wrong-password-123")
    res = login()  # 맞는 비밀번호라도 10번 넘게 시도하면 막힘
    assert res.status_code == 429


def test_admin_disabled_without_password(env, monkeypatch):
    monkeypatch.delenv("ADMIN_PASSWORD")
    assert login().status_code == 503
    assert client.get("/admin/mentors", headers={"Authorization": "Bearer x.y"}).status_code == 503


def test_short_password_disables_admin(env, monkeypatch):
    monkeypatch.setenv("ADMIN_PASSWORD", "short")
    assert login("short").status_code == 503


def test_token_required_and_checked(env, headers):
    assert client.get("/admin/mentors").status_code == 401
    assert client.get("/admin/mentors", headers={"Authorization": "Bearer nonsense"}).status_code == 401
    assert client.get("/admin/mentors", headers=headers).status_code == 200


def test_token_expires_and_password_change_revokes(env, headers, monkeypatch):
    token = headers["Authorization"].split()[1]
    assert not auth.verify_token(token, now=time.time() + auth.TOKEN_TTL_SECONDS + 1)
    monkeypatch.setenv("ADMIN_PASSWORD", "another-password-456")
    assert client.get("/admin/mentors", headers=headers).status_code == 401


def test_tampered_token_rejected(env, headers):
    token = headers["Authorization"].split()[1]
    payload, signature = token.split(".")
    forged = auth._b64(b'{"exp": 9999999999}') + "." + signature
    assert client.get("/admin/mentors", headers={"Authorization": f"Bearer {forged}"}).status_code == 401


def test_admin_needs_mail_enabled(env, headers, monkeypatch):
    monkeypatch.setenv("MAIL_ENABLED", "false")
    assert client.get("/admin/mentors", headers=headers).status_code == 503


# ---------------------------------------------------------------- 문의
def test_inquiries_list_paging_and_filter(env, headers):
    ids = add_inquiries(env, 5)
    newest = ids[-1]
    env["store"].inquiries[ids[0]].update(replied=True, replied_at="2026-11-18T10:00:00+09:00")
    page1 = client.get("/admin/inquiries", params={"page_size": 2}, headers=headers).json()
    assert page1["total"] == 5 and len(page1["items"]) == 2 and page1["items"][0]["id"] == newest
    item = page1["items"][0]
    assert item["mentor_name"] == "새벽" and item["student_email"] == "s4@example.org"
    assert item["replied"] is False and item["replied_at"] is None and item["reminded_at"] is None
    page3 = client.get("/admin/inquiries", params={"page": 3, "page_size": 2}, headers=headers).json()
    assert len(page3["items"]) == 1
    replied = client.get("/admin/inquiries", params={"replied": "true"}, headers=headers).json()
    assert replied["total"] == 1 and replied["items"][0]["id"] == ids[0]
    assert client.get("/admin/inquiries", params={"replied": "false"}, headers=headers).json()["total"] == 4
    assert client.get("/admin/inquiries", params={"page_size": 101}, headers=headers).status_code == 422
    assert client.get("/admin/inquiries", params={"page": 0}, headers=headers).status_code == 422


def test_inquiry_detail_with_replies(env, headers):
    [inquiry_id] = add_inquiries(env, 1)
    message = {"messageId": "msg-1", "receivedAt": "2026-11-17T15:20:00+09:00", "from": "mentor1@example.com",
               "recipients": [f"relay+{inquiry_id}@gmail.com"], "plainBody": "좋은 질문이에요."}
    stranger = {**message, "messageId": "msg-2", "from": "x@example.com"}
    client.post("/internal/mail/inbound", json={"messages": [message, stranger]},
                headers={"X-Kkurolog-Mail-Secret": SECRET})
    detail = client.get(f"/admin/inquiries/{inquiry_id.upper()}", headers=headers).json()
    assert detail["item"]["replied"] is True
    assert [r["status"] for r in detail["replies"]] == ["forwarded", "needs_review"]
    assert detail["replies"][0]["reply_text"] == "좋은 질문이에요."
    review = client.get("/admin/replies/review", headers=headers).json()
    assert review["total"] == 1 and review["items"][0]["reason"] == "sender_mismatch"
    assert review["items"][0]["inquiry_title"] == "제목0"
    assert client.get("/admin/inquiries/q20000101-0001", headers=headers).status_code == 404
    assert client.get("/admin/inquiries/abc", headers=headers).status_code == 422


# ---------------------------------------------------------------- 멘토
def test_mentors_list_includes_email_for_admin_only(env, headers):
    admin = client.get("/admin/mentors", headers=headers).json()
    assert {m["id"] for m in admin} == {"mt-01", "mt-02", "mt-03", "mt-10"}
    assert admin[0]["email"] == "mentor1@example.com"
    assert "@" not in client.get("/mentors").text  # 학생용 목록에는 여전히 없음


def test_create_mentor(env, headers):
    body = {"id": "mt-11", "name": "새 멘토", "exit_year": 2022, "consent": True, "available": True,
            "email": "new@example.com", "tags": ["창업"]}
    res = client.post("/admin/mentors", json=body, headers=headers)
    assert res.status_code == 201 and res.json()["email"] == "new@example.com"
    assert "mt-11" in [m["id"] for m in client.get("/mentors").json()]  # 학생 목록에 바로 보임
    assert client.post("/admin/mentors", json=body, headers=headers).status_code == 409
    no_email = {**body, "id": "mt-12", "email": ""}
    res = client.post("/admin/mentors", json=no_email, headers=headers)
    assert res.status_code == 422 and "메일 주소" in res.json()["detail"]
    assert client.post("/admin/mentors", json={**body, "id": "MT 13"}, headers=headers).status_code == 422
    assert client.post("/admin/mentors", json={**body, "id": "mt-14", "email": "bad"},
                       headers=headers).status_code == 422


def test_update_mentor(env, headers):
    res = client.patch("/admin/mentors/mt-01", json={"name": "새 이름"}, headers=headers)
    assert res.status_code == 200 and res.json()["name"] == "새 이름"
    assert res.json()["email"] == "mentor1@example.com"  # 안 보낸 칸은 그대로
    assert client.patch("/admin/mentors/mt-01", json={"name": None}, headers=headers).status_code == 422  # 바꿀 것 없음
    res = client.patch("/admin/mentors/mt-02", json={"available": True}, headers=headers)
    assert res.status_code == 200  # mt-02 는 동의·메일 있음
    res = client.patch("/admin/mentors/mt-01", json={"email": ""}, headers=headers)  # 연락 가능인데 메일 지우기
    assert res.status_code == 422 and "메일 주소" in res.json()["detail"]
    res = client.patch("/admin/mentors/mt-01", json={"available": False, "email": None}, headers=headers)
    assert res.status_code == 200 and res.json()["email"] is None
    assert client.patch("/admin/mentors/mt-99", json={"name": "x"}, headers=headers).status_code == 404


# ---------------------------------------------------------------- 설정
def test_settings_read_and_update_apply_to_next_mail(env, headers):
    items = client.get("/admin/settings", headers=headers).json()
    assert len(items) == 16 and {"key", "value", "description"} <= items[0].keys()
    res = client.patch("/admin/settings", json={"values": {"mentorSubjectPrefix": "[새 문의]", "rateLimitPerDay": "7"}},
                       headers=headers)
    assert res.status_code == 200
    values = {item["key"]: item["value"] for item in res.json()}
    assert values["mentorSubjectPrefix"] == "[새 문의]" and values["rateLimitPerDay"] == "7"
    add_inquiries(env, 1)
    assert env["mail"].sent[0]["subject"].startswith("[새 문의]")


def test_settings_update_validation(env, headers):
    bad_key = client.patch("/admin/settings", json={"values": {"noSuchKey": "x"}}, headers=headers)
    assert bad_key.status_code == 422 and "noSuchKey" in bad_key.json()["detail"]
    bad_number = client.patch("/admin/settings", json={"values": {"reminderDays": "열흘"}}, headers=headers)
    assert bad_number.status_code == 422
    too_long = client.patch("/admin/settings", json={"values": {"mentorFooter": "가" * 1001}}, headers=headers)
    assert too_long.status_code == 422
    assert client.patch("/admin/settings", json={"values": {}}, headers=headers).status_code == 422
