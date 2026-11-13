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
export function PlaneIcon({ className }: IconProps) {
  return (
    <Svg className={className} strokeWidth={1.6}>
      <path d="M21.5 2.5L10.5 13.5" />
      <path d="M21.5 2.5l-7 19-4-8-8-4z" />
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

// 도는 로딩 표시 (메일 전송 중)
export function SpinnerIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 56 56" fill="none" aria-hidden="true" className={`motion-safe:animate-spin ${className ?? ""}`}>
      <circle cx="28" cy="28" r="24" stroke="currentColor" strokeOpacity="0.15" strokeWidth="5" />
      <path d="M28 4a24 24 0 0 1 24 24" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
