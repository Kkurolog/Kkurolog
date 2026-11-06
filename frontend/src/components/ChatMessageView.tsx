// 채팅 메시지 하나를 말풍선으로 그린다.
// - 학생 질문: 오른쪽 말풍선
// - 꾸로록 답변: 왼쪽 말풍선 + 출처 카드 + 근거 부족 안내
import type { ChatMessage } from "@/lib/types";
import SourceCard from "./SourceCard";

export default function ChatMessageView({ message }: { message: ChatMessage }) {
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

  return (
    <div className="flex max-w-[90%] flex-col gap-3">
      <p className="text-xs font-semibold text-gray-500">꾸로록</p>

      {message.hasEnoughEvidence ? (
        <p className="rounded-2xl rounded-tl-sm bg-white px-4 py-3 leading-relaxed text-gray-800 ring-1 ring-gray-200">
          {message.content}
        </p>
      ) : (
        <p className="rounded-2xl rounded-tl-sm border border-amber-300 bg-amber-50 px-4 py-3 leading-relaxed text-amber-900">
          현재 자료로는 답하기 어려워요. 이 경험을 가진 선배에게 직접 물어볼 수 있어요.
        </p>
      )}

      {message.sources.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-gray-500">출처</p>
          {message.sources.map((source) => (
            <SourceCard key={source.interview_id} source={source} />
          ))}
        </div>
      )}
    </div>
  );
}
