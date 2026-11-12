// 메인 화면 (주소 "/"): 꾸로록과 대화하는 채팅 화면.
// 가운데: 메시지가 위에서 아래로 쌓이고, 입력창은 아래에 붙어 있다.
// 오른쪽(넓은 화면만): 가장 최근 답변의 추천 멘토 패널. 좁은 화면에서는 답변 안에 멘토 카드가 보인다.
// 대화 상태는 lib/useChat.ts 에서 관리한다.
"use client";

import { useEffect, useRef, useState } from "react";
import ChatMessageView from "@/components/ChatMessageView";
import ContactModal from "@/components/ContactModal";
import MentorCard from "@/components/MentorCard";
import QuestionForm from "@/components/QuestionForm";
import type { Mentor } from "@/lib/api";
import type { AssistantMessage } from "@/lib/types";
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
  // 연락 팝업: 누구에게, 어떤 질문을 미리 채울지. null 이면 닫힘
  const [contact, setContact] = useState<{ mentor: Mentor; question: string } | null>(null);

  // 새 메시지가 생기면 맨 아래로 스크롤
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function handleContact(mentor: Mentor, question: string) {
    setContact({ mentor, question });
  }

  // 오른쪽 패널에 보여줄 답변: 가장 최근의 (오류가 아닌) 꾸로록 답변
  const latestAnswer = [...messages]
    .reverse()
    .find((m): m is AssistantMessage => m.role === "assistant" && !m.isError);

  return (
    <div className="flex min-w-0 flex-1">
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 pt-9 pb-5 sm:px-7">
          {messages.length === 0 && (
            <section className="flex flex-col gap-3 py-8">
              <h1 className="text-[28px] font-bold text-ink">무엇이든 물어보세요</h1>
              <p className="leading-relaxed text-body">
                한 사람의 경험이 다음 학생의 선택지가 되도록. 선배들의 선택 이유, 고민, 시행착오를 찾아드려요.
              </p>
              <div className="mt-2 flex flex-col items-start gap-2">
                {EXAMPLE_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => ask(q)}
                    className="min-h-11 rounded-xl border border-line bg-white px-4 py-2 text-left text-sm text-ink hover:border-brand hover:bg-mint-soft"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </section>
          )}

          {messages.map((message) => (
            <ChatMessageView
              key={message.id}
              message={message}
              onContact={handleContact}
              mentorsInPanel={message.id === latestAnswer?.id}
            />
          ))}
          {loading && <p className="pl-[46px] text-sm text-muted">꾸로록이 선배들의 경험을 찾는 중...</p>}
          <div ref={bottomRef} />
        </div>

        {/* 입력창은 화면 아래에 붙어 있게 한다 */}
        <div className="sticky bottom-0 bg-canvas">
          <div className="mx-auto w-full max-w-3xl px-5 pt-2 pb-6 sm:px-7">
            <QuestionForm onSubmit={ask} loading={loading} />
          </div>
        </div>
      </main>

      {/* 오른쪽 추천 멘토 패널 (넓은 화면에서만) */}
      <aside className="sticky top-0 hidden h-screen w-80 shrink-0 flex-col gap-3.5 overflow-y-auto border-l border-line bg-white px-5 py-6 lg:flex">
        <div>
          <h2 className="font-bold text-ink">이 질문에 답해 줄 선배</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">첫 연락은 꾸로록이 대신 전달해요.</p>
        </div>
        {latestAnswer && latestAnswer.mentors.length > 0 ? (
          latestAnswer.mentors.map((rec) => (
            <MentorCard
              key={rec.mentor.id}
              mentor={rec.mentor}
              reason={rec.reason}
              onContact={(mentor) => handleContact(mentor, latestAnswer.question)}
              compact
            />
          ))
        ) : (
          <p className="rounded-xl bg-canvas p-4 text-sm leading-relaxed text-muted">
            질문을 보내면 관련 경험을 가진 선배를 여기에서 추천해 드려요.
          </p>
        )}
      </aside>

      {contact && (
        <ContactModal
          key={contact.mentor.id} // 다른 멘토를 열면 입력칸을 새로 시작
          mentor={contact.mentor}
          initialMessage={contact.question}
          onClose={() => setContact(null)}
        />
      )}
    </div>
  );
}
