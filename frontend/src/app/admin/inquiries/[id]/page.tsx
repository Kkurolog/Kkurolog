// 예전 문의 상세 전체 화면 주소 ("/admin/inquiries/q20261117-0001").
// 상세는 이제 문의 목록 위의 팝업으로만 보므로, 이 주소로 들어오면 그 문의의 팝업이 열린 목록으로 보낸다 (예전 링크·즐겨찾기용).
// 주소의 문의번호(useParams)는 실행할 때만 알 수 있는 값이라 Suspense 로 감싼다 (next.config 의 cacheComponents 규칙).
"use client";

import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect } from "react";

export default function InquiryRedirectPage() {
  return (
    <Suspense fallback={null}>
      <Redirect />
    </Suspense>
  );
}

function Redirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/admin/inquiries?open=${encodeURIComponent(decodeURIComponent(id))}`);
  }, [id, router]);
  return <p className="px-8 pt-8 text-[14px] text-muted">문의 목록으로 가는 중…</p>;
}
