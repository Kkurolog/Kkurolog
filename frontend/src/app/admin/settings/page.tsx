// 메일 설정 (주소 "/admin/settings", 와이어프레임 04-8-1 ~ 04-8-5)
// 탭 5개(멘토에게 가는 메일 / 학생에게 전달하는 답장 메일 / 보낸 문의 사본 / 멘토 리마인드 / 횟수 제한), 한 줄에 한 항목.
// 바로 다음 메일부터 적용된다. 글 칸을 비우면 기본 문구로 동작한다. 숫자 칸은 0 이상의 정수만.
// 탭을 옮겨도 고치던 값은 남아 있고, '저장'은 바뀐 칸만 모아 한 번에 보낸다.
"use client";

import { useEffect, useId, useState } from "react";
import { AdminPage, ErrorNotice, PageTitle } from "@/components/admin/ui";
import { AdminApiError, fetchSettings, updateSettings, type SettingItem } from "@/lib/adminApi";

type Row = { key: string; label: string; unit?: string; hint?: string; number?: boolean };

// 키 이름은 backend/app/mail/mail_settings.py 의 DEFAULTS 와 같다
const TABS: { label: string; rows: Row[]; hint?: string }[] = [
  {
    label: "멘토에게 가는 메일",
    rows: [
      { key: "mentorSubjectPrefix", label: "제목 말머리" },
      { key: "mentorFooter", label: "맨 아래 안내 문구" },
    ],
  },
  {
    label: "학생에게 전달하는 답장 메일",
    rows: [
      { key: "studentSubjectPrefix", label: "제목 말머리" },
      { key: "studentForwardIntro", label: "맨 위 안내 문구" },
      { key: "studentForwardFooter", label: "맨 아래 안내 문구" },
    ],
  },
  {
    label: "보낸 문의 사본",
    rows: [
      { key: "studentCopySubjectPrefix", label: "제목 말머리" },
      { key: "studentCopyIntro", label: "맨 위 안내 문구" },
      { key: "studentCopyFooter", label: "맨 아래 안내 문구" },
    ],
  },
  {
    label: "멘토 리마인드",
    rows: [
      { key: "reminderDays", label: "며칠째에 보낼지", unit: "일째", hint: "0이면 보내지 않음", number: true },
      { key: "mentorReminderSubjectPrefix", label: "제목 말머리" },
      { key: "mentorReminderIntro", label: "맨 위 문구" },
    ],
  },
  {
    label: "횟수 제한",
    hint: "0이면 제한 없음",
    rows: [
      { key: "rateLimitMinutes", label: "셀 시간", unit: "분", number: true },
      { key: "rateLimitPerWindow", label: "그 시간 안에 보낼 수 있는 문의 수", unit: "건", number: true },
      { key: "rateLimitPerDay", label: "하루에 보낼 수 있는 문의 수", unit: "건", number: true },
    ],
  },
];

const ALL_ROWS = TABS.flatMap((t) => t.rows);
const MAX_LENGTH = 1000;

function toValues(items: SettingItem[]): Record<string, string> {
  const map = Object.fromEntries(items.map((i) => [i.key, i.value]));
  return Object.fromEntries(ALL_ROWS.map((r) => [r.key, map[r.key] ?? ""]));
}

