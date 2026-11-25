// 관리자 멘토 목록 (주소 "/admin/mentors", 와이어프레임 04-5)
// 참여 동의하지 않은 멘토와 메일 주소까지 모두 보인다 (관리자만).
// '연락 가능'은 읽기 전용 체크 표시. 바꾸려면 '수정'을 누른다. 멘토는 지울 수 없다.
"use client";

import { useCallback, useEffect, useState } from "react";
import MentorFormModal from "@/components/admin/MentorFormModal";
import { AdminPage, ErrorNotice, PageTitle, tableWrap, td, th } from "@/components/admin/ui";
import { AdminApiError, fetchAdminMentors, type AdminMentor } from "@/lib/adminApi";

export default function AdminMentorsPage() {
  const [mentors, setMentors] = useState<AdminMentor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 열린 창: "new" = 추가, 멘토 = 수정, null = 닫힘
  const [editing, setEditing] = useState<AdminMentor | "new" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
    setNotice(editing === "new" ? `'${saved.name}' 멘토를 추가했어요.` : `'${saved.name}' 멘토 정보를 저장했어요.`);
    setEditing(null);
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
              <col className="w-[110px]" />
              <col className="w-[180px]" />
              <col className="w-[100px]" />
              <col />
              <col className="w-[90px]" />
              <col className="w-[96px]" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className={th}>멘토 ID</th>
                <th scope="col" className={th}>이름</th>
                <th scope="col" className={th}>엑시트 연도</th>
                <th scope="col" className={th}>메일 주소</th>
                <th scope="col" className={`${th} text-center`}>연락 가능</th>
                <th scope="col" className={th}>
                  <span className="sr-only">수정</span>
                </th>
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
              {mentors?.map((m) => (
                <tr key={m.id} className="border-t border-line">
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
                    {/* 읽기 전용: 바꾸려면 '수정' */}
                    <input
                      type="checkbox"
                      checked={m.available}
                      readOnly
                      disabled
                      aria-label={m.available ? "연락 가능" : "연락 불가"}
                      className="size-4 align-middle accent-brand opacity-60"
                    />
                  </td>
                  <td className={`${td} text-right`}>
                    <button
                      type="button"
                      onClick={() => {
                        setNotice(null);
                        setEditing(m);
                      }}
                      aria-label={`${m.name} 수정`}
                      className="h-8 rounded-full border border-brand px-4 text-[12px] font-bold text-brand hover:bg-sky"
                    >
                      수정
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6">
        <button
          type="button"
          onClick={() => {
            setNotice(null);
            setEditing("new");
          }}
          disabled={!mentors}
          className="h-11 rounded-full bg-brand px-6 text-[14px] font-bold text-white hover:bg-brand-dark disabled:bg-line disabled:text-muted"
        >
          멘토 추가
        </button>
      </div>

      {editing && <MentorFormModal key={editing === "new" ? "new" : editing.id} mentor={editing === "new" ? undefined : editing} onClose={close} onSaved={handleSaved} />}
    </AdminPage>
  );
}
