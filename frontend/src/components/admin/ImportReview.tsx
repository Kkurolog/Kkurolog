// 인터뷰 넣기: 파일 하나 검토 화면 (/admin/imports/[id])
// 왼쪽: 원문 (줄 번호, 개인정보 의심 줄은 노란색, 고른 조각의 줄은 하늘색)
// 오른쪽: 남은 할 일 → 글 정보 → 개인정보 확인 → 사람 → 조각
// AI 가 만든 값은 초안이다. 'AI 추천' 표시가 붙은 태그도 관리자가 확인해야 공개할 수 있다.
// 저장 버튼으로 초안을 저장하고, 공개 버튼은 저장한 뒤 backend 에서 한 번 더 검사하고 sources·people·chunks 에 넣는다.
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConfirmDialog from "../ConfirmDialog";
import { ErrorNotice } from "./ui";
import {
  AdminApiError,
  fetchImport,
  fetchImportPeople,
  formatDateTime,
  publishImport,
  reanalyzeImport,
  saveImportDraft,
  type DraftChunk,
  type DraftPerson,
  type ImportDetail,
  type ImportDraft,
  type ImportStatus,
  type PersonOption,
  type PersonRole,
} from "@/lib/adminApi";
import { alumniRefs, importProblems, joinList, MAX_TOPICS, personName, splitList } from "@/lib/importChecks";
import { FIELD_TAGS, PATH_TAGS, TOPIC_TAGS } from "@/lib/tags";

const POLL_MS = 4000;

const STATUS_LABEL: Record<ImportStatus, string> = {
  analyzing: "분석 중",
  review: "검토 필요",
  published: "공개됨",
  failed: "분석 실패",
};

export function ImportStatusPill({ status }: { status: ImportStatus }) {
  const style = {
    analyzing: "border-line bg-sky text-body",
    review: "border-brand bg-surface text-brand",
    published: "border-brand bg-brand text-white",
    failed: "border-danger/50 bg-surface text-danger",
  }[status];
  return (
    <span className={`inline-flex h-6 items-center gap-1 rounded-full border px-3 text-[12px] font-bold whitespace-nowrap ${style}`}>
      {status === "analyzing" && <span className="size-1.5 rounded-full bg-brand motion-safe:animate-dot" aria-hidden="true" />}
      {STATUS_LABEL[status]}
    </span>
  );
}

const ROLE_LABEL: Record<PersonRole, string> = { alumni: "졸업생", interviewer: "인터뷰어", other: "그 밖의 사람" };
const PII_KIND: Record<string, string> = { name: "이름", school: "학교", phone: "전화번호", email: "메일", address: "주소", other: "기타" };

const inputCls =
  "h-10 w-full min-w-0 rounded-xl border border-line bg-surface px-3 text-[13px] text-ink placeholder:text-placeholder focus:border-brand focus:outline-none disabled:bg-canvas disabled:text-muted";
const areaCls =
  "w-full min-w-0 resize-y rounded-xl border border-line bg-surface px-3 py-2 text-[13px] leading-6 text-ink placeholder:text-placeholder focus:border-brand focus:outline-none disabled:bg-canvas disabled:text-muted";
const smallBtn = "h-8 rounded-full border border-line bg-surface px-3 text-[12px] text-body hover:border-brand hover:text-brand disabled:opacity-50";

