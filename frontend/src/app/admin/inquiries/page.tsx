// 관리자 문의 목록 (주소 "/admin/inquiries", 와이어프레임 04-2, 상세 패널 04-3)
// 위: 전체 / 답장 전 / 확인필요 숫자 카드 → 필터(전체·답장 전·답장 받음·확인 필요) → 표(20개씩) → 쪽 번호
// '확인 필요' 필터는 자동 전달 못 한 멘토 답장 표(ReviewTable)로 바뀐다 (예전 /admin/review 화면을 여기로 옮김).
// 줄을 누르면 오른쪽에 문의 상세 패널이 열린다. 패널의 ⤢ 아이콘은 전체 화면(/admin/inquiries/[id])으로.
// 필터·쪽·열린 문의는 주소(?status=&page=&open=)에 남겨서 새로고침·뒤로 가기에도 그대로 돌아온다.
"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import InquiryDetailView from "@/components/admin/InquiryDetailView";
import ReviewTable from "@/components/admin/ReviewTable";
import { AdminPage, ErrorNotice, PageTitle, Pagination, rowLink, StatusPill, tableWrap, td, th } from "@/components/admin/ui";
import { AdminApiError, fetchInquiries, formatDateTime, PAGE_SIZE, type InquiryItem, type Paged } from "@/lib/adminApi";

type Filter = "all" | "pending" | "replied" | "review";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "pending", label: "답장 전" },
  { value: "replied", label: "답장 받음" },
  { value: "review", label: "확인 필요" },
];
type InquiryFilter = Exclude<Filter, "review">;
const REPLIED: Record<InquiryFilter, boolean | undefined> = { all: undefined, pending: false, replied: true };

export default function InquiriesPage() {
  // useSearchParams 를 쓰는 화면은 Suspense 로 감싸야 한다 (Next.js 규칙)
  return (
    <Suspense fallback={null}>
      <Inquiries />
    </Suspense>
  );
}

