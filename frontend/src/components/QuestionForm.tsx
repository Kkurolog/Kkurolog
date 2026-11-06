// 질문 입력창 + 보내기 버튼.
// 실제로 backend를 부르는 일은 부모(page.tsx)가 하고, 여기서는 입력만 받는다.
"use client";

import { useState } from "react";

type Props = {
  onSubmit: (question: string) => void; // 질문을 보낼 때 실행할 함수
  loading: boolean; // 답변을 기다리는 중인지
};

export default function QuestionForm({ onSubmit, loading }: Props) {
  const [question, setQuestion] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); // 페이지 새로고침 막기
    const trimmed = question.trim();
    if (trimmed) onSubmit(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="예: 대학을 바로 가지 않고 취업한 선배들은 왜 그렇게 선택했어?"
        rows={3}
        className="w-full resize-none rounded-lg border border-gray-300 p-3 text-base focus:border-indigo-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={loading || !question.trim()}
        className="self-end rounded-lg bg-indigo-600 px-5 py-2 font-medium text-white hover:bg-indigo-700 disabled:bg-gray-300"
      >
        {loading ? "찾는 중..." : "질문하기"}
      </button>
    </form>
  );
}
