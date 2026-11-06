// 메인 화면 (주소 "/"): 꾸로록과 대화하는 채팅 화면.
// 메시지가 위에서 아래로 쌓이고, 입력창은 아래에 있다.
// 대화 상태는 lib/useChat.ts 에서 관리한다.
"use client";

import { useEffect, useRef } from "react";
import ChatMessageView from "@/components/ChatMessageView";
import QuestionForm from "@/components/QuestionForm";
import { useChat } from "@/lib/useChat";

// 처음 들어왔을 때 눌러볼 수 있는 예시 질문
const EXAMPLE_QUESTIONS = [
  "대학을 바로 가지 않고 취업한 선배들은 왜 그렇게 선택했어?",
  "창업하다가 대학에 간 선배 이야기가 궁금해",
  "근거없음 (근거 부족 화면 확인용)",
];

export default function Home() {
  const { messages, loading, ask } = useChat();
  const bottomRef = useRef<HTMLDivElement>(null);

  // 새 메시지가 생기면 맨 아래로 스크롤
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      {messages.length === 0 && (
        <section className="flex flex-col gap-3 py-8">
          <h1 className="text-2xl font-bold text-gray-900">무엇이든 물어보세요</h1>
          <p className="text-gray-500">
            한 사람의 경험이 다음 학생의 선택지가 되도록. 선배들의 선택 이유, 고민, 시행착오를 찾아드려요.
          </p>
          <div className="flex flex-col items-start gap-2">
            {EXAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => ask(q)}
                className="rounded-full bg-white px-3 py-1.5 text-left text-sm text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100"
              >
                {q}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-col gap-5">
        {messages.map((message) => (
          <ChatMessageView key={message.id} message={message} />
        ))}
        {loading && <p className="text-sm text-gray-400">꾸로록이 선배들의 경험을 찾는 중...</p>}
        <div ref={bottomRef} />
      </div>

      {/* 입력창은 화면 아래에 붙어 있게 한다 */}
      <div className="sticky bottom-0 bg-gray-50 pb-4 pt-2">
        <QuestionForm onSubmit={ask} loading={loading} />
      </div>
    </main>
  );
}
