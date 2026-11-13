// 채팅 메시지 하나를 그린다. (와이어프레임 02-1, 02-2)
// - 학생 질문: 오른쪽 정렬, 연한 블루(sky) 말풍선
// - 꾸로록 답변: 말풍선 없이 글로 표시 + 아래에 '출처 · …' 링크 (누르면 오른쪽에 출처 패널이 열린다)
// - 근거가 부족하면(hasEnoughEvidence=false) 안내 문구와 함께 이 경험을 가진 선배(멘토)를 보여준다.
import type { Mentor, Source } from "@/lib/api";
import type { ChatMessage } from "@/lib/types";
import MentorCard from "./MentorCard";

type Props = {
  message: ChatMessage;
  onOpenSource: (source: Source) => void; // 출처 링크를 눌렀을 때
  onContact: (mentor: Mentor, question: string) => void; // 멘토의 메일 버튼을 눌렀을 때
};

// 출처 링크 문구. 예: "출처 · 졸업생 A (demo) · demo-1"
export function sourceLabel(source: Source) {
  return `출처 · ${source.alumni} · ${source.interview_id}`;
}

export default function ChatMessageView({ message, onOpenSource, onContact }: Props) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-[20px] bg-sky px-5 py-3 text-[15px] leading-[26px] whitespace-pre-wrap text-ink">
          {message.content}
        </p>
      </div>
    );
  }

  if (message.isError) {
    return (
      <p role="alert" className="border-l-4 border-danger py-1 pl-4 text-[15px] leading-[26px] text-ink">
        {message.content}
      </p>
    );
  }

  // 근거 부족: 지어내지 않고, 선배에게 직접 묻도록 안내한다
  if (!message.hasEnoughEvidence) {
    return (
      <div className="flex flex-col gap-3.5 text-[15px] leading-[26px] text-ink">
        <p>
          <span className="bg-[linear-gradient(transparent_55%,var(--color-butter)_55%)] font-bold">
            지금 자료만으로는 답하기 어려워요.
          </span>
        </p>
        <p>이 경험을 가진 선배에게 직접 물어볼 수 있어요. 첫 연락은 꾸로록이 대신 전달해요.</p>
        {message.mentors.length > 0 && (
          <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-8 rounded-3xl border-2 border-brand bg-surface px-6 py-7 sm:grid-cols-3">
            {message.mentors.map((rec) => (
              <MentorCard
                key={rec.mentor.id}
                mentor={rec.mentor}
                reason={rec.reason}
                onContact={(mentor) => onContact(mentor, message.question)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5 text-[15px] leading-[26px] text-ink">
      {/* 빈 줄로 나뉜 덩어리마다 문단 하나 (문단 사이 14px) */}
      {message.content.split(/\n\s*\n/).map((paragraph, i) => (
        <p key={i} className="whitespace-pre-wrap">
          {paragraph}
        </p>
      ))}
      {message.sources.length > 0 && (
        <ul className="flex flex-col gap-1">
          {message.sources.map((source) => (
            <li key={source.interview_id}>
              <button
                type="button"
                onClick={() => onOpenSource(source)}
                className="text-left text-brand underline-offset-4 hover:underline focus-visible:underline"
              >
                {sourceLabel(source)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
