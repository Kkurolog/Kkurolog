// 화면에서 쓰는 선 아이콘 모음. (이모지 대신 쓴다)
// 크기와 색은 className으로 정한다. 예: <MailIcon className="size-5 text-brand" />
// 아이콘은 꾸밈용이라 화면 읽기 프로그램이 읽지 않게 aria-hidden 을 붙였다.
type IconProps = { className?: string };

function Svg({ className, children, strokeWidth = 2 }: IconProps & { children: React.ReactNode; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

// 새 채팅 (연필 + 네모)
export function NewChatIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
      <path d="M18.4 2.6a2 2 0 0 1 2.9 2.9L12 14.8l-3.6.8.8-3.6z" />
    </Svg>
  );
}

// 멘토 리스트 (사람)
export function UserIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </Svg>
  );
}

// 메뉴 (줄 세 개) — 휴대폰 위쪽 막대
export function MenuIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  );
}

// 최근 대화 (시계)
export function HistoryIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
      <path d="M3 3.5V8h4.5" />
      <path d="M12 7.5V12l3 2" />
    </Svg>
  );
}

// 사이드바 열기·닫기 (왼쪽 칸이 나뉜 네모)
export function SidebarIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M9 4v16" />
    </Svg>
  );
}

// 메일 쓰기 (봉투)
export function MailIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3.5 7l8.5 6 8.5-6" />
    </Svg>
  );
}

// 전송 완료 (종이비행기)
// 비행기 모양의 무게중심이 오른쪽 위로 치우쳐 있어서, 동그라미 안에 넣으면 한쪽으로 쏠려 보인다.
// 그래서 무게중심(13.5, 10.5)이 아이콘 정가운데(12, 12)에 오도록 왼쪽 아래로 옮겨 그린다.
export function PlaneIcon({ className }: IconProps) {
  return (
    <Svg className={className} strokeWidth={1.6}>
      <g transform="translate(-1.5 1.5)">
        <path d="M21.5 2.5L10.5 13.5" />
        <path d="M21.5 2.5l-7 19-4-8-8-4z" />
      </g>
    </Svg>
  );
}

// 뒤로가기 (왼쪽 화살표)
export function ArrowLeftIcon({ className }: IconProps) {
  return (
    <Svg className={className} strokeWidth={2.4}>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </Svg>
  );
}

export function ArrowUpIcon({ className }: IconProps) {
  return (
    <Svg className={className} strokeWidth={2.6}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </Svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

// 반짝이 (메인 화면 꾸밈용 네 갈래 별, 면으로 채움)
export function SparkleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M12 0c.6 6.4 5.6 11.4 12 12-6.4.6-11.4 5.6-12 12-.6-6.4-5.6-11.4-12-12C6.4 11.4 11.4 6.4 12 0z" />
    </svg>
  );
}

// ---- 관리자 화면용 ----

// 문의 목록 (받은편지함 트레이)
export function InboxIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 13l2.6-7.2A2 2 0 0 1 7.5 4.5h9a2 2 0 0 1 1.9 1.3L21 13" />
      <path d="M3 13v4.5A2.5 2.5 0 0 0 5.5 20h13a2.5 2.5 0 0 0 2.5-2.5V13h-5.5l-1.5 2.5h-4L8.5 13z" />
    </Svg>
  );
}

// 확인 필요 (동그라미 안 느낌표)
export function AlertIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5" />
      <path d="M12 16.5h.01" />
    </Svg>
  );
}

// 이전·다음 쪽 (꺾쇠)
export function ChevronLeftIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M15 5l-7 7 7 7" />
    </Svg>
  );
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9 5l7 7-7 7" />
    </Svg>
  );
}

// 로그아웃 (문 밖으로 나가는 화살표)
export function LogoutIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M14 4h3.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H14" />
      <path d="M10 8l-4 4 4 4" />
      <path d="M6 12h10" />
    </Svg>
  );
}

// 인터뷰 넣기 (위로 올리는 화살표 + 받침)
export function UploadIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 15V4" />
      <path d="M7.5 8.5L12 4l4.5 4.5" />
      <path d="M4 15v2.5A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V15" />
    </Svg>
  );
}
