// 관리자 화면에서 여러 번 쓰는 작은 조각들: 페이지 제목, 답장 상태 pill, 쪽 번호, 오류 안내, 표 칸 스타일
"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "../icons";

// 페이지 바깥 여백 + 최대 너비 (Figma: 사이드바 오른쪽 48px, 내용 944px)
export function AdminPage({ children }: { children: React.ReactNode }) {
  return (
    <main className="w-full px-4 pt-8 pb-16 sm:px-8 md:px-12 md:pt-12">
      <div className="mx-auto flex w-full max-w-[944px] flex-col">{children}</div>
    </main>
  );
}

export function PageTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-8 flex flex-col gap-2">
      <h1 className="font-display text-[30px] leading-10 text-brand md:text-[36px] md:leading-[48px]">{children}</h1>
      {sub && <p className="text-[13px] text-muted">{sub}</p>}
    </div>
  );
}

// 멘토 답변 여부: 답장 받음(채움) / 답장 전(테두리)
export function StatusPill({ replied }: { replied: boolean }) {
  return replied ? (
    <span className="inline-flex h-6 items-center rounded-full border border-brand bg-brand px-3 text-[12px] font-bold whitespace-nowrap text-white">
      답장 받음
    </span>
  ) : (
    <span className="inline-flex h-6 items-center rounded-full border border-brand bg-surface px-3 text-[12px] font-bold whitespace-nowrap text-brand">
      답장 전
    </span>
  );
}

// 불러오기 실패 등 오류 한 줄
export function ErrorNotice({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-2xl border border-danger/40 bg-surface px-4 py-3 text-[14px] text-danger">
      {message}
    </p>
  );
}

// 표 공통 스타일: 게시판 모양 (흰 박스 없이 위쪽 굵은 파란 선 + 줄마다 구분선 + 아래 마감선)
// 목록이 길어지면 아래 쪽 번호(Pagination)로 넘긴다. 머리줄 연한 글자, 줄 높이 48px.
export const th = "h-11 px-3 text-left text-[12px] font-medium whitespace-nowrap text-muted";
export const td = "h-12 px-3 text-[13px] text-ink";
export const tableWrap = "w-full overflow-x-auto border-t-2 border-b border-t-brand border-b-line";
export const rowLink =
  "cursor-pointer border-t border-line transition-colors hover:bg-sky focus-visible:bg-sky focus-visible:outline-none";

// 쪽 번호: < 1 2 3 … 7 >  (지금 쪽 앞뒤 1쪽 + 처음·끝만 보여준다)
export function Pagination({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (last <= 1) return null;

  const pages: (number | "gap")[] = [];
  for (let p = 1; p <= last; p++) {
    if (p === 1 || p === last || Math.abs(p - page) <= 1) pages.push(p);
    else if (pages[pages.length - 1] !== "gap") pages.push("gap");
  }

  const circle = "flex size-8 items-center justify-center rounded-full text-[13px]";
  return (
    <nav aria-label="쪽 번호" className="mt-6 flex items-center justify-center gap-1">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="이전 쪽"
        className={`${circle} text-body hover:bg-sky disabled:text-line disabled:hover:bg-transparent`}
      >
        <ChevronLeftIcon className="size-4" />
      </button>
      {pages.map((p, i) =>
        p === "gap" ? (
          <span key={`gap-${i}`} className={`${circle} text-muted`} aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? "page" : undefined}
            className={`${circle} ${p === page ? "bg-brand font-bold text-white" : "text-body hover:bg-sky"}`}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= last}
        aria-label="다음 쪽"
        className={`${circle} text-body hover:bg-sky disabled:text-line disabled:hover:bg-transparent`}
      >
        <ChevronRightIcon className="size-4" />
      </button>
    </nav>
  );
}
