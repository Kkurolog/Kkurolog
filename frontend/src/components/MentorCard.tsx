// 멘토 카드 하나. (와이어프레임 03-1 Mentor Card)
// 사진 자리 / 이름 + 메일 쓰기 버튼 / 한 줄 소개 / 키워드 pill 2~3개를 가운데 정렬로 쌓는다.
// 멘토 리스트 화면과, 채팅에서 근거가 부족할 때 추천 멘토로 함께 쓴다.
// - reason: 추천 이유 한 줄 (채팅 추천에서만 넘긴다)
// 연락이 불가능한 멘토(available=false)는 메일 버튼이 흐리게 보이고 누를 수 없다.
import type { Mentor } from "@/lib/api";
import { MailIcon } from "./icons";

type Props = {
  mentor: Mentor;
  onContact: (mentor: Mentor) => void; // 메일 버튼을 눌렀을 때 (부모가 메일 작성 창을 연다)
  reason?: string;
};

// 진로 경로 → 짧은 키워드. 예: "대학 진학" → "#대학"
function toKeyword(path: string) {
  return `#${path.replace(/\s*진학$/, "")}`;
}

// 사진이 아직 없어서, 이름 첫 글자를 동그라미 안에 보여준다
export function MentorPhoto({ name, size = "lg" }: { name: string; size?: "lg" | "md" }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full border-2 border-brand bg-sky font-display text-brand ${
        size === "lg" ? "size-[72px] text-[28px]" : "size-14 text-2xl"
      }`}
    >
      {name.charAt(0)}
    </span>
  );
}

export default function MentorCard({ mentor, onContact, reason }: Props) {
  const keywords = mentor.career_paths.slice(0, 3).map(toKeyword);

  return (
    <article className="flex w-full flex-col items-center gap-4 text-center">
      <MentorPhoto name={mentor.name} />
      <div className="flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-ink">{mentor.name}</h3>
          <button
            type="button"
            onClick={() => onContact(mentor)}
            disabled={!mentor.available}
            aria-label={mentor.available ? `${mentor.name}에게 메일 쓰기` : `${mentor.name}은(는) 지금 연락을 받지 않아요`}
            title={mentor.available ? "메일 쓰기" : "지금은 연락을 받지 않아요"}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border-[1.5px] border-brand text-brand hover:bg-brand hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <MailIcon className="size-[18px]" />
          </button>
        </div>
        <p className="text-sm leading-snug text-body">{mentor.path_summary}</p>
        {keywords.length > 0 && (
          <ul className="flex flex-wrap justify-center gap-2 pt-1.5">
            {keywords.map((keyword) => (
              <li key={keyword} className="rounded-3xl bg-butter px-3 py-[5px] text-[13px] font-medium text-ink">
                {keyword}
              </li>
            ))}
          </ul>
        )}
        {reason && <p className="pt-1 text-[13px] leading-relaxed text-muted">{reason}</p>}
      </div>
    </article>
  );
}
