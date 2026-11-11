// 질문 입력창 + 보내기 버튼. (채팅 화면 아래에 붙는다)
// 실제로 backend를 부르는 일은 부모가 하고, 여기서는 입력만 받는다.
// Enter: 보내기 / Shift+Enter: 줄바꿈
"use client";

import { useState } from "react";
import { ArrowUpIcon } from "./icons";

type Props = {
  onSubmit: (question: string) => void; // 질문을 보낼 때 실행할 함수
  loading: boolean; // 답변을 기다리는 중인지
};

export default function QuestionForm({ onSubmit, loading }: Props) {
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
      className="flex items-end gap-2 rounded-[18px] border border-line-strong bg-white py-2 pr-2 pl-4 shadow-[0_4px_16px_rgba(29,74,56,0.06)] focus-within:border-brand"
    >
      <label htmlFor="question" className="sr-only">
        질문
      </label>
      <textarea
        id="question"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="예: 대학을 바로 가지 않고 취업한 선배들은 왜 그렇게 선택했어?"
        rows={2}
        className="w-full resize-none bg-transparent py-2 text-base text-ink placeholder:text-muted focus:outline-none"
      />
      <button
        type="submit"
        disabled={loading || !question.trim()}
        aria-label={loading ? "답변을 찾는 중" : "보내기"}
        className="inline-flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-brand text-white hover:bg-brand-dark disabled:bg-line-strong"
      >
        <ArrowUpIcon className={loading ? "size-5 animate-pulse" : "size-5"} />
      </button>
    </form>
  );
}
