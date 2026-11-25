"""
관리자 '인터뷰 넣기' API (/admin/imports/*). 모든 주소에 관리자 로그인 표가 필요하다 (auth.require_admin).
흐름과 테이블: supabase/migrations/0004_imports.sql, 코드: app/ingest/

| 주소                                  | 하는 일                                                         |
| POST   /admin/imports                | txt 여러 개 올리기 → 파일마다 '분석 중'으로 저장, 뒤에서 AI 분석 시작        |
| GET    /admin/imports                | 올린 파일 목록 (최신순, 20개씩. 원문·초안 없이)                          |
| GET    /admin/imports/people         | '있는 인물에 연결'할 때 고르는 인물 목록 (실명 없음)                      |
| GET    /admin/imports/{id}           | 파일 하나: 원문 + 초안                                             |
| PUT    /admin/imports/{id}/draft     | 검토 화면에서 고친 초안 저장                                         |
| POST   /admin/imports/{id}/analyze   | AI 분석 다시 하기 (지금 초안은 버려진다)                               |
| POST   /admin/imports/{id}/publish   | 공개: 검사 → 임베딩 → sources·people·chunks 에 한 번에 넣기, 원문 지움     |
| DELETE /admin/imports/{id}           | 파일 지우기 (공개한 데이터는 그대로)                                    |

필요한 환경변수: SUPABASE_URL, SUPABASE_KEY (저장), ANTHROPIC_API_KEY (분석), OPENAI_API_KEY (공개할 때 임베딩).
원문·학생·졸업생 개인정보는 로그에 남기지 않는다.
"""

from __future__ import annotations

import logging
import os
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response

from app.admin.auth import require_admin
from app.ingest import store as store_module
from app.ingest import text as textlib
from app.ingest.analyzer import Analyzer, AnalyzeError, ClaudeAnalyzer
from app.ingest.draft import build_draft, build_rows, publish_problems
from app.ingest.models import (
    IMPORT_ID_PATTERN,
    ImportDetail,
    ImportDraft,
    ImportItem,
    ImportPage,
    PersonOption,
    PublishResult,
    UploadRequest,
)
from app.ingest.store import ImportNotConfigured
from app.mail.store import StoreError
from app.rag.config import RagSettings

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/admin/imports", tags=["admin-imports"], dependencies=[Depends(require_admin)])

KST = timezone(timedelta(hours=9))
STALE_ANALYSIS = timedelta(minutes=15)  # '분석 중'이 이보다 오래되면 서버가 재시작된 것으로 보고 다시 분석할 수 있게 한다
UNAVAILABLE = "데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."


# ---------------------------------------------------------------- 바꿔 끼울 수 있는 부분 (테스트는 가짜를 넣는다)
def get_analyzer() -> Analyzer:
    if not os.getenv("ANTHROPIC_API_KEY", "").strip():
        raise ImportNotConfigured("빠진 환경변수: ANTHROPIC_API_KEY")
    settings = RagSettings.from_env()
    try:
        return ClaudeAnalyzer(settings.import_model, timeout=settings.import_timeout_seconds)
    except ImportError:
        raise ImportNotConfigured("requirements-rag.txt 패키지(anthropic)가 설치되지 않았어요") from None


def get_embedder():
    if not os.getenv("OPENAI_API_KEY", "").strip():
        raise ImportNotConfigured("빠진 환경변수: OPENAI_API_KEY")
    settings = RagSettings.from_env()
    try:
        from app.rag.embedding import OpenAIEmbedder

        return OpenAIEmbedder(settings.embedding_model, timeout=60), settings.embedding_model
    except ImportError:
        raise ImportNotConfigured("requirements-rag.txt 패키지(openai)가 설치되지 않았어요") from None


def now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------- 공통
def _not_configured(err: ImportNotConfigured) -> HTTPException:
    logger.error("인터뷰 넣기: %s", err)
    return HTTPException(status_code=503, detail=f"인터뷰 넣기 기능 설정이 빠져 있어요. ({err})")


def _store():
    try:
        return store_module.get_store()
    except ImportNotConfigured as err:
        raise _not_configured(err) from None


def _store_error(err: StoreError) -> HTTPException:
    logger.error("인터뷰 넣기 Supabase 오류: %s", err)
    return HTTPException(status_code=502, detail=UNAVAILABLE)


def _item(row: dict) -> ImportItem:
    return ImportItem(**{k: row.get(k) for k in ImportItem.model_fields})


def _get_row(store, import_id: str) -> dict:
    if not re.fullmatch(IMPORT_ID_PATTERN, import_id):
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없어요.")
    try:
        row = store.get_import(import_id)
    except StoreError as err:
        raise _store_error(err) from None
    if not row:
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없어요.")
    return row


