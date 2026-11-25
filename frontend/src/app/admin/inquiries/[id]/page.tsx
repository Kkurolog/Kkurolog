// 문의 상세 전체 화면 (주소 "/admin/inquiries/q20261117-0001", 와이어프레임 04-3-1)
// 옆 패널의 ⤢ 아이콘으로 들어온다. 위쪽 '문의 목록' 링크로 목록에 돌아간다.
// 주소의 문의번호(useParams)는 실행할 때만 알 수 있는 값이라 Suspense 로 감싼다
// (next.config 의 cacheComponents: 감싸지 않으면 build 의 미리 만들기 단계에서 멈춘다).
"use client";

import { useParams } from "next/navigation";
import { Suspense } from "react";
import InquiryDetailView from "@/components/admin/InquiryDetailView";

export default function InquiryFullPage() {
  return (
    <main className="w-full px-4 pt-8 pb-16 sm:px-8 md:px-12">
      <div className="mx-auto w-full max-w-[944px]">
        <Suspense fallback={<p className="text-[14px] text-muted">불러오는 중…</p>}>
          <Detail />
        </Suspense>
      </div>
    </main>
  );
}

function Detail() {
  const { id } = useParams<{ id: string }>();
  return <InquiryDetailView id={decodeURIComponent(id)} mode="page" />;
}
