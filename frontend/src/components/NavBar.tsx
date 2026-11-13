// 왼쪽 사이드바. 두 가지 모양이 있다.
// - 닫힘(기본, 와이어프레임 01): 72px 레일. 로고 + 아이콘(새 채팅 / 멘토 리스트). 마우스를 올리면 툴팁.
//   로고에 마우스를 올리면 '사이드바 열기' 아이콘으로 바뀌고, 누르면 사이드바가 열린다. (01-1)
// - 열림(01-4): 280px. 아이콘 + 메뉴 이름. 지금 위치한 메뉴는 연한 블루 배경. 오른쪽 위 버튼으로 닫는다.
// '새 채팅'은 진행 중인 대화가 있으면 확인 창을 먼저 띄운다. (01-6)
// 좁은 화면(lg 미만)에서는 열린 사이드바가 화면 위에 겹쳐 뜬다.
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useChat } from "@/lib/useChat";
import ConfirmDialog from "./ConfirmDialog";
import Logo from "./Logo";
import { NewChatIcon, SidebarIcon, UserIcon } from "./icons";

// 마우스를 올리거나 키보드로 초점이 가면 보이는 작은 말풍선
function Tooltip({ label, side = "right" }: { label: string; side?: "right" | "bottom" }) {
  const position = side === "right" ? "top-1/2 left-full ml-2 -translate-y-1/2" : "top-full right-0 mt-2";
  return (
    <span
      role="tooltip"
      className={`pointer-events-none absolute z-30 hidden rounded-md bg-ink px-2.5 py-1.5 text-[13px] whitespace-nowrap text-white group-hover:block group-focus-visible:block ${position}`}
    >
      {label}
    </span>
  );
}

const iconButton =
  "group relative inline-flex size-9 items-center justify-center rounded-xl text-brand hover:bg-sky focus-visible:bg-sky focus-visible:outline-none";

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { messages, reset } = useChat();
  const [open, setOpen] = useState(false);
  const [confirmNewChat, setConfirmNewChat] = useState(false);

  // '새 채팅': 대화가 있으면 확인 창, 없으면 바로 메인으로
  function handleNewChat() {
    if (messages.length > 0) {
      setConfirmNewChat(true);
    } else {
      router.push("/");
      setOpen(false);
    }
  }

  function startNewChat() {
    reset();
    setConfirmNewChat(false);
    setOpen(false);
    router.push("/");
  }

  const onChat = pathname === "/";
  const onMentors = pathname.startsWith("/mentors");

  const menuItem = (active: boolean) =>
    `flex h-11 w-full items-center gap-3 rounded-[14px] px-3 text-[15px] ${
      active ? "bg-sky font-bold text-brand" : "text-ink hover:bg-sky/60"
    }`;

  return (
    <>
      {/* 닫힌 레일 (항상 자리를 차지한다) */}
      <header className="sticky top-0 z-20 flex h-screen w-[72px] shrink-0 flex-col items-center gap-7 border-r-2 border-brand bg-canvas pt-5">
        <button type="button" onClick={() => setOpen(true)} aria-label="사이드바 열기" className={iconButton}>
          <span className="group-hover:hidden group-focus-visible:hidden">
            <Logo />
          </span>
          <SidebarIcon className="hidden size-6 group-hover:block group-focus-visible:block" />
          <Tooltip label="사이드바 열기" />
        </button>

        <nav className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={handleNewChat}
            aria-label="새 채팅"
            aria-current={onChat ? "page" : undefined}
            className={`${iconButton} ${onChat ? "bg-sky" : ""}`}
          >
            <NewChatIcon className="size-6" />
            <Tooltip label="새 채팅" />
          </button>
          <Link
            href="/mentors"
            aria-label="멘토 리스트"
            aria-current={onMentors ? "page" : undefined}
            className={`${iconButton} ${onMentors ? "bg-sky" : ""}`}
          >
            <UserIcon className="size-6" />
            <Tooltip label="멘토 리스트" />
          </Link>
        </nav>
      </header>

      {/* 열린 사이드바. 넓은 화면에서는 레일 자리를 넓혀 본문을 밀고, 좁은 화면에서는 위에 겹친다 */}
      {open && (
        <>
          <div className="fixed inset-0 z-30 bg-ink/30 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
          <aside
            aria-label="사이드바"
            className="fixed inset-y-0 left-0 z-40 flex w-[280px] flex-col border-r-2 border-brand bg-canvas lg:sticky lg:top-0 lg:z-20 lg:-ml-[72px] lg:h-screen lg:shrink-0"
          >
            <div className="flex items-center justify-between px-[18px] pt-5">
              <Link href="/" aria-label="꾸로록 메인으로" className="flex items-center gap-2.5">
                <Logo />
                <span className="font-display text-2xl text-brand">꾸로록</span>
              </Link>
              <button type="button" onClick={() => setOpen(false)} aria-label="사이드바 닫기" className={iconButton}>
                <SidebarIcon className="size-6" />
                <Tooltip label="사이드바 닫기" side="bottom" />
              </button>
            </div>

            <nav className="mt-[18px] flex flex-col gap-1 px-3">
              <button
                type="button"
                onClick={handleNewChat}
                aria-current={onChat ? "page" : undefined}
                className={menuItem(onChat)}
              >
                <NewChatIcon className="size-6 text-brand" />새 채팅
              </button>
              <Link
                href="/mentors"
                onClick={() => setOpen(false)}
                aria-current={onMentors ? "page" : undefined}
                className={menuItem(onMentors)}
              >
                <UserIcon className="size-6 text-brand" />
                멘토 리스트
              </Link>
            </nav>

            <p className="mx-3 mt-auto mb-5 rounded-[14px] bg-butter p-3 text-xs leading-relaxed text-body">
              지금 보이는 답변·멘토는 모두 가짜(demo) 데이터이며 실존 인물이 아니에요.
            </p>
          </aside>
        </>
      )}

      {confirmNewChat && (
        <ConfirmDialog
          title="새 채팅을 시작할까요?"
          body="지금까지의 대화는 저장되지 않고 사라져요."
          cancelLabel="취소"
          confirmLabel="새 채팅"
          onCancel={() => setConfirmNewChat(false)}
          onConfirm={startNewChat}
        />
      )}
    </>
  );
}