def _new_id(today: str) -> str:
    return f"imp-{today}-{secrets.token_hex(3)}"


def _iso(value: datetime) -> str:
    return value.isoformat()


# ---------------------------------------------------------------- 분석 (뒤에서 실행)
def run_analysis(import_ids: list[str]) -> None:
    """파일마다 AI 분석 → 초안 저장. 한 파일이 실패해도 다음 파일은 계속한다."""
    try:
        store = store_module.get_store()
        analyzer = get_analyzer()
    except ImportNotConfigured as err:
        logger.error("인터뷰 분석을 시작하지 못함: %s", err)
        return
    for import_id in import_ids:
        try:
            row = store.get_import(import_id)
            if not row or row.get("status") != "analyzing":
                continue
            lines = textlib.lines_of(row.get("raw_text") or "")
            ai = analyzer.analyze(row["filename"], lines)
            draft = build_draft(lines, ai, filename=row["filename"], id_suffix=import_id[len("imp-"):], model=analyzer.model)
            store.update_import(import_id, {
                "status": "review", "draft": draft.model_dump(mode="json"), "summary": draft.summary(),
                "error": None, "analyzed_at": _iso(now()), "updated_at": _iso(now()),
            })
        except AnalyzeError as err:
            _mark_failed(store, import_id, str(err))
        except StoreError as err:
            logger.error("인터뷰 분석 저장 실패 (%s): %s", import_id, err)
        except Exception as err:  # 예상 못 한 오류도 '분석 중'에 멈춰 있지 않게
            logger.error("인터뷰 분석 실패 (%s): %s", import_id, type(err).__name__)
            _mark_failed(store, import_id, "분석하다 문제가 생겼어요. '다시 분석'을 눌러 주세요.")


def _mark_failed(store, import_id: str, message: str) -> None:
    try:
        store.update_import(import_id, {"status": "failed", "error": message, "updated_at": _iso(now())})
    except StoreError as err:
        logger.error("인터뷰 분석 실패 기록 못 함 (%s): %s", import_id, err)


# ---------------------------------------------------------------- API
@router.post("", response_model=list[ImportItem], status_code=201)
def upload(body: UploadRequest, background: BackgroundTasks) -> list[ImportItem]:
    store = _store()
    try:
        get_analyzer()  # 분석할 수 없는 상태면 저장하기 전에 알린다
    except ImportNotConfigured as err:
        raise _not_configured(err) from None

    today = now().astimezone(KST).strftime("%Y%m%d")
    rows = []
    for f in body.files:
        raw = textlib.normalize(f.text)
        if not raw.strip():
            raise HTTPException(status_code=422, detail=f"{f.filename}: 내용이 비어 있어요.")
        rows.append({"id": _new_id(today), "filename": f.filename.strip()[:200], "status": "analyzing", "raw_text": raw})
    try:
        saved = store.insert_imports(rows)
    except StoreError as err:
        raise _store_error(err) from None
    background.add_task(run_analysis, [r["id"] for r in rows])
    return [_item(r) for r in saved]


@router.get("", response_model=ImportPage)
def list_imports(page: int = Query(default=1, ge=1), page_size: int = Query(default=20, ge=1, le=100)) -> ImportPage:
    store = _store()
    try:
        rows, total = store.list_imports((page - 1) * page_size, page_size)
    except StoreError as err:
        raise _store_error(err) from None
    return ImportPage(total=total, page=page, page_size=page_size, items=[_item(r) for r in rows])


@router.get("/people", response_model=list[PersonOption])
def people() -> list[PersonOption]:
    store = _store()
    try:
        return [PersonOption(id=r["id"], nickname=r.get("nickname") or "", path_summary=r.get("path_summary"),
                             career_paths=r.get("career_paths") or [], career_fields=r.get("career_fields") or [])
                for r in store.list_people()]
    except StoreError as err:
        raise _store_error(err) from None


@router.get("/{import_id}", response_model=ImportDetail)
def detail(import_id: str) -> ImportDetail:
    row = _get_row(_store(), import_id)
    draft = ImportDraft.model_validate(row["draft"]) if row.get("draft") else None
    return ImportDetail(item=_item(row), raw_text=row.get("raw_text") or "", draft=draft)


