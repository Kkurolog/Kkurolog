"""
인터뷰 넣기: Supabase 읽기·쓰기 (REST API, httpx). 테이블: supabase/migrations/0004_imports.sql

- 키: SUPABASE_KEY = service_role(Secret) 키 (RAG·메일과 같은 값). 서버에서만 쓴다.
- 테스트는 이 클래스 대신 같은 메서드를 가진 가짜(tests/test_admin_imports.py 의 FakeImportStore)를 끼운다.
  get_store() 를 monkeypatch 하면 된다.
"""

from __future__ import annotations

import os
from typing import Any

import httpx

from app.mail.store import StoreError, base_rest_url

TIMEOUT_SECONDS = 30
LIST_COLUMNS = "id,filename,status,error,summary,source_id,created_at,updated_at,analyzed_at,published_at"


class ImportNotConfigured(Exception):
    """SUPABASE_URL / SUPABASE_KEY 가 없다."""


class SupabaseImportStore:
    def __init__(self, url: str, key: str, client: httpx.Client | None = None) -> None:
        self._base = base_rest_url(url)
        self._headers = {"apikey": key, "Authorization": f"Bearer {key}"}
        self._client = client or httpx.Client(timeout=TIMEOUT_SECONDS)

    def _request(self, method: str, path: str, *, params: Any = None, json: Any = None,
                 prefer: str | None = None, with_count: bool = False) -> Any:
        headers = dict(self._headers)
        if prefer:
            headers["Prefer"] = prefer
        try:
            response = self._client.request(method, f"{self._base}/{path}", params=params, json=json, headers=headers)
        except httpx.HTTPError as err:
            raise StoreError(f"Supabase 연결 실패: {type(err).__name__} ({method} {path})") from None
        if response.status_code >= 400:
            code = ""
            try:
                code = str(response.json().get("code", ""))
            except ValueError:
                pass
            raise StoreError(f"Supabase 오류 {response.status_code} {code} ({method} {path})", code)
        data = response.json() if response.content else None
        if with_count:
            total = response.headers.get("Content-Range", "*/0").rsplit("/", 1)[-1]
            return data or [], int(total) if total.isdigit() else len(data or [])
        return data

    # ---------------------------------------------------------------- import_files
    def insert_imports(self, rows: list[dict]) -> list[dict]:
        return self._request("POST", "import_files", json=rows, prefer="return=representation") or []

    def list_imports(self, offset: int, limit: int) -> tuple[list[dict], int]:
        return self._request(
            "GET", "import_files",
            params={"select": LIST_COLUMNS, "order": "created_at.desc,id.desc", "offset": str(offset), "limit": str(limit)},
            prefer="count=exact", with_count=True,
        )

    def get_import(self, import_id: str) -> dict | None:
        rows = self._request("GET", "import_files", params={"select": "*", "id": f"eq.{import_id}"}) or []
        return rows[0] if rows else None

    def update_import(self, import_id: str, values: dict) -> dict | None:
        rows = self._request("PATCH", "import_files", params={"id": f"eq.{import_id}"}, json=values,
                             prefer="return=representation") or []
        return rows[0] if rows else None

    def delete_import(self, import_id: str) -> None:
        self._request("DELETE", "import_files", params={"id": f"eq.{import_id}"})

    # ---------------------------------------------------------------- people (실명 칸은 읽지 않는다)
    def list_people(self) -> list[dict]:
        return self._request("GET", "people", params={
            "select": "id,nickname,path_summary,career_paths,career_fields,organizations", "order": "nickname"}) or []

    # ---------------------------------------------------------------- 공개 (한 트랜잭션)
    def publish(self, import_id: str, source: dict, people: list[dict], chunks: list[dict]) -> dict:
        return self._request("POST", "rpc/publish_import", json={
            "p_import_id": import_id, "p_source": source, "p_people": people, "p_chunks": chunks}) or {}


def get_store() -> SupabaseImportStore:
    url, key = os.getenv("SUPABASE_URL", "").strip(), os.getenv("SUPABASE_KEY", "").strip()
    missing = [name for name, value in (("SUPABASE_URL", url), ("SUPABASE_KEY", key)) if not value]
    if missing:
        raise ImportNotConfigured("빠진 환경변수: " + ", ".join(missing))
    return SupabaseImportStore(url, key)
