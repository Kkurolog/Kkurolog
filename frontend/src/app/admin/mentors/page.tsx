// 관리자 멘토 목록 (주소 "/admin/mentors", 와이어프레임 04-5)
// 참여 동의하지 않은 멘토와 메일 주소까지 모두 보인다 (관리자만).
// 오른쪽 아래 '멘토 수정'을 누르면 수정 창이 뜨고, 창의 멘토 ID 드롭다운에서 수정할 멘토를 고른다.
// 표에서 줄을 미리 눌러 두면 그 멘토가 골라진 채로 열린다 (두 번 누르면 바로 열림). '멘토 추가'는 그 옆.
// '연락 가능'은 읽기 전용 체크 표시. 바꾸려면 '멘토 수정'. 멘토는 지울 수 없다.
// backend 는 멘토 전체를 한 번에 주므로, 쪽 나누기(10명씩)는 화면에서만 한다.
"use client";

import { useCallback, useEffect, useState } from "react";
import MentorFormModal from "@/components/admin/MentorFormModal";
import { AdminPage, ErrorNotice, PageTitle, Pagination, rowLink, tableWrap, td, th } from "@/components/admin/ui";
import { AdminApiError, fetchAdminMentors, PAGE_SIZE, type AdminMentor } from "@/lib/adminApi";

const pillButton =
  "h-11 shrink-0 rounded-full bg-brand px-6 text-[14px] font-bold text-white hover:bg-brand-dark disabled:bg-line disabled:text-muted";

export default function AdminMentorsPage() {
  const [mentors, setMentors] = useState<AdminMentor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 열린 창: 추가 / 수정(처음 고른 멘토, 없으면 null) / 닫힘(null)
  const [editing, setEditing] = useState<{ mode: "new" } | { mode: "edit"; initial: AdminMentor | null } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null); // 고른 멘토 (줄을 눌러 고른다)

  useEffect(() => {
    fetchAdminMentors()
      .then(setMentors)
      .catch((err) => setError(err instanceof AdminApiError ? err.message : "멘토 목록을 불러오지 못했어요."));
  }, []);

  const close = useCallback(() => setEditing(null), []);

  function handleSaved(saved: AdminMentor) {
    setMentors((list) => {
      if (!list) return [saved];
      const i = list.findIndex((m) => m.id === saved.id);
      if (i === -1) return [...list, saved];
      const next = [...list];
      next[i] = saved;
      return next;
    });
    setNotice(editing?.mode === "new" ? `'${saved.name}' 멘토를 추가했어요.` : `'${saved.name}' 멘토 정보를 저장했어요.`);
    setSelectedId(saved.id);
    setEditing(null);
  }

  // 지금 쪽에 보일 멘토 (쪽이 범위를 넘으면 마지막 쪽으로)
  const lastPage = Math.max(1, Math.ceil((mentors?.length ?? 0) / PAGE_SIZE));
  const shownPage = Math.min(page, lastPage);
  const shown = mentors?.slice((shownPage - 1) * PAGE_SIZE, shownPage * PAGE_SIZE);
  // 다른 쪽으로 넘기면 고른 것이 안 보이므로, 지금 쪽에 있는 멘토만 고른 것으로 본다
  const selected = shown?.find((m) => m.id === selectedId) ?? null;

  function openEditor(target: { mode: "new" } | { mode: "edit"; initial: AdminMentor | null }) {
    setNotice(null);
    setEditing(target);
  }

  return (
    <AdminPage>
      <PageTitle>멘토 목록</PageTitle>

      {notice && (
        <p role="status" className="mb-4 rounded-2xl bg-sky px-4 py-3 text-[13px] text-ink">
          {notice}
        </p>
      )}

      {error ? (
        <ErrorNotice message={error} />
      ) : (
        <div className={tableWrap}>
          <table className="w-full min-w-[760px] table-fixed">
            <colgroup>
              <col className="w-[48px]" />
              <col className="w-[110px]" />
              <col className="w-[180px]" />
              <col className="w-[100px]" />
              <col />
              <col className="w-[90px]" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className={th}>
                  <span className="sr-only">고르기</span>
                </th>
                <th scope="col" className={th}>멘토 ID</th>
                <th scope="col" className={th}>이름</th>
                <th scope="col" className={th}>엑시트 연도</th>
                <th scope="col" className={th}>메일 주소</th>
                <th scope="col" className={`${th} text-center`}>연락 가능</th>
              </tr>
            </thead>
            <tbody>
              {!mentors && (
                <tr className="border-t border-line">
                  <td colSpan={6} className={`${td} text-center text-muted`}>불러오는 중…</td>
                </tr>
              )}
              {mentors?.length === 0 && (
                <tr className="border-t border-line">
                  <td colSpan={6} className={`${td} text-center text-muted`}>아직 등록된 멘토가 없어요.</td>
                </tr>
              )}
              {shown?.map((m) => {
                const isSelected = selected?.id === m.id;
                return (
                  <tr
                    key={m.id}
                    aria-selected={isSelected}
                    onClick={() => setSelectedId(isSelected ? null : m.id)}
                    onDoubleClick={() => openEditor({ mode: "edit", initial: m })} // 두 번 누르면 바로 수정 창
                    className={`${rowLink} ${isSelected ? "bg-sky" : ""}`}
                  >
                    <td className={`${td} text-center`}>
                      {/* 키보드·화면 읽기 프로그램용. 줄 어디를 눌러도 고를 수 있다 */}
                      <input
                        type="radio"
                        name="mentor"
                        checked={isSelected}
                        onChange={() => setSelectedId(m.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`${m.name} 고르기`}
                        className="size-4 align-middle accent-brand"
                      />
                    </td>
                    <td className={`${td} font-medium`}>{m.id}</td>
                    <td className={td}>
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate">{m.name}</span>
                        {!m.consent && (
                          <span className="shrink-0 rounded-full border border-line px-2 text-[11px] leading-5 text-muted" title="참여 동의를 하지 않아 학생 화면에 보이지 않아요">
                            동의 안 함
                          </span>
                        )}
                      </span>
                    </td>
                    <td className={`${td} text-body`}>{m.exit_year ?? "—"}</td>
                    <td className={`${td} truncate ${m.email ? "text-body" : "text-muted"}`} title={m.email ?? undefined}>
                      {m.email ?? "—"}
                    </td>
                    <td className={`${td} text-center`}>
                      {/* 읽기 전용: 바꾸려면 '멘토 수정' */}
                      <input
                        type="checkbox"
                        checked={m.available}
                        readOnly
                        disabled
                        aria-label={m.available ? "연락 가능" : "연락 불가"}
                        className="size-4 align-middle accent-brand opacity-60"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 아래 줄: (왼쪽 안내) · 가운데 쪽 번호 · 오른쪽 버튼 두 개 */}
      <div className="mt-4 flex flex-col gap-3 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <span />
        {mentors ? <Pagination page={shownPage} total={mentors.length} pageSize={PAGE_SIZE} onChange={setPage} className="" /> : <span />}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => openEditor({ mode: "edit", initial: selected })}
            disabled={!mentors || mentors.length === 0}
            className={pillButton}
          >
            멘토 수정
          </button>
          <button type="button" onClick={() => openEditor({ mode: "new" })} disabled={!mentors} className={pillButton}>
            멘토 추가
          </button>
        </div>
      </div>

      {editing && (
        <MentorFormModal
          mode={editing.mode}
          mentors={mentors ?? []}
          initial={editing.mode === "edit" ? editing.initial : null}
          onClose={close}
          onSaved={handleSaved}
        />
      )}
    </AdminPage>
  );
}
