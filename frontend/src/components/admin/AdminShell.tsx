// 관리자 화면(/admin/*) 공통 틀.
// - 로그인 token 이 없으면 어느 주소로 들어와도 로그인 화면(AdminLogin)만 보여준다.
// - 로그인했으면 왼쪽 관리자 사이드바(240px, 접으면 72px 아이콘 레일) + 오른쪽 페이지 내용.
// - 휴대폰·좁은 화면(md 미만)에서는 사이드바 대신 위쪽 막대에 메뉴 아이콘을 둔다.
// - 확인필요 답장 수(사이드바 배지)는 AdminContext 로 각 페이지와 나눠 쓴다.
// 진짜 보안은 backend 가 지킨다. 여기서 막는 건 화면뿐이다.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, Suspense, useCallback, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { fetchReview, getToken, logout, subscribeAuth } from "@/lib/adminApi";
import Logo from "../Logo";
import { AlertIcon, InboxIcon, LogoutIcon, MailIcon, SidebarIcon, UserIcon } from "../icons";
import AdminLogin from "./AdminLogin";

type AdminContextValue = {
  reviewTotal: number | null; // 확인필요 답장 수 (모르면 null)
  setReviewTotal: (n: number) => void;
  refreshReviewTotal: () => void;
};

const AdminContext = createContext<AdminContextValue>({
  reviewTotal: null,
  setReviewTotal: () => {},
  refreshReviewTotal: () => {},
});

export function useAdmin() {
  return useContext(AdminContext);
}

const MENU = [
  { href: "/admin/inquiries", label: "문의 목록", Icon: InboxIcon },
  { href: "/admin/review", label: "확인필요 목록", Icon: AlertIcon, badge: true },
  { href: "/admin/mentors", label: "멘토 목록", Icon: UserIcon },
  { href: "/admin/settings", label: "메일 설정", Icon: MailIcon },
] as const;

// 서버에서 그릴 때는 로그인 여부를 알 수 없으므로 undefined (아무것도 그리지 않음)
const getServerToken = () => undefined;

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const token = useSyncExternalStore(subscribeAuth, getToken, getServerToken);
  if (token === undefined) return null;
  if (!token) return <AdminLogin />;
  // SignedIn 은 주소(usePathname)를 읽는다. 실행할 때만 아는 값이라 Suspense 로 감싼다 (cacheComponents 규칙)
  return (
    <Suspense fallback={null}>
      <SignedIn>{children}</SignedIn>
    </Suspense>
  );
}

function SignedIn({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(true); // 사이드바 펼침
  const [reviewTotal, setReviewTotal] = useState<number | null>(null);

  const refreshReviewTotal = useCallback(() => {
    fetchReview({ page: 1, pageSize: 1 })
      .then((page) => setReviewTotal(page.total))
      .catch(() => {}); // 배지는 못 받아와도 화면은 그대로 쓴다 (401 이면 알아서 로그인 화면으로)
  }, []);

  // 페이지를 옮길 때마다 배지 숫자를 새로 받는다
  useEffect(() => {
    refreshReviewTotal();
  }, [pathname, refreshReviewTotal]);

  return (
    <AdminContext.Provider value={{ reviewTotal, setReviewTotal, refreshReviewTotal }}>
      <div className="flex min-h-dvh w-full flex-col bg-canvas md:flex-row">
        {/* 넓은 화면: 왼쪽 사이드바 */}
        <aside
          className={`sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-sky py-6 md:flex ${
            open ? "w-60 px-4" : "w-[72px] items-center px-3"
          }`}
        >
          <div className={`mb-8 flex items-center ${open ? "justify-between pl-1" : "flex-col gap-4"}`}>
            <Link href="/admin/inquiries" className="flex items-center gap-2.5 rounded-xl" aria-label="관리자 첫 화면">
              <Logo className="size-9" />
              {open && <span className="text-[15px] font-bold text-ink">관리자</span>}
            </Link>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "사이드바 접기" : "사이드바 펼치기"}
              aria-expanded={open}
              className="flex size-9 items-center justify-center rounded-xl text-body hover:bg-surface hover:text-brand"
            >
              <SidebarIcon className="size-5" />
            </button>
          </div>

          <nav aria-label="관리자 메뉴" className="flex flex-col gap-1">
            {MENU.map((item) => {
              const active = pathname.startsWith(item.href);
              const count = "badge" in item && reviewTotal ? reviewTotal : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  title={open ? undefined : item.label}
                  className={`relative flex h-11 items-center gap-3 rounded-[14px] text-[14px] transition-colors ${
                    open ? "px-3" : "w-11 justify-center"
                  } ${active ? "bg-surface font-bold text-brand shadow-[0_1px_0_var(--color-line)]" : "text-body hover:bg-surface/70 hover:text-brand"}`}
                >
                  <item.Icon className="size-5 shrink-0" />
                  {open && <span className="flex-1">{item.label}</span>}
                  {count > 0 && (
                    <span
                      aria-label={`확인필요 ${count}건`}
                      className={`rounded-full bg-butter text-[11px] font-bold text-ink ${
                        open ? "min-w-6 px-1.5 py-0.5 text-center" : "absolute -top-1 -right-1 min-w-5 px-1 text-center leading-5"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={logout}
            title={open ? undefined : "로그아웃"}
            className={`mt-auto flex h-11 items-center gap-3 rounded-[14px] text-[14px] text-body hover:bg-surface/70 hover:text-brand ${
              open ? "px-3" : "w-11 justify-center"
            }`}
          >
            <LogoutIcon className="size-5 shrink-0" />
            {open && "로그아웃"}
          </button>
        </aside>

        {/* 좁은 화면: 위쪽 막대 */}
        <header className="sticky top-0 z-30 flex items-center gap-1 border-b border-line bg-sky px-3 pt-[env(safe-area-inset-top)] md:hidden">
          <Link href="/admin/inquiries" className="mr-auto flex items-center gap-2 py-2" aria-label="관리자 첫 화면">
            <Logo className="size-8" />
            <span className="text-[14px] font-bold text-ink">관리자</span>
          </Link>
          <nav aria-label="관리자 메뉴" className="flex items-center">
            {MENU.map((item) => {
              const active = pathname.startsWith(item.href);
              const count = "badge" in item && reviewTotal ? reviewTotal : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex size-11 items-center justify-center rounded-xl ${
                    active ? "bg-surface text-brand" : "text-body"
                  }`}
                >
                  <item.Icon className="size-5" />
                  {count > 0 && (
                    <span className="absolute top-1 right-0.5 min-w-4 rounded-full bg-butter px-1 text-center text-[10px] leading-4 font-bold text-ink">
                      {count}
                    </span>
                  )}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={logout}
              aria-label="로그아웃"
              className="flex size-11 items-center justify-center rounded-xl text-body"
            >
              <LogoutIcon className="size-5" />
            </button>
          </nav>
        </header>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </AdminContext.Provider>
  );
}