export default function SettingsPage() {
  const uid = useId();
  const [tab, setTab] = useState(0);
  const [saved, setSaved] = useState<Record<string, string> | null>(null); // 서버에 저장된 값
  const [draft, setDraft] = useState<Record<string, string>>({}); // 고치는 중인 값
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    fetchSettings()
      .then((items) => {
        const values = toValues(items);
        setSaved(values);
        setDraft(values);
      })
      .catch((err) => setLoadError(err instanceof AdminApiError ? err.message : "메일 설정을 불러오지 못했어요."));
  }, []);

  // 숫자 칸 검사: 0 이상의 정수 (비우면 안 됨)
  const numberError = (row: Row) => row.number && !/^\d+$/.test((draft[row.key] ?? "").trim());
  const invalid = ALL_ROWS.filter((r) => numberError(r));
  const changed = saved ? ALL_ROWS.filter((r) => (draft[r.key] ?? "").trim() !== (saved[r.key] ?? "").trim()) : [];
  const changedTabs = new Set(TABS.map((t, i) => (t.rows.some((r) => changed.includes(r)) ? i : -1)));

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !saved) return;
    if (invalid.length > 0) {
      const where = TABS.findIndex((t) => t.rows.some((r) => invalid.includes(r)));
      setTab(where);
      setMessage({ text: "숫자 칸은 0 이상의 정수로 적어 주세요.", error: true });
      return;
    }
    if (changed.length === 0) {
      setMessage({ text: "바꿀 내용이 없어요.", error: true });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const items = await updateSettings(Object.fromEntries(changed.map((r) => [r.key, (draft[r.key] ?? "").trim()])));
      const values = toValues(items);
      setSaved(values);
      setDraft(values);
      setMessage({ text: "저장했어요. 다음 메일부터 적용돼요.", error: false });
    } catch (err) {
      setMessage({ text: err instanceof AdminApiError ? err.message : "저장하지 못했어요. 잠시 후 다시 시도해 주세요.", error: true });
    } finally {
      setBusy(false);
    }
  }

  const current = TABS[tab];

  return (
    <AdminPage>
      <PageTitle sub="바로 다음 메일부터 적용됩니다. 글 칸을 비우면 기본값으로 동작합니다.">메일 설정</PageTitle>

      {loadError ? (
        <ErrorNotice message={loadError} />
      ) : (
        <form onSubmit={handleSave} noValidate>
          <div role="tablist" aria-label="메일 종류" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {TABS.map((t, i) => (
              <button
                key={t.label}
                type="button"
                role="tab"
                id={`${uid}-tab-${i}`}
                aria-selected={tab === i}
                aria-controls={`${uid}-panel`}
                onClick={() => setTab(i)}
                className={`relative h-9 shrink-0 rounded-full border px-4 text-[13px] whitespace-nowrap transition-colors ${
                  tab === i ? "border-brand bg-brand font-bold text-white" : "border-line bg-surface text-body hover:border-brand hover:text-brand"
                }`}
              >
                {t.label}
                {/* 저장하지 않은 고친 값이 있는 탭 표시 */}
                {changedTabs.has(i) && <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-canvas bg-accent" aria-label="(저장 안 한 변경)" />}
              </button>
            ))}
          </div>

          <div role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-${tab}`} className="mt-10 flex flex-col gap-5">
            {!saved && <p className="text-[14px] text-muted">불러오는 중…</p>}
            {saved &&
              current.rows.map((row) => {
                const id = `${uid}-${row.key}`;
                const bad = numberError(row);
                return (
                  <div key={row.key} className="flex flex-col gap-2 md:flex-row md:items-center md:gap-6">
                    <label htmlFor={id} className="text-[14px] font-bold text-ink md:w-60 md:shrink-0">
                      {row.label}
                    </label>
                    {row.number ? (
                      <div className="flex items-center gap-3">
                        <input
                          id={id}
                          inputMode="numeric"
                          value={draft[row.key] ?? ""}
                          onChange={(e) => {
                            setDraft((d) => ({ ...d, [row.key]: e.target.value.replace(/[^\d]/g, "") }));
                            setMessage(null);
                          }}
                          maxLength={6}
                          aria-invalid={bad}
                          className={`h-11 w-24 rounded-full border bg-surface px-4 text-[14px] text-ink focus:outline-none ${
                            bad ? "border-danger" : "border-line focus:border-brand"
                          }`}
                        />
                        <span className="text-[14px] font-bold text-ink">{row.unit}</span>
                        {row.hint && <span className="text-[12px] text-muted">{row.hint}</span>}
                      </div>
                    ) : (
                      <input
                        id={id}
                        value={draft[row.key] ?? ""}
                        onChange={(e) => {
                          setDraft((d) => ({ ...d, [row.key]: e.target.value }));
                          setMessage(null);
                        }}
                        maxLength={MAX_LENGTH}
                        placeholder="비워 두면 기본 문구를 써요"
                        className="h-11 w-full min-w-0 flex-1 rounded-full border border-line bg-surface px-4 text-[14px] text-ink placeholder:text-placeholder focus:border-brand focus:outline-none"
                      />
                    )}
                  </div>
                );
              })}
            {saved && current.hint && <p className="text-[12px] text-muted md:pl-[264px]">{current.hint}</p>}
          </div>

          <div className="mt-10 flex items-center justify-end gap-4">
            {message && (
              <p role={message.error ? "alert" : "status"} className={`text-[13px] ${message.error ? "text-danger" : "text-body"}`}>
                {message.text}
              </p>
            )}
            <button
              type="submit"
              disabled={busy || !saved}
              className="h-11 rounded-full bg-brand px-7 text-[14px] font-bold text-white hover:bg-brand-dark disabled:bg-line disabled:text-muted"
            >
              {busy ? "저장하는 중…" : "저장"}
            </button>
          </div>
        </form>
      )}
    </AdminPage>
  );
}
