// 모든 페이지를 감싸는 공통 틀 (html, body, 글꼴, 배경색 등)
// 넓은 화면: 왼쪽에 메뉴(NavBar), 오른쪽에 각 페이지 내용
// 좁은 화면(휴대폰): 위쪽에 메뉴, 아래에 페이지 내용
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
      <body className="min-h-full bg-canvas text-ink">
        <div className="flex min-h-screen flex-col lg:flex-row">
          <NavBar />
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </div>
      </body>
    </html>
  );
}
