// 꾸로록 로고: 노란 얼굴에 눈 두 개 (거꾸로캠퍼스 캐릭터 색).
// 크기는 className으로 정한다. 기본 36px.
export default function Logo({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 36" aria-hidden="true" className={className}>
      <circle cx="18" cy="18" r="16.5" fill="var(--color-accent)" stroke="var(--color-brand)" strokeWidth="2.2" />
      <ellipse cx="13" cy="16" rx="3.4" ry="4.6" fill="#fff" stroke="var(--color-brand)" strokeWidth="1.6" />
      <ellipse cx="23" cy="16" rx="3.4" ry="4.6" fill="#fff" stroke="var(--color-brand)" strokeWidth="1.6" />
      <circle cx="13.4" cy="14.6" r="1.7" fill="var(--color-brand)" />
      <circle cx="23.4" cy="14.6" r="1.7" fill="var(--color-brand)" />
    </svg>
  );
}
