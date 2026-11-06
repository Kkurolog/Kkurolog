// 채팅 대화 상태를 한 곳에서 관리하는 커스텀 훅.
// 화면(page.tsx)은 messages 를 그리고, 질문할 때 ask(질문)만 부르면 된다.
//
// 지금: 대화 내역은 이 훅의 state 에만 있어서 새로고침하면 사라진다.
//       backend 는 질문마다 따로 답한다 (이전 대화 맥락은 보내지 않음).
// 나중 계획: 대화 내역을 브라우저 localStorage 에 저장해 사용자마다 이력이 남고 이어지게 한다.
//           → 이 파일 안에서만 messages 를 읽고/저장하는 코드를 추가하면 된다.
"use client";

import { useState } from "react";
import { askQuestion } from "./api";
import type { AssistantMessage, ChatMessage } from "./types";

// 메시지마다 붙이는 고유 ID (화면에서 목록을 그릴 때 key 로 쓴다)
function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false); // 답변을 기다리는 중인지

  async function ask(question: string) {
    // 1. 학생 질문을 먼저 화면에 쌓는다
    setMessages((prev) => [...prev, { id: newId(), role: "user", content: question }]);
    setLoading(true);

    // 2. backend 에 묻고, 답변 메시지를 만든다
    let reply: AssistantMessage;
    try {
      const result = await askQuestion(question);
      reply = {
        id: newId(),
        role: "assistant",
        content: result.answer,
        question,
        sources: result.sources,
        hasEnoughEvidence: result.has_enough_evidence,
      };
    } catch {
      reply = {
        id: newId(),
        role: "assistant",
        content: "답변을 가져오지 못했어요. backend 서버가 켜져 있는지 확인해 주세요.",
        question,
        sources: [],
        hasEnoughEvidence: true,
        isError: true,
      };
    }

    // 3. 답변을 화면에 쌓는다
    setMessages((prev) => [...prev, reply]);
    setLoading(false);
  }

  return { messages, loading, ask };
}