function Inquiries() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { reviewTotal } = useAdmin();

  const filter: Filter = (["pending", "replied", "review"] as const).find((f) => f === params.get("status")) ?? "all";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const openId = params.get("open");

  const [list, setList] = useState<{ key: string; data?: Paged<InquiryItem>; error?: string } | null>(null);
  const [counts, setCounts] = useState<{ all: number; pending: number } | null>(null);

  // 주소의 일부만 바꾼다 (값이 null 이면 지움)
  const setQuery = useCallback(
    (next: Partial<Record<"status" | "page" | "open", string | null>>) => {
      const q = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v === null || v === undefined) q.delete(k);
        else q.set(k, v);
      }
      const s = q.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  // 표 내용 (필터·쪽이 바뀔 때마다). '확인 필요'는 ReviewTable 이 따로 불러온다
  const key = `${filter}-${page}`;
  useEffect(() => {
    if (filter === "review") return;
    let alive = true;
    fetchInquiries({ replied: REPLIED[filter], page })
      .then((data) => alive && setList({ key, data }))
      .catch((err) => alive && setList({ key, error: err instanceof AdminApiError ? err.message : "문의 목록을 불러오지 못했어요." }));
    return () => {
      alive = false;
    };
  }, [filter, page, key]);

  // 숫자 카드 (전체·답장 전). 확인필요 숫자는 사이드바 배지와 같은 값을 쓴다
  useEffect(() => {
    Promise.all([fetchInquiries({ pageSize: 1 }), fetchInquiries({ replied: false, pageSize: 1 })])
      .then(([all, pending]) => setCounts({ all: all.total, pending: pending.total }))
      .catch(() => {}); // 숫자는 못 받아와도 표는 보여준다
  }, []);

  // Esc 로 상세 패널 닫기
  useEffect(() => {
    if (!openId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setQuery({ open: null });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId, setQuery]);

  const current = list?.key === key ? list : null;

  return (
    <>
      <AdminPage>
        <PageTitle>문의 목록</PageTitle>

        {/* 숫자 카드 */}
        <div className="grid grid-cols-3 gap-3 md:gap-4">
          <SummaryCard label="전체" value={counts?.all} />
          <SummaryCard label="답장 전" value={counts?.pending} />
          <SummaryCard label="확인필요" value={reviewTotal ?? undefined} href="/admin/inquiries?status=review" />
        </div>

        {/* 필터 */}
        <div role="group" aria-label="문의 거르기" className="mt-8 mb-4 flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setQuery({ status: f.value === "all" ? null : f.value, page: null })}
              className={`h-9 rounded-full border px-4 text-[13px] transition-colors ${
                filter === f.value ? "border-brand bg-brand font-bold text-white" : "border-line bg-surface text-body hover:border-brand hover:text-brand"
              }`}
            >
              {f.label}
              {f.value === "review" && !!reviewTotal && (
                <span
                  aria-label={`${reviewTotal}건`}
                  className="ml-1.5 inline-block min-w-5 rounded-full bg-butter px-1.5 text-center text-[11px] leading-5 font-bold text-ink"
                >
                  {reviewTotal}
                </span>
              )}
            </button>
          ))}
        </div>

        {filter === "review" && (
          <ReviewTable
            page={page}
            openId={openId}
            onPageChange={(p) => setQuery({ page: p === 1 ? null : String(p) })}
            onOpen={(id) => setQuery({ open: id })}
          />
        )}

        {filter !== "review" && current?.error && <ErrorNotice message={current.error} />}

        {filter !== "review" && !current?.error && (
          <div className={tableWrap}>
            <table className="w-full min-w-[820px] table-fixed">
              <colgroup>
                <col className="w-[150px]" />
                <col className="w-[150px]" />
                <col className="w-[110px]" />
                <col className="w-[110px]" />
                <col />
                <col className="w-[130px]" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col" className={th}>문의번호</th>
                  <th scope="col" className={th}>보낸 일시</th>
                  <th scope="col" className={th}>학생 이름</th>
                  <th scope="col" className={th}>멘토 이름</th>
                  <th scope="col" className={th}>메일 제목</th>
                  <th scope="col" className={th}>멘토 답변 여부</th>
                </tr>
              </thead>
              <tbody>
                {!current && (
                  <tr className="border-t border-line">
                    <td colSpan={6} className={`${td} text-center text-muted`}>
                      불러오는 중…
                    </td>
                  </tr>
                )}
                {current?.data?.items.length === 0 && (
                  <tr className="border-t border-line">
                    <td colSpan={6} className={`${td} text-center text-muted`}>
                      {filter === "all" ? "아직 들어온 문의가 없어요." : "해당하는 문의가 없어요."}
                    </td>
                  </tr>
                )}
                {current?.data?.items.map((item) => (
                  <tr
                    key={item.id}
                    tabIndex={0}
                    aria-selected={openId === item.id}
                    onClick={() => setQuery({ open: item.id })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setQuery({ open: item.id });
                      }
                    }}
                    className={`${rowLink} ${openId === item.id ? "bg-sky" : ""}`}
                  >
                    <td className={`${td} font-medium`}>{item.id}</td>
                    <td className={`${td} text-body`}>{formatDateTime(item.created_at)}</td>
                    <td className={`${td} truncate`}>{item.student_name}</td>
                    <td className={`${td} truncate`}>{item.mentor_name ?? "—"}</td>
                    <td className={`${td} truncate`} title={item.title}>
                      {item.title}
                    </td>
                    <td className={td}>
                      <StatusPill replied={item.replied} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filter !== "review" && current?.data && (
          <Pagination page={page} total={current.data.total} pageSize={PAGE_SIZE} onChange={(p) => setQuery({ page: p === 1 ? null : String(p) })} />
        )}
      </AdminPage>

      {/* 문의 상세 옆 패널 (넓은 화면 600px, 좁은 화면은 꽉 차게) */}
      {openId && (
        <>
          <div className="fixed inset-0 z-40 bg-ink/20 motion-safe:animate-fade-in lg:hidden" onClick={() => setQuery({ open: null })} aria-hidden="true" />
          <aside
            aria-label="문의 상세"
            className="fixed inset-y-0 right-0 z-50 w-full max-w-[600px] overflow-y-auto border-l border-line bg-surface px-6 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(2.5rem+env(safe-area-inset-bottom))] shadow-[-12px_0_32px_rgba(11,37,89,0.08)] motion-safe:animate-slide-right sm:px-10"
          >
            <InquiryDetailView id={openId} mode="panel" onClose={() => setQuery({ open: null })} />
          </aside>
        </>
      )}
    </>
  );
}

function SummaryCard({ label, value, href }: { label: string; value?: number; href?: string }) {
  const inner = (
    <>
      <span className="text-[13px] text-body">{label}</span>
      <span className="text-[26px] leading-9 font-bold text-ink md:text-[32px] md:leading-10">{value ?? "–"}</span>
    </>
  );
  const cls = "flex h-24 flex-col justify-center gap-1 rounded-[20px] border border-line bg-surface px-5";
  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:border-brand`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
