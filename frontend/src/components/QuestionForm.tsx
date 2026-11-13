// 질문 입력창 + 보내기 버튼. (메인 화면 가운데, 대화가 시작되면 화면 아래에 붙는다)
// 실제로 backend를 부르는 일은 부모가 하고, 여기서는 입력만 받는다.
// Enter: 보내기 / Shift+Enter: 줄바꿈
"use client";

import { useState } from "react";
import { ArrowUpIcon } from "./icons";

type Props = {
  onSubmit: (question: string) => void; // 질문을 보낼 때 실행할 함수
  loading: boolean; // 답변을 기다리는 중인지
  placeholder: string; // 비어 있을 때 보이는 안내 문구
  autoFocus?: boolean;
};

export default function QuestionForm({ onSubmit, loading, placeholder, autoFocus }: Props) {
  const [question, setQuestion] = useState("");

  function send() {
    const trimmed = question.trim();
    if (!trimmed || loading) return;
    onSubmit(trimmed);
    setQuestion(""); // 보낸 뒤 입력창 비우기
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); // 페이지 새로고침 막기
    send();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // isComposing: 한글을 조합하는 중에 Enter가 두 번 처리되는 것을 막는다
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex min-h-[72px] w-full items-center gap-3 rounded-[36px] border-2 border-brand bg-surface py-3 pr-3 pl-7 focus-within:shadow-[0_0_0_4px_var(--color-sky)]"
    >
      <label htmlFor="question" className="sr-only">
        질문
      </label>
      <textarea
        id="question"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={1}
        autoFocus={autoFocus}
        className="max-h-40 w-full resize-none bg-transparent py-1 text-base leading-6 text-ink [field-sizing:content] placeholder:text-placeholder focus:outline-none"
      />
      <button
        type="submit"
        disabled={loading || !question.trim()}
        aria-label={loading ? "답변을 준비하는 중" : "보내기"}
        className="inline-flex size-12 shrink-0 items-center justify-center self-end rounded-full bg-brand text-white hover:bg-brand-dark disabled:bg-brand/35"
      >
        <ArrowUpIcon className="size-6" />
      </button>
    </form>
  );
}
