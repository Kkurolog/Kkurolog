// 예전 문의 상세 전체 화면 주소 (예: "/admin/inquiries/q20261117-0001").
// 이제 상세는 문의 목록 위의 창(모달)으로 보므로, "/admin/inquiries?open=문의번호" 로 보낸다.
// 주소의 문의번호(useParams)는 실행할 때만 알 수 있는 값이라 Suspense 로 감싼다
// (next.config 의 cacheComponents: 감싸지 않으면 build 의 미리 만들기 단계에서 멈춘다).
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
  return null;
}
