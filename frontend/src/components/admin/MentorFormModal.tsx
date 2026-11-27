// 멘토 추가·수정 창 (와이어프레임 04-6 추가, 04-6-1 id 중복, 04-7 수정, 04-7-1 연락 가능 규칙 오류)
// - 추가: 멘토 ID 는 영어 소문자·숫자·'-' 50자까지, 한 번 정하면 바꿀 수 없다.
// - 수정: ID 는 회색으로 잠근다. 바뀐 칸만 보낸다. 메일 주소를 비우면 지운다. 바뀐 게 없으면 '바꿀 내용이 없어요.'
// - 연락 가능으로 두려면 참여 동의 + 메일 주소가 모두 있어야 한다. 어기면 문구를 보여주고 저장 버튼을 끈다.
// - 삭제는 멘토 목록의 '삭제' 버튼으로 한다 (문의 기록이 없는 멘토만). 쉬게 하려면 연락 가능을 끈다.
"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AdminApiError, createMentor, updateMentor, type AdminMentor, type MentorUpdate } from "@/lib/adminApi";
import { CloseIcon } from "../icons";

// 진로 경로 선택지 (backend 멘토 데이터와 같은 이름)
const CAREER_PATHS = ["대학 진학", "해외 대학", "취업", "창업", "디자인·예술", "개발", "기타 경로"];

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,49}$/;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const AVAILABLE_RULE = "연락 가능으로 두려면 참여 동의와 메일 주소가 모두 있어야 해요.";

type Form = {
  id: string;
  name: string;
  exitYear: string;
  email: string;
  careerPaths: string[];
  pathSummary: string;
  summary: string;
  tags: string; // 쉼표로 구분
  topics: string; // 쉼표로 구분
  consent: boolean;
  available: boolean;
};

function toForm(m?: AdminMentor): Form {
  return {
    id: m?.id ?? "",
    name: m?.name ?? "",
    exitYear: m?.exit_year != null ? String(m.exit_year) : "",
    email: m?.email ?? "",
    careerPaths: m?.career_paths ?? [],
    pathSummary: m?.path_summary ?? "",
    summary: m?.summary ?? "",
    tags: (m?.tags ?? []).join(", "),
    topics: (m?.topics ?? []).join(", "),
    consent: m?.consent ?? false,
    available: m?.available ?? false,
  };
}

const splitList = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

type Props = {
  mentor?: AdminMentor; // 있으면 수정, 없으면 추가
  onClose: () => void;
  onSaved: (m: AdminMentor) => void;
};

