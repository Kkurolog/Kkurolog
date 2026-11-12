// 모든 페이지에 보이는 메뉴: 질문하기(/) / 멘토 찾기(/mentors)
// + 지금 보이는 데이터가 가짜(demo)라는 안내.
// 넓은 화면(lg 이상)에서는 왼쪽 세로 메뉴, 좁은 화면에서는 위쪽 가로 메뉴로 보인다.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChatIcon, PeopleIcon } from "./icons";

const LINKS = [
  { href: "/", label: "질문하기", Icon: ChatIcon },
  { href: "/mentors", label: "멘토 찾기", Icon: PeopleIcon },
];

export default function NavBar() {
  const pathname = usePathname(); // 지금 주소. 현재 메뉴를 강조하는 데 쓴다

  return (
    <header className="border-b border-line bg-white lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0 lg:border-r lg:border-b-0">
      <div className="flex h-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 lg:flex-col lg:flex-nowrap lg:items-stretch lg:gap-6 lg:px-4 lg:py-6">
        <Link href="/" className="flex items-center gap-2.5 px-2 text-xl font-bold text-ink">
          <span className="inline-flex size-8 items-center justify-center rounded-[9px] bg-brand text-white">
            <ChatIcon className="size-4" />
          </span>
          꾸로록
        </Link>

        <nav className="flex gap-1 lg:flex-col">
          {LINKS.map(({ href, label, Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "flex min-h-11 items-center gap-2.5 rounded-[10px] bg-mint px-3 text-sm font-semibold text-brand"
                    : "flex min-h-11 items-center gap-2.5 rounded-[10px] px-3 text-sm text-body hover:bg-canvas"
                }
              >
                <Icon className="size-[18px]" />
                {label}
              </Link>
            );
          })}
        </nav>

        <p className="w-full rounded-[10px] bg-canvas p-3 text-xs leading-relaxed text-muted lg:mt-auto">
          지금 보이는 답변·멘토는 모두 가짜(demo) 데이터이며 실존 인물이 아니에요.
        </p>
      </div>
    </header>
  );
}
