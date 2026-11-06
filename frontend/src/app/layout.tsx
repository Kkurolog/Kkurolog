// 모든 페이지를 감싸는 공통 틀 (html, body, 글꼴, 배경색 등)
import type { Metadata } from "next";
import NavBar from "@/components/NavBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "꾸로록",
  description: "거꾸로캠퍼스 사람들의 경험을 질문으로 꺼내보는 서비스",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full bg-gray-50 text-gray-900">
        <NavBar />
        {children}
      </body>
    </html>
  );
}
