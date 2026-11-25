// 모든 페이지를 감싸는 공통 틀 (html, body, 글꼴, 배경색 등)
// 넓은 화면: 왼쪽 사이드바(NavBar, 닫히면 아이콘만 있는 72px 레일) + 오른쪽 페이지 내용
// 휴대폰(sm 미만): 위쪽 얇은 막대(로고 + 메뉴 버튼) + 아래 페이지 내용. 메뉴를 누르면 사이드바가 왼쪽에서 나온다
// ChatProvider: 대화 내용을 페이지를 옮겨 다녀도 유지하고, 사이드바의 '새 채팅'에서도 쓸 수 있게 한다.
import type { Metadata, Viewport } from "next";
import NavBar from "@/components/NavBar";
import { ChatProvider } from "@/lib/useChat";
import "./globals.css";

export const metadata: Metadata = {
  title: "꾸로록",
  description: "거꾸로캠퍼스 선배들의 이야기로 답하는 진로 상담 챗봇",
  // 링크 미리보기. 그림은 app/opengraph-image.tsx 가 만든다.
  // 그림 주소의 앞부분(도메인)은 Vercel에서 배포 주소로 자동으로 채워진다. (로컬에선 localhost)
  openGraph: { siteName: "꾸로록", locale: "ko_KR", type: "website" },
};

// viewportFit: "cover": 아이폰 노치·홈 막대 영역까지 화면을 쓰고,
// 가려지면 안 되는 곳(위쪽 막대, 입력창)에는 env(safe-area-inset-*) 여백을 따로 준다
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full bg-canvas font-sans text-ink">
        <ChatProvider>
          <div className="flex min-h-dvh flex-col sm:flex-row">
            <NavBar />
            <div className="flex min-w-0 flex-1 flex-col">{children}</div>
          </div>
        </ChatProvider>
      </body>
    </html>
  );
}
