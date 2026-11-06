// 질문 입력창 + 보내기 버튼. (채팅 화면 아래에 붙는다)
// 실제로 backend를 부르는 일은 부모가 하고, 여기서는 입력만 받는다.
// Enter: 보내기 / Shift+Enter: 줄바꿈
"use client";

import { useState } from "react";

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
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="예: 대학을 바로 가지 않고 취업한 선배들은 왜 그렇게 선택했어?"
        rows={2}
        className="w-full resize-none rounded-lg border border-gray-300 bg-white p-3 text-base focus:border-indigo-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={loading || !question.trim()}
        className="shrink-0 rounded-lg bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-700 disabled:bg-gray-300"
      >
        {loading ? "찾는 중..." : "보내기"}
      </button>
    </form>
  );
}
