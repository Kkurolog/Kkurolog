// 모든 페이지를 감싸는 공통 틀 (html, body, 글꼴, 배경색 등)
// 왼쪽: 사이드바(NavBar, 닫히면 아이콘만 있는 72px 레일) / 오른쪽: 각 페이지 내용
// ChatProvider: 대화 내용을 페이지를 옮겨 다녀도 유지하고, 사이드바의 '새 채팅'에서도 쓸 수 있게 한다.
import type { Metadata } from "next";
import NavBar from "@/components/NavBar";
import { ChatProvider } from "@/lib/useChat";
import "./globals.css";

export const metadata: Metadata = {
  title: "꾸로록",
  description: "거꾸로캠퍼스 선배들의 이야기로 답하는 진로 상담 챗봇",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full bg-canvas font-sans text-ink">
        <ChatProvider>
          <div className="flex min-h-screen">
            <NavBar />
            <div className="flex min-w-0 flex-1 flex-col">{children}</div>
          </div>
        </ChatProvider>
      </body>
    </html>
  );
}
