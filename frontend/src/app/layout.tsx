// 모든 페이지를 감싸는 공통 틀 (html, body, 글꼴, 배경색 등)
// 학생 화면의 사이드바·대화 상태는 app/(student)/layout.tsx, 관리자 화면의 틀은 app/admin/layout.tsx 에 있다.
import type { Metadata, Viewport } from "next";
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
        {children}
      </body>
    </html>
  );
}
