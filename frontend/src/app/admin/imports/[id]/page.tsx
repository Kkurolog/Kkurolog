// 인터뷰 넣기: 파일 하나 검토 화면 (주소 "/admin/imports/imp-20261125-a1b2c3")
// 주소의 파일 번호(useParams)는 실행할 때만 알 수 있는 값이라 Suspense 로 감싼다 (next.config 의 cacheComponents 규칙).
"use client";

import { useParams } from "next/navigation";
import { Suspense } from "react";
import ImportReview from "@/components/admin/ImportReview";

export default function ImportReviewPage() {
  return (
    <Suspense fallback={<p className="px-8 pt-8 text-[14px] text-muted">불러오는 중…</p>}>
      <Review />
    </Suspense>
  );
}

function Review() {
  const { id } = useParams<{ id: string }>();
  return <ImportReview id={decodeURIComponent(id)} />;
}
