// 왼쪽 사이드바. 본문(크림)과 구분되게 연한 블루(sky) 바탕, 선택·hover 는 흰색. 두 가지 모양이 있다.
// - 닫힘(기본, 와이어프레임 01): 72px 레일. 로고 + 아이콘(새 채팅 / 멘토 리스트). 마우스를 올리면 툴팁.
//   로고에 마우스를 올리면 '사이드바 열기' 아이콘으로 바뀌고, 누르면 사이드바가 열린다. (01-1)
// - 열림(01-4): 280px. 아이콘 + 메뉴 이름. 지금 위치한 메뉴는 연한 블루 배경. 오른쪽 위 버튼으로 닫는다.
// '새 채팅'은 지금 대화를 기록에 남겨 두고 빈 화면으로 간다. 열린 사이드바의 '최근 대화'에서 다시 열 수 있고,
// 대화마다 지울 수 있다 (지우기 전에 확인 창). 레일의 시계 아이콘을 누르면 사이드바가 열려 기록이 보인다.
// 좁은 화면(lg 미만)에서는 열린 사이드바가 화면 위에 겹쳐 뜬다.
// 휴대폰(sm 미만)에서는 레일 대신 위쪽에 얇은 막대(메뉴 · 로고 · 새 채팅)를 두어 본문 폭을 넓게 쓴다.
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useChat } from "@/lib/useChat";
import ConfirmDialog from "./ConfirmDialog";
import Logo from "./Logo";
import { CloseIcon, HistoryIcon, MenuIcon, NewChatIcon, SidebarIcon, UserIcon } from "./icons";

// 마우스를 올리거나 키보드로 초점이 가면 보이는 작은 말풍선
function Tooltip({ label, side = "right" }: { label: string; side?: "right" | "bottom" }) {
  const position = side === "right" ? "top-1/2 left-full ml-2 -translate-y-1/2" : "top-full right-0 mt-2";
  return (
    <span
      role="tooltip"
      className={`pointer-events-none absolute z-30 hidden rounded-md bg-ink px-2.5 py-1.5 text-[13px] whitespace-nowrap text-white group-hover:block group-focus-visible:block motion-safe:animate-fade-in ${position}`}
    >
      {label}
    </span>
  );
}

