// 메인 화면 (주소 "/")
// 질문 입력 → backend /ask 호출 → 답변과 출처 표시
"use client";

import { useState } from "react";
import QuestionForm from "@/components/QuestionForm";
import AnswerView from "@/components/AnswerView";
import { askQuestion, type AskResponse } from "@/lib/api";

export default function Home() {
  const [result, setResult] = useState<AskResponse | null>(null); // 받은 답변
  const [loading, setLoading] = useState(false); // 기다리는 중인지
  const [error, setError] = useState<string | null>(null); // 오류 메시지

  async function handleAsk(question: string) {
    setLoading(true);
    setError(null);
    try {
      setResult(await askQuestion(question));
    } catch {
      setError("답변을 가져오지 못했어요. backend 서버가 켜져 있는지 확인해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12">
      <header>
        <h1 className="text-3xl font-bold text-gray-900">꾸로록</h1>
        <p className="mt-1 text-gray-500">한 사람의 경험이 다음 학생의 선택지가 되도록.</p>
      </header>

      <QuestionForm onSubmit={handleAsk} loading={loading} />

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {result && <AnswerView result={result} />}
    </main>
  );
}
