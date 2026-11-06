// 멘토 카드 하나. 멘토 찾기 페이지와 채팅 속 멘토 추천에서 함께 쓴다.
// - compact=true  : 채팅 안의 작은 카드 (요약·주제 생략)
// - reason        : 추천 이유 한 줄 (채팅 추천에서만 넘긴다)
// 연락이 불가능한 멘토는 "연락하기" 버튼이 비활성화된다.
import type { Mentor } from "@/lib/api";

type Props = {
  mentor: Mentor;
  onContact: (mentor: Mentor) => void; // "연락하기"를 눌렀을 때 (부모가 팝업을 연다)
  reason?: string;
  compact?: boolean;
};

export default function MentorCard({ mentor, onContact, reason, compact = false }: Props) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-semibold text-gray-900">{mentor.name}</p>
        <p className="shrink-0 text-xs text-gray-400">{mentor.exit_year} 엑시트</p>
      </div>

      <p className="text-sm text-gray-700">{mentor.path_summary}</p>
      {reason && <p className="text-sm text-indigo-700">💡 {reason}</p>}
      {!compact && <p className="text-sm leading-relaxed text-gray-600">{mentor.summary}</p>}

      <div className="flex flex-wrap gap-1">
        {mentor.tags.map((tag) => (
          <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            #{tag}
          </span>
        ))}
      </div>

      {!compact && mentor.topics.length > 0 && (
        <p className="text-xs text-gray-500">
          <span className="font-semibold">이런 이야기를 할 수 있어요:</span> {mentor.topics.join(", ")}
        </p>
      )}

      <div className="mt-1 flex items-center justify-between">
        <span className={mentor.available ? "text-xs text-green-600" : "text-xs text-gray-400"}>
          {mentor.available ? "● 연락 가능" : "● 지금은 연락을 받지 않아요"}
        </span>
        <button
          type="button"
          onClick={() => onContact(mentor)}
          disabled={!mentor.available}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-gray-300"
        >
          연락하기
        </button>
      </div>
    </div>
  );
}
