"""
Supabase 읽기·쓰기 (메일 기능 전용). Supabase 의 REST API(PostgREST)를 httpx 로 직접 부른다.

- 테이블: supabase/migrations/0002_mail_tables.sql (mentors, inquiries, mail_replies, mail_settings)
- 키: SUPABASE_KEY = service_role(Secret) 키. 서버에서만 쓴다. RLS 를 건너뛰므로 절대 프론트로 보내지 않는다.
- 테스트는 이 클래스 대신 같은 메서드를 가진 가짜(tests/test_mail_*.py 의 FakeStore)를 끼운다.
  get_store() 를 monkeypatch 하면 된다.

메서드 이름이 곧 이 기능이 DB 에 하는 일 전부다. 새 쿼리가 필요하면 여기에 메서드를 추가한다.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

import httpx

from app.mail.config import load_mail_config
from app.mail.timeutil import to_iso

TIMEOUT_SECONDS = 15


class StoreError(Exception):
    """Supabase 요청 실패 (연결 실패, 4xx·5xx). 메시지에 키·개인정보를 넣지 않는다.

    code: Postgres 오류 코드 (예: 23514 = 규칙(check) 위반, 23505 = 같은 id 가 이미 있음). 없으면 "".
    """

    def __init__(self, message: str, code: str = ""):
        super().__init__(message)
        self.code = code


class SupabaseMailStore:
    def __init__(self, url: str, key: str, client: httpx.Client | None = None) -> None:
        self._base = url.rstrip("/") + "/rest/v1"
        self._headers = {"apikey": key, "Authorization": f"Bearer {key}"}
        self._client = client or httpx.Client(timeout=TIMEOUT_SECONDS)

    # ------------------------------------------------------------------ 공통
    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str] | list[tuple[str, str]] | None = None,
        json: Any = None,
        prefer: str | None = None,
        with_count: bool = False,
    ) -> Any:
        headers = dict(self._headers)
        if prefer:
            headers["Prefer"] = prefer
        try:
            response = self._client.request(method, f"{self._base}/{path}", params=params, json=json, headers=headers)
        except httpx.HTTPError as err:
            raise StoreError(f"Supabase 연결 실패: {type(err).__name__} ({method} {path})") from None
        if response.status_code >= 400:
            # PostgREST 오류 본문에는 값이 섞일 수 있어 code 만 남긴다
            code = ""
            try:
                code = str(response.json().get("code", ""))
            except ValueError:
                pass
            raise StoreError(f"Supabase 오류 {response.status_code} {code} ({method} {path})", code)
        data = response.json() if response.content else None
        if with_count:
            # Prefer: count=exact 일 때 Content-Range: 0-19/57 → 전체 57건
            total = response.headers.get("Content-Range", "*/0").rsplit("/", 1)[-1]
            return data or [], int(total) if total.isdigit() else len(data or [])
        return data

    # ------------------------------------------------------------------ 멘토
    def list_mentors(self) -> list[dict]:
        """멘토 전체 (이메일 포함 = 서버 내부 전용)."""
        return self._request("GET", "mentors", params={"select": "*", "order": "id"}) or []

    # ------------------------------------------------------------------ 설정
    def get_settings(self) -> dict[str, str]:
        rows = self._request("GET", "mail_settings", params={"select": "key,value"}) or []
        return {row["key"]: row["value"] for row in rows}

    # ------------------------------------------------------------------ 문의
    def recent_inquiry_times(self, student_email: str, since: datetime) -> list[str]:
        """같은 학생 메일(소문자로 저장)로 since 이후에 보낸 문의의 보낸 일시들."""
        rows = self._request(
            "GET",
            "inquiries",
            params=[
                ("select", "created_at"),
                ("student_email", f"eq.{student_email}"),
                ("created_at", f"gte.{to_iso(since)}"),
            ],
        ) or []
        return [row["created_at"] for row in rows]

    def next_inquiry_id(self) -> str:
        """문의번호 (DB 함수 next_inquiry_id: 한국 날짜별 순번, 동시 요청 안전)."""
        result = self._request("POST", "rpc/next_inquiry_id", json={})
        if not isinstance(result, str):
            raise StoreError("next_inquiry_id 응답 형식이 이상함")
        return result

    def insert_inquiry(self, row: dict) -> dict:
        result = self._request("POST", "inquiries", json=row, prefer="return=representation")
        if not result:
            raise StoreError("문의 저장 결과가 비어 있음")
        return result[0]

    def delete_inquiry(self, inquiry_id: str) -> None:
        self._request("DELETE", "inquiries", params={"id": f"eq.{inquiry_id}"})

    def get_inquiry(self, inquiry_id: str) -> dict | None:
        rows = self._request("GET", "inquiries", params={"select": "*", "id": f"eq.{inquiry_id}"}) or []
        return rows[0] if rows else None

    def mark_replied(self, inquiry_id: str, replied_at: datetime) -> None:
        """첫 답장일 때만 기록 (이미 replied 면 그대로 = 첫 답장 시각 유지)."""
        self._request(
            "PATCH",
            "inquiries",
            params={"id": f"eq.{inquiry_id}", "replied": "is.false"},
            json={"replied": True, "replied_at": to_iso(replied_at)},
        )

    def due_reminders(self, created_before: datetime, limit: int) -> list[dict]:
        """답장 없음 + 리마인드 안 함 + created_before 보다 먼저 보낸 문의 (오래된 순)."""
        return self._request(
            "GET",
            "inquiries",
            params=[
                ("select", "*"),
                ("replied", "is.false"),
                ("reminded_at", "is.null"),
                ("created_at", f"lt.{to_iso(created_before)}"),
                ("order", "created_at"),
                ("limit", str(limit)),
            ],
        ) or []

    def mark_reminded(self, inquiry_id: str, reminded_at: datetime) -> None:
        self._request(
            "PATCH",
            "inquiries",
            params={"id": f"eq.{inquiry_id}", "reminded_at": "is.null"},
            json={"reminded_at": to_iso(reminded_at)},
        )

    # ------------------------------------------------------------------ 답장 기록
    def get_reply(self, message_id: str) -> dict | None:
        rows = self._request(
            "GET", "mail_replies", params={"select": "message_id,status", "message_id": f"eq.{message_id}"}
        ) or []
        return rows[0] if rows else None

    def insert_reply(self, row: dict) -> None:
        """같은 message_id 가 이미 있으면 무시한다 (같은 답장을 두 번 기록하지 않음)."""
        self._request(
            "POST",
            "mail_replies",
            params={"on_conflict": "message_id"},
            json=row,
            prefer="resolution=ignore-duplicates,return=minimal",
        )


    # ------------------------------------------------------------------ 관리자 (B-5)
    def list_inquiries(self, replied: bool | None, offset: int, limit: int) -> tuple[list[dict], int]:
        """문의 목록 (최신순) + 필터에 맞는 전체 건수. 멘토 이름을 함께 가져온다."""
        params = [
            ("select", "*,mentors(name)"),
            ("order", "created_at.desc,id.desc"),
            ("offset", str(offset)),
            ("limit", str(limit)),
        ]
        if replied is not None:
            params.append(("replied", f"is.{str(replied).lower()}"))
        return self._request("GET", "inquiries", params=params, prefer="count=exact", with_count=True)

    def get_inquiry_with_mentor(self, inquiry_id: str) -> dict | None:
        rows = self._request(
            "GET", "inquiries", params={"select": "*,mentors(name)", "id": f"eq.{inquiry_id}"}
        ) or []
        return rows[0] if rows else None

    def list_replies(self, inquiry_id: str) -> list[dict]:
        return self._request(
            "GET",
            "mail_replies",
            params={"select": "*", "inquiry_id": f"eq.{inquiry_id}", "order": "received_at"},
        ) or []

    def list_review_replies(self, offset: int, limit: int) -> tuple[list[dict], int]:
        """학생에게 전달하지 못해 사람이 봐야 하는 답장 (최신순) + 전체 건수."""
        return self._request(
            "GET",
            "mail_replies",
            params=[
                ("select", "*,inquiries(title,student_name,mentor_id)"),
                ("status", "in.(needs_review,failed)"),
                ("order", "received_at.desc"),
                ("offset", str(offset)),
                ("limit", str(limit)),
            ],
            prefer="count=exact",
            with_count=True,
        )

    def get_mentor(self, mentor_id: str) -> dict | None:
        rows = self._request("GET", "mentors", params={"select": "*", "id": f"eq.{mentor_id}"}) or []
        return rows[0] if rows else None

    def insert_mentor(self, row: dict) -> dict:
        result = self._request("POST", "mentors", json=row, prefer="return=representation")
        return result[0]

    def update_mentor(self, mentor_id: str, values: dict) -> dict | None:
        result = self._request(
            "PATCH", "mentors", params={"id": f"eq.{mentor_id}"}, json=values, prefer="return=representation"
        ) or []
        return result[0] if result else None

    def list_settings(self) -> list[dict]:
        return self._request("GET", "mail_settings", params={"select": "key,value,description", "order": "key"}) or []

    def upsert_settings(self, values: dict[str, str]) -> None:
        """설정 값만 바꾼다 (없는 키는 새로 만든다). description 은 건드리지 않는다."""
        self._request(
            "POST",
            "mail_settings",
            params={"on_conflict": "key", "columns": "key,value"},
            json=[{"key": key, "value": value} for key, value in values.items()],
            prefer="resolution=merge-duplicates,return=minimal",
        )

def get_store() -> SupabaseMailStore:
    """설정(환경변수)으로 store 를 만든다. 테스트는 이 함수를 가짜로 바꿔 끼운다."""
    config = load_mail_config()
    return SupabaseMailStore(config.supabase_url, config.supabase_key)
