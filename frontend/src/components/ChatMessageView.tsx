// 채팅 메시지 하나를 말풍선으로 그린다.
// - 학생 질문: 오른쪽 말풍선
// - 꾸로록 답변: 왼쪽 말풍선 + 출처 카드 + 추천 멘토
//   근거가 부족하면(hasEnoughEvidence=false) 답변 대신 안내 문구를 보여주고 추천 멘토를 크게 강조한다.
import type { Mentor } from "@/lib/api";
import type { ChatMessage } from "@/lib/types";
import MentorCard from "./MentorCard";
import SourceCard from "./SourceCard";

type Props = {
  message: ChatMessage;
  // 추천 멘토의 "연락하기"를 눌렀을 때. question 은 연락 팝업에 미리 채울 학생 질문
  onContact: (mentor: Mentor, question: string) => void;
};

export default function ChatMessageView({ message, onContact }: Props) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-indigo-600 px-4 py-2 text-white">
          {message.content}
        </p>
      </div>
    );
  }

  if (message.isError) {
    return <p className="max-w-[85%] rounded-lg bg-red-50 p-3 text-sm text-red-700">{message.content}</p>;
  }

  const contact = (mentor: Mentor) => onContact(mentor, message.question);

  // 근거 부족: 추천 멘토를 크게 강조
  if (!message.hasEnoughEvidence) {
    return (
      <div className="flex max-w-[95%] flex-col gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
        <p className="text-xs font-semibold text-amber-700">꾸로록</p>
        <p className="text-lg font-semibold text-amber-900">현재 자료로는 답하기 어려워요.</p>
        <p className="text-amber-900">이 경험을 가진 선배에게 직접 물어볼 수 있어요. 첫 연락은 꾸로록이 대신 전달해요.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {message.mentors.map((rec) => (
            <MentorCard key={rec.mentor.id} mentor={rec.mentor} reason={rec.reason} onContact={contact} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-w-[90%] flex-col gap-3">
      <p className="text-xs font-semibold text-gray-500">꾸로록</p>
      <p className="rounded-2xl rounded-tl-sm bg-white px-4 py-3 leading-relaxed text-gray-800 ring-1 ring-gray-200">
        {message.content}
      </p>

      {message.sources.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-gray-500">출처</p>
          {message.sources.map((source) => (
            <SourceCard key={source.interview_id} source={source} />
          ))}
        </div>
      )}

      {message.mentors.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-gray-500">관련 경험을 가진 멘토</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {message.mentors.map((rec) => (
              <MentorCard key={rec.mentor.id} mentor={rec.mentor} reason={rec.reason} onContact={contact} compact />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
