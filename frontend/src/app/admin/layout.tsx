// 관리자 화면(/admin/*) 공통 틀.
// - 검색엔진에 나오지 않게 noindex. 학생 화면 어디에도 이 주소로 가는 링크를 두지 않는다.
// - 학생용 사이드바(NavBar)는 /admin 에서 스스로 숨는다. 로그인·관리자 사이드바는 AdminShell 이 그린다.
import type { Metadata } from "next";
import AdminShell from "@/components/admin/AdminShell";

export const metadata: Metadata = {
  title: "꾸로록 관리자",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <AdminShell>{children}</AdminShell>;
}
