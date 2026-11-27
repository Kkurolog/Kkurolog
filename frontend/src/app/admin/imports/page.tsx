// 인터뷰 넣기: 올리기 + 파일 목록 (주소 "/admin/imports")
// txt 여러 개를 끌어다 놓거나 골라서 한 번에 올린다 → 파일마다 AI 가 뒤에서 분석한다 (분석 중 → 검토 필요).
// '검토'를 누르면 파일별 검토 화면(/admin/imports/[id])에서 사람·조각·태그·개인정보를 확인하고 공개한다.
// 분석 중인 파일이 있으면 몇 초마다 목록을 다시 받는다.
"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { UploadIcon } from "@/components/icons";
import { AdminPage, ErrorNotice, PageTitle, Pagination, tableWrap, td, th } from "@/components/admin/ui";
import { ImportStatusPill } from "@/components/admin/ImportReview";
import {
  AdminApiError,
  deleteImport,
  fetchImports,
  formatDateTime,
  MAX_IMPORT_CHARS,
  MAX_IMPORT_FILES,
  PAGE_SIZE,
  reanalyzeImport,
  uploadImports,
  type ImportItem,
  type Paged,
} from "@/lib/adminApi";
import { readTextFile } from "@/lib/importChecks";

const POLL_MS = 4000;

