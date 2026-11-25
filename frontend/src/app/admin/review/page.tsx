// 확인필요 목록 (주소 "/admin/review", 와이어프레임 04-4)
// 학생에게 자동으로 전달하지 못한 멘토 답장. 관리자는 중계 Gmail 의 '메일자동화/확인필요' 라벨에서 원문을 보고 처리한다.
// 문의번호가 있는 줄을 누르면 그 문의의 전체 화면 상세로 간다.
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { AdminPage, ErrorNotice, PageTitle, Pagination, rowLink, tableWrap, td, th } from "@/components/admin/ui";
import { AlertIcon } from "@/components/icons";
import { AdminApiError, fetchReview, formatDateTime, PAGE_SIZE, reasonLabel, type Paged, type ReviewItem } from "@/lib/adminApi";

export default function ReviewPage() {
  const router = useRouter();
  const { setReviewTotal } = useAdmin();
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ page: number; data?: Paged<ReviewItem>; error?: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchReview({ page })
      .then((data) => {
        if (!alive) return;
        setResult({ page, data });
        setReviewTotal(data.total); // 사이드바 배지도 같은 숫자로
      })
      .catch((err) => alive && setResult({ page, error: err instanceof AdminApiError ? err.message : "확인필요 목록을 불러오지 못했어요." }));
    return () => {
      alive = false;
    };
  }, [page, setReviewTotal]);

  const current = result?.page === page ? result : null;
  const open = (id: string | null) => id && router.push(`/admin/inquiries/${encodeURIComponent(id)}`);

  return (
    <AdminPage>
      <PageTitle>확인필요 목록</PageTitle>

      <div className="mb-8 flex items-start gap-3 rounded-2xl bg-butter px-5 py-4 text-[13px] leading-5 text-ink">
        <AlertIcon className="mt-px size-5 shrink-0 text-brand" />
        <p>
          학생에게 자동으로 전달하지 못한 답장이에요. 중계 Gmail 메일함(라벨 메일자동화/확인필요)에서 원문을 보고 처리해 주세요.
          <span className="mt-1 block text-[12px] text-body">&lsquo;추가 대화&rsquo; 표시는 첫 답장 이후 이어진 대화에서 온 메일이에요. 본문을 저장하지 않아 Gmail에서만 볼 수 있어요.</span>
        </p>
      </div>

      {current?.error ? (
        <ErrorNotice message={current.error} />
      ) : (
        <div className={tableWrap}>
          <table className="w-full min-w-[820px] table-fixed">
            <colgroup>
              <col className="w-[150px]" />
              <col className="w-[140px]" />
              <col className="w-[200px]" />
              <col className="w-[250px]" />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className={th}>문의번호</th>
                <th scope="col" className={th}>받은 시각</th>
                <th scope="col" className={th}>보낸 주소</th>
                <th scope="col" className={th}>이유</th>
                <th scope="col" className={th}>메일 제목</th>
              </tr>
            </thead>
            <tbody>
              {!current && (
                <tr className="border-t border-line">
                  <td colSpan={5} className={`${td} text-center text-muted`}>불러오는 중…</td>
                </tr>
              )}
              {current?.data?.items.length === 0 && (
                <tr className="border-t border-line">
                  <td colSpan={5} className={`${td} text-center text-muted`}>확인이 필요한 답장이 없어요.</td>
                </tr>
              )}
              {current?.data?.items.map((item) => (
                <tr
                  key={item.message_id}
                  tabIndex={item.inquiry_id ? 0 : undefined}
                  onClick={() => open(item.inquiry_id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") open(item.inquiry_id);
                  }}
                  className={item.inquiry_id ? rowLink : "border-t border-line"}
                >
                  <td className={`${td} font-medium`}>{item.inquiry_id ?? "—"}</td>
                  <td className={`${td} text-body`}>{formatDateTime(item.received_at)}</td>
                  <td className={`${td} truncate`} title={item.from_email}>{item.from_email}</td>
                  <td className={td}>
                    <span className="flex min-w-0 items-center gap-1.5">
                      {item.followup && (
                        <span
                          className="shrink-0 rounded-full bg-sky px-2 text-[11px] leading-5 font-bold text-brand"
                          title="첫 답장 이후 이어진 대화에서 온 메일이에요. 본문은 저장하지 않아 Gmail에서 확인해야 해요."
                        >
                          추가 대화
                        </span>
                      )}
                      <span className="truncate">{reasonLabel(item.reason)}</span>
                    </span>
                  </td>
                  <td className={`${td} truncate`} title={item.inquiry_title ?? undefined}>{item.inquiry_title ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {current?.data && <Pagination page={page} total={current.data.total} pageSize={PAGE_SIZE} onChange={setPage} />}
    </AdminPage>
  );
}
