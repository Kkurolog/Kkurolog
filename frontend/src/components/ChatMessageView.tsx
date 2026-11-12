// 채팅 메시지 하나를 그린다.
// - 학생 질문: 오른쪽 초록 말풍선
// - 꾸로록 답변: 왼쪽 프로필 + 답변 + 출처(펼치기) + 추천 멘토
//   근거가 부족하면(hasEnoughEvidence=false) 답변 대신 안내 문구를 보여주고 추천 멘토를 강조한다.
// mentorsInPanel=true 이면(가장 최근 답변) 넓은 화면에서는 추천 멘토를 오른쪽 패널에 보여주므로
// 말풍선 안의 멘토 카드는 좁은 화면에서만 보인다.
import type { Mentor } from "@/lib/api";
import type { ChatMessage } from "@/lib/types";
import MentorCard from "./MentorCard";
import SourceCard from "./SourceCard";

type Props = {
  message: ChatMessage;
  // 추천 멘토의 "연락하기"를 눌렀을 때. question 은 연락 팝업에 미리 채울 학생 질문
  onContact: (mentor: Mentor, question: string) => void;
  mentorsInPanel?: boolean;
};

function KkuroAvatar() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-[34px] shrink-0 items-center justify-center rounded-full bg-mint text-[13px] font-bold text-brand"
    >
      꾸로
    </span>
  );
}

export default function ChatMessageView({ message, onContact, mentorsInPanel = false }: Props) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[80%] rounded-[18px_18px_6px_18px] bg-brand px-4 py-3 leading-relaxed whitespace-pre-wrap text-white">
          {message.content}
        </p>
      </div>
    );
  }

  if (message.isError) {
    return (
      <div className="flex items-start gap-3">
        <KkuroAvatar />
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{message.content}</p>
      </div>
    );
  }

  const contact = (mentor: Mentor) => onContact(mentor, message.question);
  // 넓은 화면에서 오른쪽 패널이 대신 보여줄 때는 여기 카드를 숨긴다
  const inlineMentorsClass = mentorsInPanel ? "lg:hidden" : "";

  // 근거 부족: 선배에게 직접 묻도록 강조
  if (!message.hasEnoughEvidence) {
    return (
      <div className="flex items-start gap-3">
        <KkuroAvatar />
        <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-2xl border-2 border-brand/25 bg-mint-soft p-4">
          <p className="text-lg font-semibold text-brand">현재 자료로는 답하기 어려워요.</p>
          <p className="leading-relaxed text-ink">
            이 경험을 가진 선배에게 직접 물어볼 수 있어요. 첫 연락은 꾸로록이 대신 전달해요.
            {mentorsInPanel && message.mentors.length > 0 && (
              <span className="hidden lg:inline"> 오른쪽에서 선배를 골라 보세요.</span>
            )}
          </p>
          {message.mentors.length > 0 && (
            <div className={`grid gap-3 sm:grid-cols-2 ${inlineMentorsClass}`}>
              {message.mentors.map((rec) => (
                <MentorCard key={rec.mentor.id} mentor={rec.mentor} reason={rec.reason} onContact={contact} compact />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <KkuroAvatar />
      <div className="flex min-w-0 flex-1 flex-col gap-3.5">
        <p className="leading-[1.8] whitespace-pre-wrap text-ink">{message.content}</p>

        {message.sources.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-muted">근거가 된 인터뷰 {message.sources.length}개</p>
            {message.sources.map((source, i) => (
              <SourceCard key={source.interview_id} source={source} defaultOpen={i === 0} />
            ))}
          </div>
        )}

        {message.mentors.length > 0 && (
          <div className={`flex flex-col gap-2 ${inlineMentorsClass}`}>
            <p className="text-xs font-semibold text-muted">이 질문에 답해 줄 선배</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {message.mentors.map((rec) => (
                <MentorCard key={rec.mentor.id} mentor={rec.mentor} reason={rec.reason} onContact={contact} compact />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
