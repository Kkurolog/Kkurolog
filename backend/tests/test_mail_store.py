"""
SupabaseMailStore 가 Supabase REST API(PostgREST)에 보내는 요청 모양 테스트.
진짜 Supabase 는 부르지 않는다. httpx.MockTransport 로 요청을 가로채 주소·필터·헤더를 확인한다.
"""

import json
from datetime import datetime
from urllib.parse import parse_qsl

import httpx
import pytest

from app.mail.store import StoreError, SupabaseMailStore
from app.mail.timeutil import KST

URL = "https://db.example.invalid"
KEY = "TEST_SERVICE_ROLE_KEY"


def make_store(responses):
    """responses: 요청 순서대로 돌려줄 (상태 코드, 본문). 받은 요청은 calls 에 쌓인다."""
    calls = []
    queue = list(responses)

    def handler(request: httpx.Request):
        calls.append(request)
        status, body = queue.pop(0)
        content = b"" if body is None else json.dumps(body).encode()
        return httpx.Response(status, content=content, headers={"Content-Type": "application/json"})

    store = SupabaseMailStore(URL, KEY, client=httpx.Client(transport=httpx.MockTransport(handler)))
    return store, calls


def query(request):
    return parse_qsl(request.url.query.decode())


def test_headers_and_list_mentors():
    store, calls = make_store([(200, [{"id": "mt-01"}])])
    assert store.list_mentors() == [{"id": "mt-01"}]
    req = calls[0]
    assert req.method == "GET" and req.url.path == "/rest/v1/mentors"
    assert ("order", "id") in query(req)
    assert req.headers["apikey"] == KEY and req.headers["Authorization"] == f"Bearer {KEY}"


def test_get_settings():
    store, _ = make_store([(200, [{"key": "senderName", "value": "꾸로록"}])])
    assert store.get_settings() == {"senderName": "꾸로록"}


def test_recent_inquiry_times_filters_email_and_time():
    store, calls = make_store([(200, [{"created_at": "2026-11-17T06:00:00+00:00"}])])
    since = datetime(2026, 11, 17, 0, 0, tzinfo=KST)
    assert store.recent_inquiry_times("student@example.org", since) == ["2026-11-17T06:00:00+00:00"]
    q = query(calls[0])
    assert ("student_email", "eq.student@example.org") in q
    assert ("created_at", "gte.2026-11-17T00:00:00+09:00") in q


def test_next_inquiry_id_calls_rpc():
    store, calls = make_store([(200, "q20261117-0001")])
    assert store.next_inquiry_id() == "q20261117-0001"
    assert calls[0].method == "POST" and calls[0].url.path == "/rest/v1/rpc/next_inquiry_id"


def test_insert_inquiry_returns_row():
    row = {"id": "q20261117-0001", "mentor_id": "mt-01"}
    store, calls = make_store([(201, [{**row, "created_at": "2026-11-17T06:00:00+00:00"}])])
    assert store.insert_inquiry(row)["created_at"]
    assert calls[0].headers["Prefer"] == "return=representation"
    assert json.loads(calls[0].content) == row


def test_mark_replied_only_when_not_replied():
    store, calls = make_store([(204, None)])
    store.mark_replied("q20261117-0001", datetime(2026, 11, 17, 15, 20, tzinfo=KST))
    req = calls[0]
    assert req.method == "PATCH"
    assert ("id", "eq.q20261117-0001") in query(req) and ("replied", "is.false") in query(req)
    assert json.loads(req.content) == {"replied": True, "replied_at": "2026-11-17T15:20:00+09:00"}


def test_due_reminders_filters():
    store, calls = make_store([(200, [])])
    store.due_reminders(datetime(2026, 11, 2, 0, 0, tzinfo=KST), 30)
    q = query(calls[0])
    for item in [("replied", "is.false"), ("reminded_at", "is.null"),
                 ("created_at", "lt.2026-11-02T00:00:00+09:00"), ("order", "created_at"), ("limit", "30")]:
        assert item in q


def test_mark_reminded_only_once():
    store, calls = make_store([(204, None)])
    store.mark_reminded("q20261117-0001", datetime(2026, 11, 27, 10, 0, tzinfo=KST))
    assert ("reminded_at", "is.null") in query(calls[0])


def test_insert_reply_ignores_duplicates():
    store, calls = make_store([(201, None)])
    store.insert_reply({"message_id": "msg-1"})
    req = calls[0]
    assert ("on_conflict", "message_id") in query(req)
    assert "resolution=ignore-duplicates" in req.headers["Prefer"]


def test_get_inquiry_and_reply_none_when_missing():
    store, _ = make_store([(200, []), (200, [])])
    assert store.get_inquiry("q20261117-0001") is None
    assert store.get_reply("msg-1") is None


def test_delete_inquiry():
    store, calls = make_store([(204, None)])
    store.delete_inquiry("q20261117-0001")
    assert calls[0].method == "DELETE" and ("id", "eq.q20261117-0001") in query(calls[0])


def test_error_does_not_leak_key_or_values():
    store, _ = make_store([(400, {"code": "23514", "message": "student@example.org violates check"})])
    with pytest.raises(StoreError) as info:
        store.insert_inquiry({"id": "x"})
    text = str(info.value)
    assert "23514" in text and KEY not in text and "student@example.org" not in text


def test_connection_error_becomes_store_error():
    def handler(request):
        raise httpx.ConnectError("boom")

    store = SupabaseMailStore(URL, KEY, client=httpx.Client(transport=httpx.MockTransport(handler)))
    with pytest.raises(StoreError):
        store.list_mentors()
