"""
관리자 '인터뷰 넣기' API (/admin/imports/*) 테스트. 진짜 Supabase·Claude·OpenAI 는 부르지 않는다 (가짜를 끼운다).
"""

import copy
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.admin import imports as imports_api
from app.ingest import store as store_module
from app.ingest.analyzer import AnalyzeError
from app.ingest.draft import AiResult
from app.mail.store import StoreError
from app.main import app
from tests.test_ingest_logic import RAW, ai_result

client = TestClient(app)
PASSWORD = "test-admin-password-123"
NOW = datetime(2026, 11, 25, 12, 0, tzinfo=timezone.utc)


class FakeImportStore:
    def __init__(self):
        self.rows: dict[str, dict] = {}
        self.people = [{"id": "p-momo", "nickname": "모모", "path_summary": "DB 요약", "career_paths": ["gap_year"],
                        "career_fields": [], "organizations": []}]
        self.published: list[dict] = []
        self.publish_error: StoreError | None = None

    def insert_imports(self, rows):
        for row in rows:
            self.rows[row["id"]] = {**row, "draft": None, "summary": None, "error": None, "source_id": None,
                                    "created_at": NOW.isoformat(), "updated_at": NOW.isoformat(),
                                    "analyzed_at": None, "published_at": None}
        return [dict(self.rows[r["id"]]) for r in rows]

    def list_imports(self, offset, limit):
        rows = sorted(self.rows.values(), key=lambda r: r["id"], reverse=True)
        return [dict(r) for r in rows[offset:offset + limit]], len(rows)

    def get_import(self, import_id):
        row = self.rows.get(import_id)
        return copy.deepcopy(row) if row else None

    def update_import(self, import_id, values):
        if import_id not in self.rows:
            return None
        self.rows[import_id].update(copy.deepcopy(values))
        return dict(self.rows[import_id])

    def delete_import(self, import_id):
        self.rows.pop(import_id, None)

    def list_people(self):
        return [dict(p) for p in self.people]

    def publish(self, import_id, source, people, chunks):
        if self.publish_error:
            raise self.publish_error
        self.published.append({"source": source, "people": people, "chunks": chunks})
        self.rows[import_id].update({"status": "published", "raw_text": "", "source_id": source["id"]})
        return {"source_id": source["id"], "people": len(people), "chunks": len(chunks)}


class FakeAnalyzer:
    model = "fake-model"

    def __init__(self):
        self.result: AiResult | Exception = ai_result()
        self.calls = 0

    def analyze(self, filename, lines):
        self.calls += 1
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


class FakeEmbedder:
    def __init__(self):
        self.texts: list[str] = []

    def embed(self, texts):
        self.texts.extend(texts)
        return [[0.1, 0.2, 0.3] for _ in texts]


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setenv("ADMIN_PASSWORD", PASSWORD)
    store, analyzer, embedder = FakeImportStore(), FakeAnalyzer(), FakeEmbedder()
    monkeypatch.setattr(store_module, "get_store", lambda: store)
    monkeypatch.setattr(imports_api, "get_analyzer", lambda: analyzer)
    monkeypatch.setattr(imports_api, "get_embedder", lambda: (embedder, "fake-embedding"))
    monkeypatch.setattr(imports_api, "now", lambda: NOW)
    return {"store": store, "analyzer": analyzer, "embedder": embedder}


@pytest.fixture
def headers(env):
    token = client.post("/admin/login", json={"password": PASSWORD}).json()["token"]
    return {"Authorization": f"Bearer {token}"}


def upload(headers, *names):
    files = [{"filename": name, "text": RAW} for name in (names or ("interview.txt",))]
    res = client.post("/admin/imports", json={"files": files}, headers=headers)
    assert res.status_code == 201, res.text
    return [item["id"] for item in res.json()]


def confirmed_draft(headers, import_id):
    draft = client.get(f"/admin/imports/{import_id}", headers=headers).json()["draft"]
    draft["pii_checked"] = True
    for p in draft["people"]:
        p["confirmed"] = True
    for c in draft["chunks"]:
        c["confirmed"] = True
        c["topics"] = c["topics"] or ["choice_reason"]
    return draft