export default function ImportReview({ id }: { id: string }) {
  const [detail, setDetail] = useState<ImportDetail | null>(null);
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [people, setPeople] = useState<PersonOption[] | null>(null);
  const [busy, setBusy] = useState<"save" | "publish" | "analyze" | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [confirm, setConfirm] = useState<"publish" | "analyze" | null>(null);
  const [activeChunk, setActiveChunk] = useState<string | null>(null);
  const rawRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    fetchImport(id)
      .then((d) => {
        setDetail(d);
        setDraft(d.draft);
        setDirty(false);
        setLoadError(null);
      })
      .catch((err) => setLoadError(err instanceof AdminApiError ? err.message : "파일을 불러오지 못했어요."));
  }, [id]);

  useEffect(() => {
    load();
    fetchImportPeople()
      .then(setPeople)
      .catch(() => setPeople([]));
  }, [load]);

  // 분석 중이면 몇 초마다 다시 확인
  const status = detail?.item.status;
  useEffect(() => {
    if (status !== "analyzing") return;
    const timer = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(timer);
  }, [status, load]);

  // 저장하지 않고 나가려 하면 브라우저가 한 번 묻는다
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const existingIds = useMemo(() => new Set((people ?? []).map((p) => p.id)), [people]);
  const problems = useMemo(() => (draft ? importProblems(draft, existingIds) : []), [draft, existingIds]);
  const lines = useMemo(() => (detail?.raw_text ? detail.raw_text.split("\n") : []), [detail]);
  const piiLines = useMemo(() => new Set(draft?.pii.map((f) => f.line) ?? []), [draft]);
  const activeRange = draft?.chunks.find((c) => c.key === activeChunk)?.lines;

  // ---- 초안 고치기
  function change(update: (d: ImportDraft) => ImportDraft) {
    setDraft((d) => (d ? update(d) : d));
    setDirty(true);
    setMessage(null);
  }
  const updatePerson = (ref: string, patch: Partial<DraftPerson>) =>
    change((d) => ({ ...d, people: d.people.map((p) => (p.ref === ref ? { ...p, ...patch } : p)) }));
  const updateChunk = (key: string, patch: Partial<DraftChunk>) =>
    change((d) => ({ ...d, chunks: d.chunks.map((c) => (c.key === key ? { ...c, ...patch } : c)) }));

  function removeChunk(key: string) {
    change((d) => ({ ...d, chunks: d.chunks.filter((c) => c.key !== key) }));
  }

  // 바로 위 조각과 합치기 (AI 가 한 답변을 둘로 잘못 나눴을 때)
  function mergeWithPrevious(key: string) {
    change((d) => {
      const i = d.chunks.findIndex((c) => c.key === key);
      if (i <= 0) return d;
      const prev = d.chunks[i - 1];
      const cur = d.chunks[i];
      const merged: DraftChunk = {
        ...prev,
        content: `${prev.content}\n\n${cur.content}`.trim(),
        question: prev.question || cur.question,
        lines:
          prev.lines.length === 2 && cur.lines.length === 2
            ? [Math.min(prev.lines[0], cur.lines[0]), Math.max(prev.lines[1], cur.lines[1])]
            : prev.lines.length === 2
              ? prev.lines
              : cur.lines,
        topics: Array.from(new Set([...prev.topics, ...cur.topics])).slice(0, MAX_TOPICS),
        confirmed: false,
      };
      return { ...d, chunks: [...d.chunks.slice(0, i - 1), merged, ...d.chunks.slice(i + 1)] };
    });
  }

  // AI 가 놓친 부분을 직접 넣을 때
  function addChunk() {
    change((d) => {
      const used = new Set(d.chunks.map((c) => c.key));
      let n = d.chunks.length + 1;
      while (used.has(`c${String(n).padStart(2, "0")}`)) n += 1;
      const speaker = d.people.find((p) => p.role === "alumni")?.ref ?? d.people[0]?.ref ?? "";
      const chunk: DraftChunk = {
        key: `c${String(n).padStart(2, "0")}`,
        speaker,
        question: "",
        content: "",
        lines: [],
        topics: [],
        topic_detail: [],
        ai_topics: [],
        confirmed: false,
      };
      return { ...d, chunks: [...d.chunks, chunk] };
    });
  }

  function confirmAllChunks() {
    change((d) => {
      const refs = alumniRefs(d);
      return { ...d, chunks: d.chunks.map((c) => (refs.has(c.speaker) && c.topics.length > 0 ? { ...c, confirmed: true } : c)) };
    });
  }

  function scrollToLine(line: number) {
    const el = rawRef.current?.querySelector(`[data-line="${line}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  // ---- 저장·공개·다시 분석
  async function save(): Promise<boolean> {
    if (!draft) return false;
    setBusy("save");
    try {
      const saved = await saveImportDraft(id, draft);
      setDetail(saved);
      setDirty(false);
      setMessage({ text: "저장했어요.", error: false });
      return true;
    } catch (err) {
      setMessage({ text: err instanceof AdminApiError ? err.message : "저장하지 못했어요.", error: true });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    setConfirm(null);
    if (dirty && !(await save())) return;
    setBusy("publish");
    try {
      const result = await publishImport(id);
      setMessage({ text: `공개했어요. 조각 ${result.chunks}개가 이제 학생 답변에 쓰여요. (글 번호 ${result.source_id})`, error: false });
      load();
    } catch (err) {
      setMessage({ text: err instanceof AdminApiError ? err.message : "공개하지 못했어요.", error: true });
    } finally {
      setBusy(null);
    }
  }

  async function reanalyze() {
    setConfirm(null);
    setBusy("analyze");
    try {
      await reanalyzeImport(id);
      setMessage(null);
      load();
    } catch (err) {
      setMessage({ text: err instanceof AdminApiError ? err.message : "다시 분석하지 못했어요.", error: true });
    } finally {
      setBusy(null);
    }
  }

  if (loadError) {
    return (
      <Shell filename={id}>
        <ErrorNotice message={loadError} />
      </Shell>
    );
  }
  if (!detail) {
    return (
      <Shell filename="">
        <p className="text-[14px] text-muted">불러오는 중…</p>
      </Shell>
    );
  }

  const { item } = detail;
  const published = item.status === "published";
  const refs = draft ? alumniRefs(draft) : new Set<string>();
  const alumniChunks = draft?.chunks.filter((c) => refs.has(c.speaker)) ?? [];

  return (
    <Shell
      filename={item.filename}
      status={item.status}
      actions={
        <>
          {(item.status === "review" || item.status === "failed") && (
            <button type="button" onClick={() => (item.status === "failed" ? reanalyze() : setConfirm("analyze"))} disabled={busy !== null} className={smallBtn}>
              {busy === "analyze" ? "요청하는 중…" : "다시 분석"}
            </button>
          )}
          {item.status === "review" && (
            <>
              <button
                type="button"
                onClick={save}
                disabled={!dirty || busy !== null}
                className="h-10 rounded-full border border-brand bg-surface px-5 text-[13px] font-bold text-brand hover:bg-sky disabled:border-line disabled:text-muted disabled:hover:bg-surface"
              >
                {busy === "save" ? "저장하는 중…" : dirty ? "저장" : "저장됨"}
              </button>
              <button
                type="button"
                onClick={() => setConfirm("publish")}
                disabled={problems.length > 0 || busy !== null}
                title={problems.length > 0 ? "남은 할 일을 먼저 끝내 주세요" : undefined}
                className="h-10 rounded-full bg-brand px-6 text-[13px] font-bold text-white hover:bg-brand-dark disabled:bg-line disabled:text-muted"
              >
                {busy === "publish" ? "공개하는 중…" : "공개"}
              </button>
            </>
          )}
        </>
      }
    >
      {message && (
        <p role={message.error ? "alert" : "status"} className={`mb-4 rounded-2xl px-4 py-3 text-[13px] ${message.error ? "border border-danger/40 bg-surface text-danger" : "bg-sky text-ink"}`}>
          {message.text}
        </p>
      )}

      {item.status === "analyzing" && (
        <div className="rounded-2xl bg-sky px-5 py-6 text-[14px] text-ink">
          AI가 이 파일을 분석하고 있어요. 보통 1분 안팎 걸려요. 이 화면은 끝나면 저절로 바뀌어요.
        </div>
      )}
      {item.status === "failed" && <ErrorNotice message={item.error ?? "분석하지 못했어요. '다시 분석'을 눌러 주세요."} />}
      {published && (
        <div className="mb-6 rounded-2xl bg-sky px-5 py-4 text-[13px] leading-6 text-ink">
          {formatDateTime(item.published_at)}에 공개했어요 (글 번호 <b>{item.source_id}</b>). 올린 원문은 지웠고, 아래는 공개한 내용이에요. 공개한 조각을 고치려면 Supabase에서 직접 고쳐야 해요.
        </div>
      )}

      {draft && (
        <div className={`grid gap-6 ${published ? "" : "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"}`}>
          {/* 왼쪽: 원문 */}
          {!published && (
            <section aria-label="원문" className="lg:sticky lg:top-6 lg:self-start">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-[14px] font-bold text-ink">원문</h2>
                <span className="text-[12px] text-muted">
                  {lines.length}줄 · <span className="rounded bg-butter px-1">노란 줄</span> 개인정보 의심
                </span>
              </div>
              <div ref={rawRef} className="max-h-[70dvh] overflow-auto rounded-2xl border border-line bg-surface py-3 lg:max-h-[calc(100dvh-9rem)]">
                {lines.map((line, i) => {
                  const n = i + 1;
                  const inChunk = activeRange && activeRange.length === 2 && n >= activeRange[0] && n <= activeRange[1];
                  return (
                    <div key={n} data-line={n} className={`flex gap-3 px-3 text-[13px] leading-6 ${inChunk ? "bg-sky" : piiLines.has(n) ? "bg-butter" : ""}`}>
                      <span className="w-9 shrink-0 text-right text-[11px] leading-6 text-placeholder select-none">{n}</span>
                      <span className="min-w-0 break-words whitespace-pre-wrap text-ink">{line || " "}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* 오른쪽: 편집 */}
          <fieldset disabled={published || busy !== null} className="flex min-w-0 flex-col gap-8">
            {!published && (
              <section aria-label="남은 할 일" className={`rounded-2xl px-5 py-4 ${problems.length ? "border border-line bg-surface" : "bg-sky"}`}>
                {problems.length === 0 ? (
                  <p className="text-[13px] font-bold text-brand">모두 확인했어요. 공개할 수 있어요.</p>
                ) : (
                  <>
                    <p className="text-[13px] font-bold text-ink">공개 전에 남은 할 일 {problems.length}개</p>
                    <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-[12px] text-body">
                      {problems.slice(0, 6).map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                      {problems.length > 6 && <li>… 외 {problems.length - 6}개</li>}
                    </ul>
                  </>
                )}
              </section>
            )}

            {/* 글 정보 */}
            <Section title="글 정보">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="제목" className="sm:col-span-2">
                  <input className={inputCls} value={draft.source.title} maxLength={200} onChange={(e) => change((d) => ({ ...d, source: { ...d.source, title: e.target.value } }))} />
                </Field>
                <Field label="종류">
                  <select
                    className={inputCls}
                    value={draft.source.source_type}
                    onChange={(e) => change((d) => ({ ...d, source: { ...d.source, source_type: e.target.value as ImportDraft["source"]["source_type"] } }))}
                  >
                    <option>졸업생 인터뷰</option>
                    <option>졸업생 에세이</option>
                  </select>
                </Field>
                <Field label="날짜 (인터뷰·글을 쓴 날)">
                  <input
                    type="date"
                    className={inputCls}
                    value={draft.source.published_at ?? ""}
                    onChange={(e) => change((d) => ({ ...d, source: { ...d.source, published_at: e.target.value || null } }))}
                  />
                </Field>
                <Field label="공개 등급" className="sm:col-span-2" hint="확실하지 않으면 L1. L3은 본인이 실명·원문 공개에 동의했을 때만 (docs/DATA.md 2장)">
                  <select
                    className={inputCls}
                    value={draft.source.visibility}
                    onChange={(e) => change((d) => ({ ...d, source: { ...d.source, visibility: e.target.value as ImportDraft["source"]["visibility"] } }))}
                  >
                    <option value="L1">L1 · 익명으로 답변 근거로만</option>
                    <option value="L2">L2 · 익명으로 원문 구간까지 보여줌</option>
                    <option value="L3">L3 · 제목·원문 링크·원문 구간 공개</option>
                  </select>
                </Field>
              </div>
              {draft.note && <p className="mt-3 rounded-xl bg-canvas px-3 py-2 text-[12px] text-body">AI 메모: {draft.note}</p>}
            </Section>

            {/* 개인정보 */}
            <Section title={`개인정보 의심 부분 ${draft.pii.length}개`}>
              {draft.pii.length === 0 ? (
                <p className="text-[13px] text-muted">찾은 부분이 없어요. 그래도 원문을 한 번 훑어봐 주세요.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {draft.pii.map((f) => (
                    <li key={`${f.line}-${f.text}`}>
                      <button type="button" onClick={() => scrollToLine(f.line)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-[13px] hover:bg-sky">
                        <span className="w-12 shrink-0 text-[11px] text-muted">{f.line}줄</span>
                        <span className="rounded bg-butter px-1.5 text-ink">{f.text}</span>
                        <span className="text-[11px] text-muted">
                          {PII_KIND[f.kind] ?? f.kind}
                          {f.by === "rule" ? " · 규칙" : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-line bg-surface px-3 py-3 text-[13px] text-ink">
                <input
                  type="checkbox"
                  checked={draft.pii_checked}
                  onChange={(e) => change((d) => ({ ...d, pii_checked: e.target.checked }))}
                  className="mt-0.5 size-4 accent-brand"
                />
                <span>
                  모두 확인했어요. 학생에게 보이면 안 되는 부분은 아래 조각 내용에서 지웠어요.
                  <span className="block text-[12px] text-muted">조각 내용만 학생 답변에 쓰여요. 원문은 공개할 때 지워져요.</span>
                </span>
              </label>
            </Section>

            {/* 사람 */}
            <Section title={`말한 사람 ${draft.people.length}명`} hint="졸업생의 말만 조각이 돼요. 인터뷰어·그 밖의 사람의 말은 공개되지 않아요.">
              <div className="flex flex-col gap-4">
                {draft.people.map((p) => (
                  <PersonCard key={p.ref} person={p} options={people ?? []} existingIds={existingIds} onChange={(patch) => updatePerson(p.ref, patch)} />
                ))}
              </div>
            </Section>

            {/* 조각 */}
            <Section
              title={`조각 ${alumniChunks.length}개 (확인 ${alumniChunks.filter((c) => c.confirmed).length})`}
              hint="AI가 원문에서 잘라 온 그대로예요. 학생에게 보이면 안 되는 부분은 내용에서 지워 주세요."
              action={
                !published && (
                  <button type="button" onClick={confirmAllChunks} className={smallBtn} title="태그가 있는 졸업생 조각을 모두 확인으로 바꿔요">
                    태그 있는 조각 모두 확인
                  </button>
                )
              }
            >
              <div className="flex flex-col gap-4">
                {draft.chunks.map((c, i) => (
                  <ChunkCard
                    key={c.key}
                    chunk={c}
                    people={draft.people}
                    isAlumni={refs.has(c.speaker)}
                    active={activeChunk === c.key}
                    canMerge={i > 0}
                    onHover={() => setActiveChunk(c.key)}
                    onFocus={() => {
                      setActiveChunk(c.key);
                      if (c.lines[0]) scrollToLine(c.lines[0]);
                    }}
                    onChange={(patch) => updateChunk(c.key, patch)}
                    onMerge={() => mergeWithPrevious(c.key)}
                    onRemove={() => removeChunk(c.key)}
                  />
                ))}
                {!published && (
                  <button type="button" onClick={addChunk} className="h-11 rounded-2xl border-2 border-dashed border-line text-[13px] text-body hover:border-brand hover:text-brand">
                    + 조각 직접 추가
                  </button>
                )}
              </div>
            </Section>
          </fieldset>
        </div>
      )}

      {confirm === "publish" && draft && (
        <ConfirmDialog
          title="공개할까요?"
          body={`졸업생 조각 ${alumniChunks.length}개가 바로 학생 답변의 근거로 쓰여요. 공개하면 올린 원문은 지워지고, 이 화면에서는 더 고칠 수 없어요.`}
          cancelLabel="취소"
          confirmLabel="공개"
          onCancel={() => setConfirm(null)}
          onConfirm={publish}
        />
      )}
      {confirm === "analyze" && (
        <ConfirmDialog
          title="AI 분석을 다시 할까요?"
          body="지금까지 고친 사람·조각·태그는 모두 사라지고 새 초안으로 바뀌어요."
          cancelLabel="취소"
          confirmLabel="다시 분석"
          onCancel={() => setConfirm(null)}
          onConfirm={reanalyze}
        />
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------- 화면 틀
function Shell({ filename, status, actions, children }: { filename: string; status?: ImportStatus; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <main className="w-full px-4 pt-8 pb-16 sm:px-8">
      <div className="mx-auto w-full max-w-[1400px]">
        <nav aria-label="위치" className="flex items-center gap-1.5 text-[13px] text-muted">
          <Link href="/admin/imports" className="font-medium text-brand underline-offset-4 hover:underline">
            인터뷰 넣기
          </Link>
          <span aria-hidden="true">/</span>
          <span className="truncate">{filename}</span>
        </nav>
        <div className="mt-3 mb-6 flex flex-wrap items-center gap-3">
          <h1 className="min-w-0 truncate text-[22px] font-bold text-ink">{filename || "파일"}</h1>
          {status && <ImportStatusPill status={status} />}
          <div className="ml-auto flex items-center gap-2">{actions}</div>
        </div>
        {children}
      </div>
    </main>
  );
}

function Section({ title, hint, action, children }: { title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[16px] font-bold text-ink">{title}</h2>
          {hint && <p className="mt-0.5 text-[12px] text-muted">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, className = "", children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <span className="text-[12px] font-bold text-body">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

// 쉼표 목록 칸: 칸을 떠날 때 내용이 바뀌었으면만 저장한다 (그냥 지나가면 '확인함'이 풀리지 않게)
function ListInput({ value, placeholder, onCommit }: { value: string[]; placeholder?: string; onCommit: (v: string[]) => void }) {
  return (
    <input
      className={inputCls}
      placeholder={placeholder}
      defaultValue={joinList(value)}
      onBlur={(e) => {
        const next = splitList(e.target.value);
        if (joinList(next) !== joinList(value)) onCommit(next);
      }}
    />
  );
}

// 태그 고르기. AI 가 추천한 태그에는 작은 'AI' 표시
function TagChips({
  options,
  selected,
  ai,
  max,
  onChange,
}: {
  options: Record<string, string>;
  selected: string[];
  ai: string[];
  max?: number;
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(options).map(([code, name]) => {
        const on = selected.includes(code);
        const full = max !== undefined && !on && selected.length >= max;
        return (
          <button
            key={code}
            type="button"
            aria-pressed={on}
            disabled={full}
            onClick={() => onChange(on ? selected.filter((x) => x !== code) : [...selected, code])}
            className={`inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[12px] transition-colors disabled:opacity-40 ${
              on ? "border-brand bg-brand font-bold text-white" : "border-line bg-surface text-body hover:border-brand hover:text-brand"
            }`}
          >
            {name}
            {ai.includes(code) && (
              <span className={`rounded px-1 text-[9px] leading-4 font-bold ${on ? "bg-white/25 text-white" : "bg-butter text-ink"}`} title="AI 추천">
                AI
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function ConfirmToggle({ confirmed, onChange }: { confirmed: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={confirmed}
      onClick={() => onChange(!confirmed)}
      className={`h-8 shrink-0 rounded-full px-4 text-[12px] font-bold transition-colors ${
        confirmed ? "bg-brand text-white" : "border border-brand bg-surface text-brand hover:bg-sky"
      }`}
    >
      {confirmed ? "확인함 ✓" : "확인"}
    </button>
  );
}

// ---------------------------------------------------------------- 사람 카드
function PersonCard({
  person: p,
  options,
  existingIds,
  onChange,
}: {
  person: DraftPerson;
  options: PersonOption[];
  existingIds: Set<string>;
  onChange: (patch: Partial<DraftPerson>) => void;
}) {
  const alumni = p.role === "alumni";
  const linked = p.link === "existing" ? options.find((o) => o.id === p.person_id) : undefined;
  const idTaken = p.link === "new" && existingIds.has(p.person_id);
  // 같은 별명이 DB 에 있으면 연결을 먼저 제안한다
  const sameName = p.link === "new" && p.nickname ? options.find((o) => o.nickname === p.nickname) : undefined;
  const edit = (patch: Partial<DraftPerson>) => onChange({ ...patch, confirmed: false });

  return (
    <article className={`rounded-2xl border px-4 py-4 ${alumni ? "border-line bg-surface" : "border-dashed border-line bg-canvas"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-sky px-2.5 py-0.5 text-[11px] font-bold text-brand">{p.ref}</span>
        <span className="text-[14px] font-bold text-ink">{personName(p)}</span>
        {p.label && <span className="text-[12px] text-muted">원문 표시: {p.label}</span>}
        <select
          aria-label={`${personName(p)} 역할`}
          value={p.role}
          onChange={(e) => edit({ role: e.target.value as PersonRole })}
          className="ml-auto h-8 rounded-full border border-line bg-surface px-3 text-[12px] text-ink"
        >
          {Object.entries(ROLE_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        {alumni && <ConfirmToggle confirmed={p.confirmed} onChange={(v) => onChange({ confirmed: v })} />}
      </div>

      {alumni && (
        <div className="mt-4 flex flex-col gap-3">
          <div role="radiogroup" aria-label="인물 연결" className="flex gap-2">
            {(["new", "existing"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={p.link === v}
                onClick={() => edit({ link: v, person_id: v === "existing" ? "" : p.person_id || "p-" })}
                className={`h-8 rounded-full border px-3 text-[12px] ${p.link === v ? "border-brand bg-sky font-bold text-brand" : "border-line bg-surface text-body"}`}
              >
                {v === "new" ? "새 인물로 추가" : "DB에 있는 인물에 연결"}
              </button>
            ))}
          </div>

          {sameName && (
            <p className="rounded-xl bg-butter px-3 py-2 text-[12px] text-ink">
              DB에 같은 별명 &lsquo;{sameName.nickname}&rsquo;({sameName.id})이 있어요. 같은 사람이면{" "}
              <button type="button" onClick={() => edit({ link: "existing", person_id: sameName.id })} className="font-bold text-brand underline">
                그 인물에 연결
              </button>
              하세요.
            </p>
          )}

          {p.link === "existing" ? (
            <Field label="연결할 인물" hint={linked ? `${linked.path_summary ?? ""} · 별명·진로 태그는 DB 값을 그대로 써요` : undefined}>
              <select className={inputCls} value={p.person_id} onChange={(e) => edit({ person_id: e.target.value })}>
                <option value="">고르세요</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nickname} ({o.id})
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="별명 (화면·검색에 쓰는 이름)">
                  <input className={inputCls} value={p.nickname} maxLength={50} onChange={(e) => edit({ nickname: e.target.value })} />
                </Field>
                <Field label="인물 ID" hint={idTaken ? "이미 있는 ID예요" : "p- + 영어 소문자·숫자·'-'"}>
                  <input
                    className={`${inputCls} ${idTaken ? "border-danger" : ""}`}
                    value={p.person_id}
                    maxLength={64}
                    onChange={(e) => edit({ person_id: e.target.value.toLowerCase().replace(/\s+/g, "-") })}
                  />
                </Field>
                <Field label="실명 (선택, DB에만 저장)" hint="학생 화면·답변에는 나가지 않아요">
                  <input className={inputCls} value={p.real_name} maxLength={50} onChange={(e) => edit({ real_name: e.target.value })} />
                </Field>
                <Field label="기관 (학교·회사 이름, 쉼표로)">
                  <ListInput value={p.organizations} onCommit={(v) => edit({ organizations: v })} />
                </Field>
                <Field label="진로 경로 한 줄" className="sm:col-span-2">
                  <input className={inputCls} value={p.path_summary} maxLength={300} placeholder="예: 거캠 엑시트 → 특성화고 재입학 → IT 기업 취업" onChange={(e) => edit({ path_summary: e.target.value })} />
                </Field>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[12px] font-bold text-body">진로 경로 태그</span>
                <TagChips options={PATH_TAGS} selected={p.career_paths} ai={p.ai_career_paths} onChange={(v) => edit({ career_paths: v })} />
                {p.career_paths.includes("etc") && (
                  <ListInput value={p.path_detail} placeholder="기타 경로 상세 (쉼표로)" onCommit={(v) => edit({ path_detail: v })} />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[12px] font-bold text-body">분야 태그</span>
                <TagChips options={FIELD_TAGS} selected={p.career_fields} ai={p.ai_career_fields} onChange={(v) => edit({ career_fields: v })} />
                <ListInput
                  value={p.field_detail}
                  placeholder={p.career_fields.includes("etc") ? "기타 분야 상세 (필수, 쉼표로)" : "구체적인 전공 등 (선택, 쉼표로)"}
                  onCommit={(v) => edit({ field_detail: v })}
                />
              </div>
            </>
          )}
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------- 조각 카드
function ChunkCard({
  chunk: c,
  people,
  isAlumni,
  active,
  canMerge,
  onHover,
  onFocus,
  onChange,
  onMerge,
  onRemove,
}: {
  chunk: DraftChunk;
  people: DraftPerson[];
  isAlumni: boolean;
  active: boolean;
  canMerge: boolean;
  onHover: () => void;
  onFocus: () => void;
  onChange: (patch: Partial<DraftChunk>) => void;
  onMerge: () => void;
  onRemove: () => void;
}) {
  const edit = (patch: Partial<DraftChunk>) => onChange({ ...patch, confirmed: false });
  return (
    <article
      onFocusCapture={onFocus}
      onMouseEnter={onHover}
      className={`rounded-2xl border px-4 py-4 transition-colors ${
        !isAlumni ? "border-dashed border-line bg-canvas opacity-70" : c.confirmed ? "border-brand/40 bg-surface" : active ? "border-brand bg-surface" : "border-line bg-surface"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-bold text-ink">{c.key}</span>
        <span className="text-[11px] text-muted">{c.lines.length === 2 ? `원문 ${c.lines[0]}–${c.lines[1]}줄` : "직접 추가"}</span>
        <select
          aria-label={`${c.key} 말한 사람`}
          value={c.speaker}
          onChange={(e) => edit({ speaker: e.target.value })}
          className="h-8 rounded-full border border-line bg-surface px-3 text-[12px] text-ink"
        >
          {people.map((p) => (
            <option key={p.ref} value={p.ref}>
              {personName(p)} · {ROLE_LABEL[p.role]}
            </option>
          ))}
        </select>
        {!isAlumni && <span className="text-[11px] text-muted">졸업생이 아니라 공개되지 않아요</span>}
        <div className="ml-auto flex items-center gap-1.5">
          {canMerge && (
            <button type="button" onClick={onMerge} className={smallBtn} title="바로 위 조각에 이 조각 내용을 붙여요">
              위와 합치기
            </button>
          )}
          <button type="button" onClick={onRemove} className={`${smallBtn} hover:text-danger-dark`}>
            빼기
          </button>
          {isAlumni && <ConfirmToggle confirmed={c.confirmed} onChange={(v) => onChange({ confirmed: v })} />}
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <textarea aria-label={`${c.key} 질문`} className={areaCls} rows={1} placeholder="질문 (에세이는 비워 두기)" value={c.question} onChange={(e) => edit({ question: e.target.value })} />
        <textarea
          aria-label={`${c.key} 내용`}
          className={areaCls}
          rows={Math.min(10, Math.max(3, Math.ceil(c.content.length / 60)))}
          placeholder="졸업생이 한 말 (원문 그대로)"
          value={c.content}
          onChange={(e) => edit({ content: e.target.value })}
        />
        <div className="flex items-center justify-between text-[11px] text-muted">
          <span>주제 태그 (1~2개)</span>
          <span>{c.content.length.toLocaleString()}자</span>
        </div>
        <TagChips options={TOPIC_TAGS} selected={c.topics} ai={c.ai_topics} max={MAX_TOPICS} onChange={(v) => edit({ topics: v })} />
        {c.topics.includes("etc") && (
          <ListInput value={c.topic_detail} placeholder="기타 주제 상세 (쉼표로)" onCommit={(v) => edit({ topic_detail: v })} />
        )}
      </div>
    </article>
  );
}
