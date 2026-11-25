// 문의 상세 전체 화면 (주소 "/admin/inquiries/q20261117-0001", 와이어프레임 04-3-1)
// 옆 패널의 ⤢ 아이콘으로 들어온다. 위쪽 '문의 목록' 링크로 목록에 돌아간다.
"use client";

import { useParams } from "next/navigation";
import InquiryDetailView from "@/components/admin/InquiryDetailView";

export default function InquiryFullPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <main className="w-full px-4 pt-8 pb-16 sm:px-8 md:px-12">
      <div className="mx-auto w-full max-w-[944px]">
        <InquiryDetailView id={decodeURIComponent(id)} mode="page" />
      </div>
    </main>
  );
}