export default function ImportsPage() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<ImportItem> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [toDelete, setToDelete] = useState<ImportItem | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    fetchImports({ page })
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(err instanceof AdminApiError ? err.message : "목록을 불러오지 못했어요."));
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  // 분석 중인 파일이 있으면 몇 초마다 다시 확인
  const analyzing = data?.items.some((i) => i.status === "analyzing");
  useEffect(() => {
    if (!analyzing) return;
    const timer = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(timer);
  }, [analyzing, load]);

  async function handleFiles(list: FileList | File[]) {
    const files = Array.from(list).filter((f) => f.name.toLowerCase().endsWith(".txt"));
    const skipped = Array.from(list).length - files.length;
    if (files.length === 0) {
      setMessage({ text: "txt 파일만 올릴 수 있어요.", error: true });
      return;
    }
    if (files.length > MAX_IMPORT_FILES) {
      setMessage({ text: `한 번에 ${MAX_IMPORT_FILES}개까지 올릴 수 있어요. 나눠서 올려 주세요.`, error: true });
      return;
    }
    setUploading(true);
    setMessage(null);
    try {
      const texts = await Promise.all(files.map(async (f) => ({ filename: f.name, text: await readTextFile(f) })));
      const tooLong = texts.find((t) => t.text.length > MAX_IMPORT_CHARS);
      if (tooLong) throw new AdminApiError(422, `${tooLong.filename}: ${MAX_IMPORT_CHARS.toLocaleString()}자를 넘어요. 파일을 나눠 올려 주세요.`);
      const empty = texts.find((t) => !t.text.trim());
      if (empty) throw new AdminApiError(422, `${empty.filename}: 내용이 비어 있어요.`);
      const saved = await uploadImports(texts);
      setMessage({
        text: `${saved.length}개 파일을 올렸어요. AI가 분석하는 중이에요 (파일마다 1분 안팎).${skipped ? ` txt가 아닌 파일 ${skipped}개는 뺐어요.` : ""}`,
        error: false,
      });
      setPage(1);
      load();
    } catch (err) {
      setMessage({ text: err instanceof AdminApiError ? err.message : "파일을 올리지 못했어요.", error: true });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleReanalyze(item: ImportItem) {
    try {
      await reanalyzeImport(item.id);
      load();
    } catch (err) {
      setMessage({ text: err instanceof AdminApiError ? err.message : "다시 분석하지 못했어요.", error: true });
    }
  }

  async function handleDelete() {
    if (!toDelete) return;
    const item = toDelete;
    setToDelete(null);
    try {
      await deleteImport(item.id);
      load();
    } catch (err) {
      setMessage({ text: err instanceof AdminApiError ? err.message : "지우지 못했어요.", error: true });
    }
  }

  return (
    <AdminPage>
      <PageTitle>인터뷰 넣기</PageTitle>

      {/* 올리기 (PC 한 화면에 목록 10줄까지 들어가게 한 줄 높이로) */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!uploading) handleFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center gap-3 rounded-[20px] border-2 border-dashed px-6 py-3 text-center transition-colors sm:flex-row sm:text-left ${
          dragging ? "border-brand bg-sky" : "border-line bg-surface"
        }`}
      >
        <UploadIcon className="size-7 shrink-0 text-brand" />
        <div className="flex flex-1 flex-col gap-0.5">
          <p className="text-[14px] text-ink">
            <span className="font-bold">졸업생 인터뷰·에세이 txt를 여기에 끌어다 놓으세요.</span>{" "}
            <span className="text-body">AI가 사람·조각·태그·개인정보 의심 부분 초안을 만들고, 검토·공개해야 학생 답변에 쓰여요.</span>
          </p>
          <p className="text-[12px] text-muted">
            한 번에 {MAX_IMPORT_FILES}개까지, 파일 하나에 {MAX_IMPORT_CHARS.toLocaleString()}자까지. 한 파일에 여러 명의 인터뷰가 섞여 있어도 괜찮아요.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".txt,text/plain"
          multiple
          className="sr-only"
          id="import-files"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
          disabled={uploading}
        />
        <label
          htmlFor="import-files"
          className={`inline-flex h-11 shrink-0 cursor-pointer items-center rounded-full px-6 text-[14px] font-bold text-white ${
            uploading ? "pointer-events-none bg-line text-muted" : "bg-brand hover:bg-brand-dark"
          }`}
        >
          {uploading ? "올리는 중…" : "파일 고르기"}
        </label>
      </div>
      {message && (
        <p role={message.error ? "alert" : "status"} className={`mt-3 text-[13px] ${message.error ? "text-danger" : "text-body"}`}>
          {message.text}
        </p>
      )}

      {/* 올린 파일 목록 */}
      <h2 className="sr-only">올린 파일</h2>
      {error ? (
        <div className="mt-6">
          <ErrorNotice message={error} />
        </div>
      ) : (
        <div className={`mt-5 ${tableWrap}`}>
          <table className="w-full min-w-[760px] table-fixed">
            <colgroup>
              <col />
              <col className="w-[140px]" />
              <col className="w-[110px]" />
              <col className="w-[150px]" />
              <col className="w-[190px]" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className={th}>파일</th>
                <th scope="col" className={th}>올린 시각</th>
                <th scope="col" className={th}>상태</th>
                <th scope="col" className={th}>사람 · 조각(확인)</th>
                <th scope="col" className={th}>
                  <span className="sr-only">동작</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {!data && (
                <tr className="border-t border-line">
                  <td colSpan={5} className={`${td} text-center text-muted`}>불러오는 중…</td>
                </tr>
              )}
              {data?.items.length === 0 && (
                <tr className="border-t border-line">
                  <td colSpan={5} className={`${td} text-center text-muted`}>아직 올린 파일이 없어요.</td>
                </tr>
              )}
              {data?.items.map((item) => (
                <tr key={item.id} className="border-t border-line align-middle">
                  <td className={`${td} truncate`} title={item.filename}>
                    <span className="font-medium">{item.filename}</span>
                    {item.status === "failed" && item.error && <span className="block truncate text-[12px] text-danger">{item.error}</span>}
                  </td>
                  <td className={`${td} text-body`}>{formatDateTime(item.created_at)}</td>
                  <td className={td}>
                    <ImportStatusPill status={item.status} />
                  </td>
                  <td className={`${td} text-body`}>
                    {item.summary ? `${item.summary.people}명 · ${item.summary.chunks}개 (${item.summary.confirmed})` : "—"}
                  </td>
                  <td className={`${td} text-right whitespace-nowrap`}>
                    {(item.status === "review" || item.status === "published") && (
                      <Link
                        href={`/admin/imports/${item.id}`}
                        className="inline-flex h-8 items-center rounded-full border border-brand px-4 text-[12px] font-bold text-brand hover:bg-sky"
                      >
                        {item.status === "review" ? "검토" : "보기"}
                      </Link>
                    )}
                    {item.status === "failed" && (
                      <button
                        type="button"
                        onClick={() => handleReanalyze(item)}
                        className="h-8 rounded-full border border-brand px-4 text-[12px] font-bold text-brand hover:bg-sky"
                      >
                        다시 분석
                      </button>
                    )}
                    {item.status !== "analyzing" && (
                      <button
                        type="button"
                        onClick={() => setToDelete(item)}
                        aria-label={`${item.filename} 지우기`}
                        className="ml-2 h-8 rounded-full px-3 text-[12px] text-muted hover:bg-sky hover:text-danger-dark"
                      >
                        지우기
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={page} total={data.total} pageSize={PAGE_SIZE} onChange={setPage} />}

      {toDelete && (
        <ConfirmDialog
          title="이 파일을 지울까요?"
          body={
            toDelete.status === "published"
              ? "목록에서만 지워져요. 이미 공개한 조각은 그대로 학생 답변에 쓰여요."
              : "올린 원문과 검토하던 내용이 모두 지워져요."
          }
          detail={toDelete.filename}
          tone="danger"
          warning={toDelete.status === "published" ? undefined : "지운 파일은 다시 볼 수 없어요."}
          cancelLabel="취소"
          confirmLabel="지우기"
          onCancel={() => setToDelete(null)}
          onConfirm={handleDelete}
        />
      )}
    </AdminPage>
  );
}
