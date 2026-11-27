// 관리자 문의 목록 (주소 "/admin/inquiries", 와이어프레임 04-2, 상세 패널 04-3)
// 위: 필터(전체·답장 전·답장 받음·확인 필요, 버튼마다 건수) → 표(10개씩) → 쪽 번호. PC 한 화면에 스크롤 없이 들어가게 숫자 카드는 두지 않는다.
// '확인 필요' 필터는 자동 전달 못 한 멘토 답장 표(ReviewTable)로 바뀐다 (예전 /admin/review 화면을 여기로 옮김).
// 줄을 누르면 문의 상세 창(모달, InquiryDetailModal)이 가운데에 뜬다.
// 필터·쪽·열린 문의는 주소(?status=&page=&open=)에 남겨서 새로고침·뒤로 가기에도 그대로 돌아온다.
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import InquiryDetailModal from "@/components/admin/InquiryDetailModal";
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

  // 필터 버튼의 건수 (전체·답장 전, 답장 받음 = 전체 - 답장 전). 확인 필요 건수는 사이드바 배지와 같은 값을 쓴다
  useEffect(() => {
    Promise.all([fetchInquiries({ pageSize: 1 }), fetchInquiries({ replied: false, pageSize: 1 })])
      .then(([all, pending]) => setCounts({ all: all.total, pending: pending.total }))
      .catch(() => {}); // 숫자는 못 받아와도 표는 보여준다
  }, []);

  const current = list?.key === key ? list : null;

  return (
    <>
      <AdminPage>
        <PageTitle>문의 목록</PageTitle>

        {/* 필터 (건수 포함) */}
        <div role="group" aria-label="문의 거르기" className="mb-4 flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const count =
              f.value === "review" ? reviewTotal : counts && { all: counts.all, pending: counts.pending, replied: counts.all - counts.pending }[f.value];
            return (
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
                {f.value === "review" && count ? (
                  // 확인 필요는 처리할 일이 있다는 뜻이라 노란 배지로 눈에 띄게
                  <span aria-label={`${count}건`} className="ml-1.5 inline-block min-w-5 rounded-full bg-butter px-1.5 text-center text-[11px] leading-5 font-bold text-ink">
                    {count}
                  </span>
                ) : (
                  count != null && (
                    <span aria-label={`${count}건`} className={`ml-1.5 font-bold ${filter === f.value ? "text-white/80" : "text-muted"}`}>
                      {count}
                    </span>
                  )
                )}
              </button>
            );
          })}
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

      {/* 문의 상세 창 (주소의 ?open= 에 문의번호가 있으면 뜬다) */}
      {openId && <InquiryDetailModal id={openId} onClose={() => setQuery({ open: null })} />}
    </>
  );
}
