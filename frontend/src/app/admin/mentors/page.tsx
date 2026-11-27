// 관리자 멘토 목록 (주소 "/admin/mentors", 와이어프레임 04-5)
// 참여 동의하지 않은 멘토와 메일 주소까지 모두 보인다 (관리자만).
// '연락 가능'은 읽기 전용 체크 표시. 바꾸려면 '수정'을 누른다.
// '삭제'는 문의 기록이 없는 멘토만 된다 (기록이 있으면 backend 가 409 로 막고, 연락 가능을 끄라고 안내한다).
"use client";

import { useCallback, useEffect, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import MentorFormModal from "@/components/admin/MentorFormModal";
import { AdminPage, ErrorNotice, PageTitle, tableWrap, td, th } from "@/components/admin/ui";
import { AdminApiError, deleteMentor, fetchAdminMentors, type AdminMentor } from "@/lib/adminApi";

export default function AdminMentorsPage() {
  const [mentors, setMentors] = useState<AdminMentor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 열린 창: "new" = 추가, 멘토 = 수정, null = 닫힘
  const [editing, setEditing] = useState<AdminMentor | "new" | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [toDelete, setToDelete] = useState<AdminMentor | null>(null); // 삭제 확인 창
  const [deleting, setDeleting] = useState(false);

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
    setNotice({ text: editing === "new" ? `'${saved.name}' 멘토를 추가했어요.` : `'${saved.name}' 멘토 정보를 저장했어요.`, error: false });
    setEditing(null);
  }

  async function handleDelete() {
    if (!toDelete) return;
    const mentor = toDelete;
    setDeleting(true);
    try {
      await deleteMentor(mentor.id);
      setMentors((list) => list?.filter((m) => m.id !== mentor.id) ?? null);
      setNotice({ text: `'${mentor.name}' 멘토를 삭제했어요.`, error: false });
    } catch (err) {
      setNotice({ text: err instanceof AdminApiError ? err.message : "삭제하지 못했어요.", error: true });
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  }

  return (
    <AdminPage>
      <PageTitle>멘토 목록</PageTitle>

      {notice && (
        <p
          role={notice.error ? "alert" : "status"}
          className={`mb-4 rounded-2xl px-4 py-3 text-[13px] ${notice.error ? "border border-danger/40 bg-surface text-danger" : "bg-sky text-ink"}`}
        >
          {notice.text}
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
              <col className="w-[160px]" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className={th}>멘토 ID</th>
                <th scope="col" className={th}>이름</th>
                <th scope="col" className={th}>엑시트 연도</th>
                <th scope="col" className={th}>메일 주소</th>
                <th scope="col" className={`${th} text-center`}>연락 가능</th>
                <th scope="col" className={th}>
                  <span className="sr-only">수정·삭제</span>
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
                  <td className={`${td} text-right whitespace-nowrap`}>
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
                    <button
                      type="button"
                      onClick={() => {
                        setNotice(null);
                        setToDelete(m);
                      }}
                      aria-label={`${m.name} 삭제`}
                      className="ml-1.5 h-8 rounded-full px-3 text-[12px] text-muted hover:bg-sky hover:text-danger-dark"
                    >
                      삭제
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
      {toDelete && (
        <ConfirmDialog
          title="이 멘토를 삭제할까요?"
          body="삭제한 멘토는 학생 화면과 이 목록에서 사라지고, 되돌릴 수 없어요. 학생 문의 기록이 있는 멘토는 지울 수 없어요 (쉬게 하려면 '수정'에서 연락 가능을 꺼 주세요)."
          detail={`${toDelete.name} (${toDelete.id})`}
          tone="danger"
          cancelLabel="취소"
          confirmLabel={deleting ? "삭제하는 중…" : "삭제"}
          onCancel={() => !deleting && setToDelete(null)}
          onConfirm={() => !deleting && handleDelete()}
        />
      )}
    </AdminPage>
  );
}