# ---------------------------------------------------------------- 로그인
def test_needs_login(env):
    assert client.get("/admin/imports").status_code == 401
    assert client.post("/admin/imports", json={"files": [{"filename": "a.txt", "text": "x"}]}).status_code == 401


# ---------------------------------------------------------------- 업로드 → 분석
def test_upload_runs_analysis_in_background(env, headers):
    ids = upload(headers, "a.txt", "b.txt")
    assert len(ids) == 2 and all(i.startswith("imp-20261125-") for i in ids)
    assert env["analyzer"].calls == 2  # TestClient 는 응답 뒤 백그라운드 작업을 바로 실행한다

    page = client.get("/admin/imports", headers=headers).json()
    assert page["total"] == 2
    item = page["items"][0]
    assert item["status"] == "review"
    assert item["summary"] == {"people": 2, "chunks": 3, "confirmed": 0, "pii": 1}
    assert "raw_text" not in item and "draft" not in item  # 목록에는 원문·초안이 없다

    detail = client.get(f"/admin/imports/{ids[0]}", headers=headers).json()
    assert detail["raw_text"].startswith("꾸로록 인터뷰")
    assert [c["speaker"] for c in detail["draft"]["chunks"]] == ["S2", "S3", "S2"]


def test_upload_rejects_empty_and_too_many(env, headers):
    res = client.post("/admin/imports", json={"files": [{"filename": "a.txt", "text": "\n\n  \n"}]}, headers=headers)
    assert res.status_code == 422
    files = [{"filename": f"{i}.txt", "text": "내용"} for i in range(21)]
    assert client.post("/admin/imports", json={"files": files}, headers=headers).status_code == 422


def test_upload_without_ai_key_is_503(env, headers, monkeypatch):
    monkeypatch.setattr(imports_api, "get_analyzer", _raise_not_configured)
    res = client.post("/admin/imports", json={"files": [{"filename": "a.txt", "text": RAW}]}, headers=headers)
    assert res.status_code == 503
    assert env["store"].rows == {}  # 분석할 수 없으면 저장하지도 않는다


def _raise_not_configured():
    raise store_module.ImportNotConfigured("빠진 환경변수: ANTHROPIC_API_KEY")


def test_analysis_failure_is_recorded_and_can_retry(env, headers):
    env["analyzer"].result = AnalyzeError("파일이 너무 길어 AI 결과가 잘렸어요. 파일을 둘로 나눠 올려 주세요.")
    [import_id] = upload(headers)
    item = client.get(f"/admin/imports/{import_id}", headers=headers).json()["item"]
    assert item["status"] == "failed" and "너무 길어" in item["error"]

    env["analyzer"].result = ai_result()
    res = client.post(f"/admin/imports/{import_id}/analyze", headers=headers)
    assert res.status_code == 200
    assert client.get(f"/admin/imports/{import_id}", headers=headers).json()["item"]["status"] == "review"


def test_reanalyze_blocked_while_fresh_analysis(env, headers):
    [import_id] = upload(headers)
    env["store"].rows[import_id].update({"status": "analyzing", "updated_at": NOW.isoformat()})
    assert client.post(f"/admin/imports/{import_id}/analyze", headers=headers).status_code == 409
    env["store"].rows[import_id]["updated_at"] = (NOW - timedelta(minutes=30)).isoformat()  # 서버가 재시작돼 멈춘 경우
    assert client.post(f"/admin/imports/{import_id}/analyze", headers=headers).status_code == 200


def test_unknown_or_malformed_id_is_404(env, headers):
    assert client.get("/admin/imports/imp-20261125-ffffff", headers=headers).status_code == 404
    assert client.get("/admin/imports/not-an-id", headers=headers).status_code == 404


