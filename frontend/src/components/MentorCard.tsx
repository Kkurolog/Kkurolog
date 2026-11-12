// 멘토 카드 하나. 멘토 찾기 페이지와 채팅 속 멘토 추천에서 함께 쓴다.
// - compact=true  : 채팅 옆 패널·채팅 안의 작은 카드 (요약·주제 생략)
// - compact=false : 멘토 찾기 목록의 한 줄 (부모가 흰 상자 + 구분선으로 감싼다)
// - reason        : 추천 이유 한 줄 (채팅 추천에서만 넘긴다)
// 연락이 불가능한 멘토는 "연락하기" 버튼 대신 안내 문구가 보인다.
import type { Mentor } from "@/lib/api";

type Props = {
  mentor: Mentor;
  onContact: (mentor: Mentor) => void; // "연락하기"를 눌렀을 때 (부모가 팝업을 연다)
  reason?: string;
  compact?: boolean;
};

// 이름 첫 글자를 동그라미 안에 보여준다 (사진 대신)
function Avatar({ name, size }: { name: string; size: "sm" | "md" }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-mint font-bold text-brand ${
        size === "sm" ? "size-10 text-sm" : "size-11"
      }`}
    >
      {name.charAt(0)}
    </span>
  );
}

function ContactButton({ mentor, onContact, full }: { mentor: Mentor; onContact: Props["onContact"]; full?: boolean }) {
  if (!mentor.available) {
    return (
      <span
        className={`inline-flex min-h-11 items-center justify-center rounded-[10px] bg-canvas px-3.5 text-[13px] text-muted ${
          full ? "w-full" : ""
        }`}
      >
        지금은 연락을 받지 않아요
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onContact(mentor)}
      className={
        full
          ? "min-h-11 w-full rounded-[10px] border border-brand text-sm font-semibold text-brand hover:bg-mint-soft"
          : "min-h-11 shrink-0 rounded-[10px] bg-brand px-[18px] text-sm font-semibold text-white hover:bg-brand-dark"
      }
    >
      연락하기
    </button>
  );
}

export default function MentorCard({ mentor, onContact, reason, compact = false }: Props) {
  if (compact) {
    return (
      <div className="flex flex-col gap-2.5 rounded-[14px] border border-line bg-white p-4">
        <div className="flex items-center gap-2.5">
          <Avatar name={mentor.name} size="sm" />
          <div>
            <p className="font-semibold text-ink">{mentor.name}</p>
            <p className="text-xs text-muted">{mentor.exit_year} 엑시트</p>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-ink">{mentor.path_summary}</p>
        {reason && <p className="rounded-lg bg-mint-soft px-2.5 py-2 text-[13px] leading-relaxed text-brand">{reason}</p>}
        <ContactButton mentor={mentor} onContact={onContact} full />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-4 px-5 py-[18px]">
      <Avatar name={mentor.name} size="md" />
      <div className="flex min-w-0 flex-[999_1_300px] flex-col gap-1">
        <p className="flex items-baseline gap-2.5">
          <span className="font-semibold text-ink">{mentor.name}</span>
          <span className="text-xs text-muted">{mentor.exit_year} 엑시트</span>
        </p>
        <p className="text-sm leading-relaxed text-ink">{mentor.path_summary}</p>
        <p className="text-sm leading-relaxed text-body">{mentor.summary}</p>
        {mentor.topics.length > 0 && (
          <p className="text-[13px] text-body">
            <span className="font-semibold">이런 이야기를 할 수 있어요:</span> {mentor.topics.join(", ")}
          </p>
        )}
        <p className="text-[13px] text-muted">{mentor.tags.map((tag) => `#${tag}`).join(" ")}</p>
      </div>
      <ContactButton mentor={mentor} onContact={onContact} />
    </div>
  );
}
