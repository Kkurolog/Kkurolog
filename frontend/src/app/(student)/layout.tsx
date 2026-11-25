// 학생 화면 공통 틀 (주소에는 나타나지 않는 묶음 '(student)': "/", "/mentors")
// 넓은 화면: 왼쪽 사이드바(NavBar, 닫히면 아이콘만 있는 72px 레일) + 오른쪽 페이지 내용
// 휴대폰(sm 미만): 위쪽 얇은 막대(로고 + 메뉴 버튼) + 아래 페이지 내용. 메뉴를 누르면 사이드바가 왼쪽에서 나온다
// ChatProvider: 대화 내용을 페이지를 옮겨 다녀도 유지하고, 사이드바의 '새 채팅'에서도 쓸 수 있게 한다.
// 관리자 화면(/admin)은 이 묶음 밖이라 학생 사이드바·대화 상태가 처음부터 없다.
import NavBar from "@/components/NavBar";
import { ChatProvider } from "@/lib/useChat";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <ChatProvider>
      <div className="flex min-h-dvh flex-col sm:flex-row">
        <NavBar />
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </ChatProvider>
  );
}