// 휴대폰에서는 손가락으로 누르기 쉽게 44px, 넓은 화면 레일에서는 36px
const iconButton =
  "group relative inline-flex size-11 items-center justify-center rounded-xl text-brand hover:bg-surface focus-visible:bg-surface focus-visible:outline-none sm:size-9";

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { conversations, currentId, goHome, open: openConversation, remove } = useChat();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null); // 지울 대화 id

  // 열린 사이드바가 화면 위에 겹쳐 뜨는 좁은 화면(lg 미만)에서만 닫는다.
  // 넓은 화면에서는 사이드바가 옆에 자리를 차지하므로, 메뉴를 눌러도 열린 상태를 유지한다
  function closeIfOverlay() {
    if (!window.matchMedia("(min-width: 1024px)").matches) setOpen(false);
  }

  // '새 채팅': 지금 대화는 기록에 남기고 빈 화면으로
  // '새 채팅'도 로고처럼 메인(첫) 화면으로 간다. 사용 가이드가 열려 있으면 닫힌다
  function handleNewChat() {
    goHome();
    closeIfOverlay();
    router.push("/");
  }

  // 로고: 어느 화면에서든 메인(첫) 화면으로. 보던 대화는 '최근 대화'에 남는다
  function handleGoHome(e: React.MouseEvent) {
    e.preventDefault();
    goHome();
    setOpen(false);
    router.push("/");
  }

  // 최근 대화 하나 열기 (좁은 화면에서는 사이드바를 닫는다)
  function handleOpenConversation(id: string) {
    openConversation(id);
    router.push("/");
    closeIfOverlay();
  }

  const onChat = pathname === "/";
  const onNewChat = onChat && currentId === null;
  const onMentors = pathname.startsWith("/mentors");

  const menuItem = (active: boolean) =>
    `flex h-11 w-full items-center gap-3 rounded-[14px] px-3 text-[15px] ${
      active ? "bg-surface font-bold text-brand" : "text-ink hover:bg-surface/70"
    }`;

  return (
    <>
      {/* 휴대폰: 위쪽 막대. 손가락으로 누르기 쉽게 버튼은 44px. 노치에 가리지 않게 위쪽 안전 영역만큼 띄운다 */}
      <header className="sticky top-0 z-20 flex shrink-0 items-center justify-between border-b-2 border-brand bg-sky px-2 pt-[env(safe-area-inset-top)] sm:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="메뉴 열기"
          className="inline-flex size-11 items-center justify-center rounded-xl text-brand active:bg-surface"
        >
          <MenuIcon className="size-6" />
        </button>
        {/* '꾸로록' 글자를 화면 한가운데에 두고, 로고는 글자 왼쪽에 붙인다 (로고까지 묶어 가운데에 두면 글자가 오른쪽으로 밀려 보인다) */}
        <Link href="/" onClick={handleGoHome} aria-label="꾸로록 메인으로" className="relative flex h-14 items-center">
          <Logo className="absolute top-1/2 right-full mr-2 size-8 -translate-y-1/2" />
          <span className="font-display text-xl text-brand">꾸로록</span>
        </Link>
        <button
          type="button"
          onClick={handleNewChat}
          aria-label="새 채팅"
          className="inline-flex size-11 items-center justify-center rounded-xl text-brand active:bg-surface"
        >
          <NewChatIcon className="size-6" />
        </button>
      </header>

      {/* 닫힌 레일 (넓은 화면에서 항상 자리를 차지한다) */}
      <header className="sticky top-0 z-20 hidden h-screen w-[72px] shrink-0 flex-col items-center gap-7 border-r-2 border-brand bg-sky pt-5 sm:flex">
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
            aria-current={onNewChat ? "page" : undefined}
            className={`${iconButton} ${onNewChat ? "bg-surface" : ""}`}
          >
            <NewChatIcon className="size-6" />
            <Tooltip label="새 채팅" />
          </button>
          <Link
            href="/mentors"
            aria-label="멘토 리스트"
            aria-current={onMentors ? "page" : undefined}
            className={`${iconButton} ${onMentors ? "bg-surface" : ""}`}
          >
            <UserIcon className="size-6" />
            <Tooltip label="멘토 리스트" />
          </Link>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="최근 대화 보기"
            className={`${iconButton} ${onChat && currentId !== null ? "bg-surface" : ""}`}
          >
            <HistoryIcon className="size-6" />
            <Tooltip label="최근 대화" />
          </button>
        </nav>
      </header>

      {/* 열린 사이드바. 넓은 화면에서는 레일 자리를 넓혀 본문을 밀고, 좁은 화면에서는 위에 겹친다 */}
      {open && (
        <>
          <div className="fixed inset-0 z-30 bg-ink/30 lg:hidden motion-safe:animate-fade-in" onClick={() => setOpen(false)} aria-hidden="true" />
          <aside
            aria-label="사이드바"
            className="fixed inset-y-0 left-0 z-40 flex w-[280px] max-w-[85vw] flex-col border-r-2 border-brand bg-sky pt-[env(safe-area-inset-top)] lg:sticky lg:top-0 lg:z-20 lg:-ml-[72px] lg:h-screen lg:shrink-0 motion-safe:animate-slide-left"
          >
            <div className="flex items-center justify-between px-[18px] pt-5">
              <Link href="/" onClick={handleGoHome} aria-label="꾸로록 메인으로" className="flex items-center gap-2.5">
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
                aria-current={onNewChat ? "page" : undefined}
                className={menuItem(onNewChat)}
              >
                <NewChatIcon className="size-6 text-brand" />새 채팅
              </button>
              <Link
                href="/mentors"
                onClick={closeIfOverlay}
                aria-current={onMentors ? "page" : undefined}
                className={menuItem(onMentors)}
              >
                <UserIcon className="size-6 text-brand" />
                멘토 리스트
              </Link>
            </nav>

            {/* 최근 대화 기록 (이 브라우저에만 저장) */}
            <section aria-labelledby="history-title" className="mt-6 flex min-h-0 flex-1 flex-col">
              <h2 id="history-title" className="px-[18px] pb-2 text-[13px] font-bold text-brand">
                최근 대화
              </h2>
              {conversations.length === 0 ? (
                <p className="px-[18px] text-[13px] leading-relaxed text-muted">
                  아직 대화가 없어요. 질문을 보내면 여기에 남아요.
                </p>
              ) : (
                <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-2">
                  {conversations.map((c) => {
                    const active = onChat && c.id === currentId;
                    return (
                      <li key={c.id} className="group/item relative">
                        <button
                          type="button"
                          onClick={() => handleOpenConversation(c.id)}
                          aria-current={active ? "page" : undefined}
                          // 흰 바탕은 '줄 전체(li)'에 마우스가 있을 때 켠다 → X 위로 옮겨 가도 흰 바탕이 유지된다
                          className={`flex w-full flex-col rounded-xl py-2 pr-12 pl-3 text-left ${
                            active ? "bg-surface" : "group-hover/item:bg-surface/70"
                          }`}
                        >
                          <span className={`truncate text-sm ${active ? "font-bold text-brand" : "text-ink"}`}>
                            {c.title}
                          </span>
                          <span className="text-xs text-muted">
                            {new Date(c.updatedAt).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(c.id)}
                          aria-label={`'${c.title}' 대화 지우기`}
                          // 마우스가 있는 기기에서는 올렸을 때만 보이고, 터치 기기에서는 항상 보인다 (누를 영역 40px).
                          // X 에 직접 마우스를 올리면 '지우기'라는 걸 알 수 있게 토마토색 동그라미로 강조한다
                          className="absolute top-1/2 right-1 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full text-muted transition-colors hover:bg-danger/15 hover:text-danger-dark focus-visible:bg-danger/15 focus-visible:text-danger-dark focus-visible:opacity-100 focus-visible:outline-none [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/item:opacity-100"
                        >
                          <CloseIcon className="size-[18px]" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <p className="mx-3 mt-3 mb-5 rounded-[14px] bg-butter p-3 text-xs leading-relaxed text-body">
              대화 기록은 이 브라우저에만 저장돼요. 같이 쓰는 컴퓨터라면 다 쓴 뒤 지워 주세요.
            </p>
          </aside>
        </>
      )}

      {confirmDelete && (
        <ConfirmDialog
          tone="danger"
          title="이 대화를 지울까요?"
          detail={conversations.find((c) => c.id === confirmDelete)?.title}
          warning="지운 대화는 다시 볼 수 없어요."
          cancelLabel="취소"
          confirmLabel="대화 지우기"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            remove(confirmDelete);
            setConfirmDelete(null);
          }}
        />
      )}
    </>
  );
}
