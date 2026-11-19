// 채팅 대화 상태를 한 곳에서 관리한다.
// layout.tsx 가 <ChatProvider>로 모든 페이지를 감싸고, 화면에서는 useChat() 으로 꺼내 쓴다.
// 이렇게 하면 멘토 리스트에 갔다가 돌아와도 대화가 그대로 남아 있고,
// 왼쪽 메뉴의 '새 채팅'에서도 대화가 있는지 확인하고(→ 확인 창) 지울 수 있다.
//
// 지금: 대화 내역은 메모리에만 있어서 새로고침하면 사라진다.
//       backend 는 질문마다 따로 답한다 (이전 대화 맥락은 보내지 않음).
// 나중 계획: 대화 내역을 브라우저 localStorage 에 저장 → 이 파일 안에서만 고치면 된다.
"use client";

import { createContext, createElement, useContext, useState } from "react";
import { askQuestion, recommendMentors } from "./api";
import type { AssistantMessage, ChatMessage } from "./types";

// 메시지마다 붙이는 고유 ID (화면에서 목록을 그릴 때 key 로 쓴다)
function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// 인사("안녕")·자기소개 요청("넌 누구야")도 backend 로 보낸다.
// backend 가 문맥으로 판단해서(1차 의도 분석, backend/app/rag/intent.py) 꾸로록 소개 문구로 답한다.
// 예전에는 여기서 키워드로 골랐는데, "창업한 선배는 누구야?" 같은 진짜 질문까지 소개로 답하는 문제가 있었다.

function useChatState() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false); // 답변을 기다리는 중인지

  async function ask(question: string) {
    // 1. 학생 질문을 먼저 화면에 쌓는다
    setMessages((prev) => [...prev, { id: newId(), role: "user", content: question }]);
    setLoading(true);

    // 2. 답변 메시지를 만든다
    let reply: AssistantMessage;
    try {
      // 답변과 멘토 추천을 동시에 요청한다.
      // 멘토 추천이 실패해도 답변은 보여줄 수 있게, 추천 실패는 빈 목록으로 처리한다.
      const [result, recommend] = await Promise.all([
        askQuestion(question),
        recommendMentors(question).catch(() => ({ recommendations: [], is_fallback: true })),
      ]);
      reply = {
        id: newId(),
        role: "assistant",
        content: result.answer,
        question,
        sources: result.sources,
        structured: result.structured ?? null,
        aboutAspect: result.about_aspect ?? null,
        followUps: result.follow_ups ?? [],
        hasEnoughEvidence: result.has_enough_evidence,
        temporaryError: result.temporary_error ?? false,
        mentors: recommend.recommendations,
      };
    } catch (err) {
      reply = {
        id: newId(),
        role: "assistant",
        content:
          err instanceof Error && !err.message.startsWith("서버 오류")
            ? err.message // 429(질문 횟수 초과) 같은 안내 문구
            : "답변을 가져오지 못했어요. backend 서버가 켜져 있는지 확인해 주세요.",
        question,
        sources: [],
        hasEnoughEvidence: true,
        mentors: [],
        isError: true,
      };
    }

    // 3. 답변을 화면에 쌓는다
    setMessages((prev) => [...prev, reply]);
    setLoading(false);
  }

  // 새 채팅: 대화를 모두 지운다
  function reset() {
    setMessages([]);
    setLoading(false);
  }

  return { messages, loading, ask, reset };
}

type ChatState = ReturnType<typeof useChatState>;

const ChatContext = createContext<ChatState | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const chat = useChatState();
  return createElement(ChatContext.Provider, { value: chat }, children);
}

export function useChat(): ChatState {
  const chat = useContext(ChatContext);
  if (!chat) throw new Error("useChat 은 <ChatProvider> 안에서만 쓸 수 있어요.");
  return chat;
}
