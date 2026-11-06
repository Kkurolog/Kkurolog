// 모든 페이지 위에 보이는 내비게이션: 질문하기(/) / 멘토 찾기(/mentors)
// + 지금 보이는 데이터가 가짜(demo)라는 안내.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "질문하기" },
  { href: "/mentors", label: "멘토 찾기" },
];

export default function NavBar() {
  const pathname = usePathname(); // 지금 주소. 현재 메뉴를 진하게 표시하는 데 쓴다

  return (
    <header className="border-b border-gray-200 bg-white">
      <nav className="mx-auto flex w-full max-w-3xl items-center gap-6 px-4 py-3">
        <Link href="/" className="text-lg font-bold text-gray-900">
          꾸로록
        </Link>
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={
              pathname === link.href
                ? "text-sm font-semibold text-indigo-600"
                : "text-sm text-gray-500 hover:text-gray-800"
            }
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <p className="bg-amber-50 py-1 text-center text-xs text-amber-700">
        지금 보이는 답변·멘토는 모두 가짜(demo) 데이터이며 실존 인물이 아닙니다.
      </p>
    </header>
  );
}
