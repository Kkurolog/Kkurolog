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

// 온보딩: "자기소개 부탁해" 같은 질문에는 backend 를 부르지 않고 꾸로록 소개로 답한다 (와이어프레임 02-1)
const ONBOARDING_ANSWER = [
  "안녕! 나는 꾸로록이야.",
  "나는 거꾸로캠퍼스를 먼저 졸업한 선배들의 인터뷰를 바탕으로 너와 이야기를 나누는 챗봇이야.",
  "선배들이 어떤 진로를 선택했는지뿐 아니라, 그 과정에서 어떤 고민을 했고, 무엇을 시도했으며, 어떤 실패와 시행착오를 겪었는지도 들려줄 수 있어.",
  "아직 진로를 정하지 못했거나 무슨 질문을 해야 할지 모르겠어도 괜찮아. 우리 천천히 이야기해 보자!",
  "선배들의 어떤 경험이 궁금해?",
].join("\n\n");

function isOnboardingQuestion(question: string) {
  return /자기\s*소개|너는\s*누구|넌\s*누구|누구야/.test(question);
}

function useChatState() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false); // 답변을 기다리는 중인지

  async function ask(question: string) {
    // 1. 학생 질문을 먼저 화면에 쌓는다
    setMessages((prev) => [...prev, { id: newId(), role: "user", content: question }]);
    setLoading(true);

    // 2. 답변 메시지를 만든다
    let reply: AssistantMessage;
    if (isOnboardingQuestion(question)) {
      await new Promise((resolve) => setTimeout(resolve, 700)); // '답변 준비 중' 화면이 잠깐 보이게
      reply = {
        id: newId(),
        role: "assistant",
        content: ONBOARDING_ANSWER,
        question,
        sources: [],
        hasEnoughEvidence: true,
        mentors: [],
      };
    } else {
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
          hasEnoughEvidence: result.has_enough_evidence,
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