export default function MentorFormModal({ mentor, onClose, onSaved }: Props) {
  const editing = Boolean(mentor);
  const [form, setForm] = useState<Form>(() => toForm(mentor));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null); // 저장 버튼 옆 오류 문구
  const [idError, setIdError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const firstRef = useRef<HTMLInputElement>(null);
  const uid = useId();

  useEffect(() => {
    firstRef.current?.focus(); // 창이 열리면 첫 칸에 바로 쓸 수 있게
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setMessage(null);
    if (key === "id") setIdError(null);
  }

  // ---- 칸별 검사
  const email = form.email.trim();
  const year = form.exitYear.trim();
  const errors = {
    id: !editing && form.id.trim() && !ID_PATTERN.test(form.id.trim()) ? "영어 소문자·숫자·'-'만, 50자까지 쓸 수 있어요." : null,
    name: !form.name.trim() ? "이름을 적어 주세요." : null,
    exitYear: year && !(/^\d{4}$/.test(year) && Number(year) >= 1990 && Number(year) <= 2100) ? "1990~2100 사이 연도를 적거나 비워 두세요." : null,
    email: email && !EMAIL_PATTERN.test(email) ? "메일 주소 형식을 확인해 주세요." : null,
  };
  const ruleBroken = form.available && (!form.consent || !email);
  const requiredMissing = !form.name.trim() || (!editing && !form.id.trim());
  const hasError = Object.values(errors).some(Boolean) || ruleBroken || requiredMissing;

  // ---- 수정일 때 바뀐 칸만 모은다
  function changes(): MentorUpdate {
    if (!mentor) return {};
    const out: MentorUpdate = {};
    const name = form.name.trim();
    if (name !== mentor.name) out.name = name;
    const exitYear = year ? Number(year) : null;
    if (exitYear !== mentor.exit_year) out.exit_year = exitYear;
    if (email !== (mentor.email ?? "")) out.email = email || null; // 비우면 메일 주소를 지운다
    if (!sameList(form.careerPaths, mentor.career_paths)) out.career_paths = form.careerPaths;
    if (form.pathSummary.trim() !== mentor.path_summary) out.path_summary = form.pathSummary.trim();
    if (form.summary.trim() !== mentor.summary) out.summary = form.summary.trim();
    const tags = splitList(form.tags);
    if (!sameList(tags, mentor.tags)) out.tags = tags;
    const topics = splitList(form.topics);
    if (!sameList(topics, mentor.topics)) out.topics = topics;
    if (form.consent !== mentor.consent) out.consent = form.consent;
    if (form.available !== mentor.available) out.available = form.available;
    return out;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ id: true, name: true, exitYear: true, email: true });
    if (hasError || busy) return;

    let body: MentorUpdate | null = null;
    if (mentor) {
      body = changes();
      if (Object.keys(body).length === 0) {
        setMessage("바꿀 내용이 없어요.");
        return;
      }
    }

    setBusy(true);
    setMessage(null);
    try {
      const saved = mentor
        ? await updateMentor(mentor.id, body!)
        : await createMentor({
            id: form.id.trim(),
            name: form.name.trim(),
            exit_year: year ? Number(year) : null,
            email: email || null,
            career_paths: form.careerPaths,
            path_summary: form.pathSummary.trim(),
            summary: form.summary.trim(),
            tags: splitList(form.tags),
            topics: splitList(form.topics),
            consent: form.consent,
            available: form.available,
          });
      onSaved(saved);
    } catch (err) {
      const text = err instanceof AdminApiError ? err.message : "저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
      if (err instanceof AdminApiError && err.status === 409) setIdError(text);
      else setMessage(text);
      setBusy(false);
    }
  }

  const fieldError = (key: keyof typeof errors) => (touched[key] ? errors[key] : null);
  const input = (bad: boolean) =>
    `h-11 w-full rounded-full border bg-surface px-4 text-[14px] text-ink placeholder:text-placeholder focus:outline-none disabled:bg-canvas disabled:text-muted ${
      bad ? "border-danger" : "border-line focus:border-brand"
    }`;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/50 motion-safe:animate-fade-in sm:items-center sm:p-4" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        noValidate
        className="flex max-h-[92dvh] w-full max-w-[640px] flex-col rounded-t-3xl border-brand bg-canvas motion-safe:animate-slide-up sm:max-h-[88dvh] sm:rounded-3xl sm:border-2 sm:motion-safe:animate-pop-in"
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4 sm:px-8">
          <h2 id={`${uid}-title`} className="text-[18px] font-bold text-ink">
            {editing ? "멘토 수정" : "멘토 추가"}
          </h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="flex size-10 items-center justify-center rounded-xl text-body hover:bg-sky hover:text-brand">
            <CloseIcon className="size-5" />
          </button>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto px-6 py-5 sm:px-8">
          <Field id={`${uid}-id`} label="멘토 ID" error={idError ?? fieldError("id")} hint={editing ? "ID 는 바꿀 수 없어요." : undefined}>
            <input
              ref={editing ? undefined : firstRef}
              id={`${uid}-id`}
              value={form.id}
              onChange={(e) => set("id", e.target.value.toLowerCase())}
              onBlur={() => setTouched((t) => ({ ...t, id: true }))}
              disabled={editing}
              placeholder="예: mt-11 (정하면 바꿀 수 없어요)"
              maxLength={50}
              autoComplete="off"
              aria-invalid={Boolean(idError ?? fieldError("id"))}
              className={input(Boolean(idError ?? fieldError("id")))}
            />
          </Field>

          <Field id={`${uid}-name`} label="이름 또는 별명" error={fieldError("name")}>
            <input
              ref={editing ? firstRef : undefined}
              id={`${uid}-name`}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, name: true }))}
              placeholder="이름"
              maxLength={50}
              aria-invalid={Boolean(fieldError("name"))}
              className={input(Boolean(fieldError("name")))}
            />
          </Field>

          <Field id={`${uid}-year`} label="엑시트 연도" error={fieldError("exitYear")}>
            <input
              id={`${uid}-year`}
              value={form.exitYear}
              onChange={(e) => set("exitYear", e.target.value.replace(/[^\d]/g, ""))}
              onBlur={() => setTouched((t) => ({ ...t, exitYear: true }))}
              inputMode="numeric"
              placeholder="예: 2022"
              maxLength={4}
              aria-invalid={Boolean(fieldError("exitYear"))}
              className={input(Boolean(fieldError("exitYear")))}
            />
          </Field>

          <Field id={`${uid}-email`} label="메일 주소" error={fieldError("email")} hint={editing ? "비우고 저장하면 메일 주소를 지워요." : undefined}>
            <input
              id={`${uid}-email`}
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              placeholder="mentor@example.com"
              autoComplete="off"
              aria-invalid={Boolean(fieldError("email"))}
              className={input(Boolean(fieldError("email")))}
            />
          </Field>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-[13px] font-bold text-ink">
              진로 경로 <span className="font-normal text-muted">(여러 개 고를 수 있어요)</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {CAREER_PATHS.map((p) => {
                const on = form.careerPaths.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("careerPaths", on ? form.careerPaths.filter((x) => x !== p) : [...form.careerPaths, p])}
                    className={`h-9 rounded-full border px-4 text-[13px] transition-colors ${
                      on ? "border-brand bg-brand font-bold text-white" : "border-line bg-surface text-body hover:border-brand hover:text-brand"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <Field id={`${uid}-path`} label="경로 한 줄 요약">
            <input
              id={`${uid}-path`}
              value={form.pathSummary}
              onChange={(e) => set("pathSummary", e.target.value)}
              placeholder="예: 거캠 엑시트 → 해외 대학 진학"
              maxLength={300}
              className={input(false)}
            />
          </Field>

          <Field id={`${uid}-summary`} label="경험 요약">
            <textarea
              id={`${uid}-summary`}
              value={form.summary}
              onChange={(e) => set("summary", e.target.value)}
              placeholder="멘토의 경험 요약"
              maxLength={1000}
              rows={3}
              className="w-full resize-y rounded-2xl border border-line bg-surface px-4 py-3 text-[14px] leading-6 text-ink placeholder:text-placeholder focus:border-brand focus:outline-none"
            />
          </Field>

          <Field id={`${uid}-tags`} label="주요 경험 태그" hint="쉼표(,)로 나눠 적어요.">
            <input id={`${uid}-tags`} value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="예: 해외 대학, 갭이어" className={input(false)} />
          </Field>

          <Field id={`${uid}-topics`} label="답변 가능 주제" hint="쉼표(,)로 나눠 적어요.">
            <input id={`${uid}-topics`} value={form.topics} onChange={(e) => set("topics", e.target.value)} placeholder="예: 해외 지원, 갭이어" className={input(false)} />
          </Field>

          {/* 경고 문구는 흰 박스 아래에 띄운다 (박스 안에 넣으면 문구가 나올 때 박스가 늘어나 어색하다) */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface px-4 py-4">
              <Toggle
                label="참여 동의"
                hint="끄면 학생 화면 어디에도 이 멘토가 보이지 않아요."
                checked={form.consent}
                onChange={(v) => set("consent", v)}
              />
              <Toggle label="연락 가능 여부" hint="켜면 학생이 이 멘토에게 메일을 보낼 수 있어요." checked={form.available} onChange={(v) => set("available", v)} />
            </div>
            {ruleBroken && (
              <p
                role="alert"
                // 문구가 처음 나타날 때 창 아래에 가려지지 않게, 보이는 곳까지 스크롤한다
                ref={(el) => el?.scrollIntoView({ block: "nearest", behavior: "smooth" })}
                className="px-2 text-[13px] font-bold text-danger"
              >
                {AVAILABLE_RULE}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-line px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-8 sm:pb-5">
          {message && (
            <p role="alert" className="mr-auto text-[13px] text-danger">
              {message}
            </p>
          )}
          <button type="button" onClick={onClose} className="h-11 rounded-full px-5 text-[14px] font-bold text-body hover:bg-sky hover:text-brand">
            취소
          </button>
          <button
            type="submit"
            disabled={busy || ruleBroken}
            className="h-11 rounded-full bg-brand px-6 text-[14px] font-bold text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
          >
            {busy ? "저장하는 중…" : editing ? "저장" : "추가"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string | null; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[13px] font-bold text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="px-2 text-[12px] text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="px-2 text-[12px] text-muted">{hint}</p>
      )}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <span className="flex flex-col gap-0.5">
        <span className="text-[13px] font-bold text-ink">{label}</span>
        <span className="text-[12px] text-muted">{hint}</span>
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden="true"
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2 ${
          checked ? "bg-brand" : "bg-line"
        }`}
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`} />
      </span>
    </label>
  );
}