# ---------------------------------------------------------------- 초안 저장
def test_save_draft(env, headers):
    [import_id] = upload(headers)
    draft = client.get(f"/admin/imports/{import_id}", headers=headers).json()["draft"]
    draft["chunks"][0]["content"] = "고친 내용"
    draft["chunks"][0]["confirmed"] = True
    res = client.put(f"/admin/imports/{import_id}/draft", json=draft, headers=headers)
    assert res.status_code == 200
    assert res.json()["item"]["summary"]["confirmed"] == 1
    assert env["store"].rows[import_id]["draft"]["chunks"][0]["content"] == "고친 내용"


def test_save_draft_rejects_unknown_speaker(env, headers):
    [import_id] = upload(headers)
    draft = client.get(f"/admin/imports/{import_id}", headers=headers).json()["draft"]
    draft["chunks"][0]["speaker"] = "S9"
    assert client.put(f"/admin/imports/{import_id}/draft", json=draft, headers=headers).status_code == 422


# ---------------------------------------------------------------- 공개
def test_publish_requires_review_done(env, headers):
    [import_id] = upload(headers)
    res = client.post(f"/admin/imports/{import_id}/publish", headers=headers)
    assert res.status_code == 422
    assert "개인정보" in res.json()["detail"]
    assert env["store"].published == []


def test_publish_success(env, headers):
    [import_id] = upload(headers)
    draft = confirmed_draft(headers, import_id)
    momo = next(p for p in draft["people"] if p["ref"] == "S3")
    momo.update({"link": "existing", "person_id": "p-momo"})
    assert client.put(f"/admin/imports/{import_id}/draft", json=draft, headers=headers).status_code == 200

    res = client.post(f"/admin/imports/{import_id}/publish", headers=headers)
    assert res.status_code == 200, res.text
    source_id = "up-" + import_id[len("imp-"):]
    assert res.json() == {"source_id": source_id, "people": 2, "chunks": 3}

    published = env["store"].published[0]
    assert published["source"]["site"] == "관리자 업로드"
    assert {"id": "p-momo", "is_new": False} in published["people"]
    chunk = published["chunks"][0]
    assert chunk["embedding"] == "[0.1,0.2,0.3]" and chunk["embedding_model"] == "fake-embedding"
    assert len(env["embedder"].texts) == 3

    detail = client.get(f"/admin/imports/{import_id}", headers=headers).json()
    assert detail["item"]["status"] == "published" and detail["raw_text"] == ""  # 원문은 지운다
    assert client.put(f"/admin/imports/{import_id}/draft", json=draft, headers=headers).status_code == 409


def test_publish_duplicate_person_id(env, headers):
    [import_id] = upload(headers)
    draft = confirmed_draft(headers, import_id)
    client.put(f"/admin/imports/{import_id}/draft", json=draft, headers=headers)
    env["store"].publish_error = StoreError("dup", "23505")
    res = client.post(f"/admin/imports/{import_id}/publish", headers=headers)
    assert res.status_code == 409
    assert "같은 ID" in res.json()["detail"]


def test_publish_embedding_failure_saves_nothing(env, headers, monkeypatch):
    [import_id] = upload(headers)
    client.put(f"/admin/imports/{import_id}/draft", json=confirmed_draft(headers, import_id), headers=headers)

    class Broken:
        def embed(self, texts):
            raise RuntimeError("network")

    monkeypatch.setattr(imports_api, "get_embedder", lambda: (Broken(), "x"))
    res = client.post(f"/admin/imports/{import_id}/publish", headers=headers)
    assert res.status_code == 502
    assert env["store"].published == [] and env["store"].rows[import_id]["status"] == "review"


# ---------------------------------------------------------------- 인물 목록·지우기
def test_people_list_has_no_real_name(env, headers):
    env["store"].people[0]["real_name"] = "실명"
    res = client.get("/admin/imports/people", headers=headers)
    assert res.status_code == 200
    assert res.json() == [{"id": "p-momo", "nickname": "모모", "path_summary": "DB 요약",
                           "career_paths": ["gap_year"], "career_fields": []}]


def test_delete(env, headers):
    [import_id] = upload(headers)
    assert client.delete(f"/admin/imports/{import_id}", headers=headers).status_code == 204
    assert client.get(f"/admin/imports/{import_id}", headers=headers).status_code == 404
