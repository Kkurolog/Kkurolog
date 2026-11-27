// 예전 확인필요 목록 주소 "/admin/review". 이제 문의 목록의 '확인 필요' 필터로 합쳐서 그쪽으로 보낸다.
// (예전 주소를 북마크했거나 문서에 적어 둔 경우를 위해 남겨 둔다)
import { redirect } from "next/navigation";

export default function ReviewRedirect() {
  redirect("/admin/inquiries?status=review");
}