@router.put("/{import_id}/draft", response_model=ImportDetail)
def save_draft(import_id: str, body: ImportDraft) -> ImportDetail:
    store = _store()
    row = _get_row(store, import_id)
    if row["status"] != "review":
        raise HTTPException(status_code=409, detail="검토 중인 파일만 고칠 수 있어요.")
    refs = [p.ref for p in body.people]
    keys = [c.key for c in body.chunks]
    if len(set(refs)) != len(refs) or len(set(keys)) != len(keys):
        raise HTTPException(status_code=422, detail="사람이나 조각 이름표가 겹쳐요. 새로고침한 뒤 다시 고쳐 주세요.")
    if any(c.speaker not in refs for c in body.chunks):
        raise HTTPException(status_code=422, detail="말한 사람이 없는 조각이 있어요.")
    try:
        saved = store.update_import(import_id, {
            "draft": body.model_dump(mode="json"), "summary": body.summary(), "updated_at": _iso(now())})
    except StoreError as err:
        raise _store_error(err) from None
    return ImportDetail(item=_item(saved or row), raw_text=row.get("raw_text") or "", draft=body)


@router.post("/{import_id}/analyze", response_model=ImportItem)
def reanalyze(import_id: str, background: BackgroundTasks) -> ImportItem:
    store = _store()
    row = _get_row(store, import_id)
    status = row["status"]
    if status == "published":
        raise HTTPException(status_code=409, detail="이미 공개한 파일이에요.")
    if status == "analyzing":
        started = datetime.fromisoformat(str(row["updated_at"]).replace("Z", "+00:00"))
        if now() - started < STALE_ANALYSIS:
            raise HTTPException(status_code=409, detail="아직 분석 중이에요. 잠시 기다려 주세요.")
    try:
        get_analyzer()
    except ImportNotConfigured as err:
        raise _not_configured(err) from None
    try:
        saved = store.update_import(import_id, {"status": "analyzing", "draft": None, "summary": None, "error": None,
                                                "updated_at": _iso(now())})
    except StoreError as err:
        raise _store_error(err) from None
    background.add_task(run_analysis, [import_id])
    return _item(saved or {**row, "status": "analyzing"})


@router.post("/{import_id}/publish", response_model=PublishResult)
def publish(import_id: str) -> PublishResult:
    store = _store()
    row = _get_row(store, import_id)
    if row["status"] != "review" or not row.get("draft"):
        raise HTTPException(status_code=409, detail="검토 중인 파일만 공개할 수 있어요.")
    draft = ImportDraft.model_validate(row["draft"])
    try:
        existing = {p["id"]: p for p in store.list_people()}
    except StoreError as err:
        raise _store_error(err) from None
    problems = publish_problems(draft, set(existing))
    if problems:
        more = f" (남은 할 일 {len(problems)}개)" if len(problems) > 1 else ""
        raise HTTPException(status_code=422, detail=problems[0] + more)

    source_id = "up-" + import_id[len("imp-"):]
    source, people_rows, chunk_rows = build_rows(source_id, draft, existing)
    try:
        embedder, model = get_embedder()
        vectors = embedder.embed([c["embed_text"] for c in chunk_rows])
    except ImportNotConfigured as err:
        raise _not_configured(err) from None
    except Exception as err:
        logger.error("인터뷰 공개: 임베딩 실패 %s", type(err).__name__)
        raise HTTPException(status_code=502, detail="임베딩을 만들지 못했어요. 아무것도 저장되지 않았어요. 잠시 후 다시 공개해 주세요.") from None
    if len(vectors) != len(chunk_rows):
        raise HTTPException(status_code=502, detail="임베딩 개수가 맞지 않아요. 다시 공개해 주세요.")
    for chunk, vector in zip(chunk_rows, vectors):
        chunk["embedding"] = "[" + ",".join(repr(float(x)) for x in vector) + "]"
        chunk["embedding_model"] = model

    try:
        result = store.publish(import_id, source, people_rows, chunk_rows)
    except StoreError as err:
        if err.code == "23505":
            raise HTTPException(status_code=409, detail="같은 ID가 이미 있어요. 인물 ID를 바꾸거나 '있는 인물에 연결'을 골라 주세요.") from None
        if err.code == "KK001":
            raise HTTPException(status_code=409, detail="이미 공개했거나 분석 중인 파일이에요. 새로고침해 주세요.") from None
        if err.code == "KK002":
            raise HTTPException(status_code=409, detail="연결할 인물을 찾을 수 없어요. 인물을 다시 골라 주세요.") from None
        raise _store_error(err) from None
    return PublishResult(source_id=result.get("source_id", source_id), people=result.get("people", len(people_rows)),
                         chunks=result.get("chunks", len(chunk_rows)))


@router.delete("/{import_id}", status_code=204)
def delete(import_id: str) -> Response:
    store = _store()
    row = _get_row(store, import_id)
    try:
        store.delete_import(row["id"])
    except StoreError as err:
        raise _store_error(err) from None
    return Response(status_code=204)
