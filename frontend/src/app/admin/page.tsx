// "/admin" 으로 들어오면 문의 목록으로 보낸다 (로그인 전이면 AdminShell 이 로그인 화면을 먼저 보여준다)
import { redirect } from "next/navigation";

export default function AdminHome() {
  redirect("/admin/inquiries");
}
