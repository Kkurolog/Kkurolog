// 채팅 대화 상태를 한 곳에서 관리한다.
// layout.tsx 가 <ChatProvider>로 모든 페이지를 감싸고, 화면에서는 useChat() 으로 꺼내 쓴다.
//
// 대화 기록(히스토리):
// - 대화는 여러 개(conversations)를 갖고, 지금 보고 있는 대화(currentId)가 하나 있다.
// - 대화 기록은 이 브라우저의 localStorage 에만 저장한다. 서버에는 올리지 않는다.
//   (학생 상당수가 미성년자라 질문 내용을 서버에 쌓지 않는다. 같은 기기를 쓰는 사람에겐 보이니
//    사이드바에서 대화마다 지울 수 있게 했다)
// - '새 채팅'은 지금 대화를 기록에 남겨 두고 빈 화면으로 간다. 사이드바의 '최근 대화'에서 다시 열 수 있다.
// - backend 에는 지금 질문과 '바로 앞 질문과 그 답 하나'만 보낸다 (이어지는 질문을 이해하는 용도. 서버에 저장하지 않는다).
"use client";

import { createContext, createElement, useContext, useEffect, useRef, useState } from "react";
import { askQuestion, recommendMentors } from "./api";
import type { AskContext } from "./api";
import type { AssistantMessage, ChatMessage, Conversation } from "./types";

const STORAGE_KEY = "kkurolog-chats-v1"; // 대화 기록을 저장하는 브라우저 저장소 이름 (형식이 바뀌면 v2 로)
const MAX_CONVERSATIONS = 30; // 이보다 많으면 오래된 대화부터 지운다

// 브라우저 저장소는 막혀 있거나(시크릿 모드 등) 내용이 망가져 있을 수 있어서, 실패해도 화면이 멈추지 않게 감싼다.
// 저장소를 읽을 수 없으면 null 을 돌려준다 (그때는 화면이 들고 있는 목록을 그대로 쓴다)
function loadConversations(): Conversation[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Conversation[]) : [];
  } catch {
    return null;
  }
}

function saveConversations(conversations: Conversation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch {
    // 저장소가 가득 찼거나 막혀 있으면 이번 방문 동안만 기억한다
  }
}

// 대화 제목: 첫 질문을 30자까지 자른다
function titleFrom(question: string) {
  const text = question.replace(/\s+/g, " ").trim();
  return text.length > 30 ? `${text.slice(0, 30)}…` : text;
}

// 메시지마다 붙이는 고유 ID (화면에서 목록을 그릴 때 key 로 쓴다)
function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// 인사("안녕")·자기소개 요청("넌 누구야")도 backend 로 보낸다.
// backend 가 문맥으로 판단해서(1차 의도 분석, backend/app/rag/intent.py) 꾸로록 소개 문구로 답한다.
// 예전에는 여기서 키워드로 골랐는데, "창업한 선배는 누구야?" 같은 진짜 질문까지 소개로 답하는 문제가 있었다.

// 질문 하나에 대한 답변 메시지를 만든다 (인사·자기소개도 backend 가 답한다)
// context: 이 대화의 맥락 (바로 앞 질문·답, 이미 본 글, 상담 안내를 받았는지). lib/api.ts 의 AskContext 참고
async function buildReply(question: string, context: AskContext): Promise<AssistantMessage> {
  try {
    // 답변과 멘토 추천을 동시에 요청한다.
    // 멘토 추천이 실패해도 답변은 보여줄 수 있게, 추천 실패는 빈 목록으로 처리한다.
    const [result, recommend] = await Promise.all([
      askQuestion(question, context),
      recommendMentors(question).catch(() => ({ recommendations: [], is_fallback: true })),
    ]);
    return {
      id: newId(),
      role: "assistant",
      content: result.answer,
      question,
      sources: result.sources,
      structured: result.structured ?? null,
      aboutAspect: result.about_aspect ?? null,
      followUps: result.follow_ups ?? [],
      emphasis: result.emphasis ?? null,
      hasEnoughEvidence: result.has_enough_evidence,
      noMore: result.no_more ?? false,
      safetyNotice: result.safety_notice ?? false,
      crisisNotice: result.crisis_notice ?? false,
      moreHint: result.more_hint ?? false,
      preface: result.preface ?? null,
      temporaryError: result.temporary_error ?? false,
      mentors: recommend.recommendations,
    };
  } catch (err) {
    return {
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

function useChatState() {
  const [conversations, setConversations] = useState<Conversation[]>([]); // 최근 대화가 앞쪽
  const [currentId, setCurrentId] = useState<string | null>(null); // 지금 보고 있는 대화 (null 이면 새 채팅 화면)
  const [pendingIds, setPendingIds] = useState<string[]>([]); // 답변을 기다리는 대화들
  const memory = useRef<Conversation[]>([]); // 저장소를 못 쓸 때를 대비해 화면이 들고 있는 목록

  // 대화 목록 바꾸기: 항상 '저장소의 최신 목록'을 읽어서 고친 뒤 저장한다.
  // (탭을 여러 개 열어 둬도, 한 탭이 들고 있던 옛 목록으로 덮어써서 지운 대화가 되살아나지 않게)
  function mutate(change: (list: Conversation[]) => Conversation[]) {
    const next = change(loadConversations() ?? memory.current);
    memory.current = next;
    saveConversations(next);
    setConversations(next);
  }

  useEffect(() => {
    // 처음 열 때 저장된 대화 기록을 불러온다 (localStorage 는 브라우저에서만 읽을 수 있어서 화면이 뜬 뒤에 읽는다)
    const timer = setTimeout(() => {
      memory.current = loadConversations() ?? [];
      setConversations(memory.current);
    }, 0);
    // 다른 탭에서 대화를 보내거나 지우면 이 탭의 목록도 맞춘다
    function handleStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY && e.key !== null) return;
      memory.current = loadConversations() ?? memory.current;
      setConversations(memory.current);
    }
    window.addEventListener("storage", handleStorage);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const current = conversations.find((c) => c.id === currentId) ?? null;
  const messages = current?.messages ?? [];
  const loading = currentId !== null && pendingIds.includes(currentId);

  // 대화 하나에 메시지를 붙이고, 그 대화를 목록 맨 앞으로 올린다
  function append(conversationId: string, message: ChatMessage) {
    mutate((list) => {
      const target = list.find((c) => c.id === conversationId);
      if (!target) return list; // 기다리는 사이 지워진 대화면 버린다 (되살리지 않는다)
      const updated = { ...target, messages: [...target.messages, message], updatedAt: Date.now() };
      return [updated, ...list.filter((c) => c.id !== conversationId)];
    });
  }

  async function ask(question: string) {
    // 1. 새 채팅 화면이면 대화를 새로 만들고, 학생 질문을 먼저 쌓는다
    let conversationId = currentId;
    // 이 대화에서 바로 앞에 한 질문 (새 채팅이면 없음)
    const previousQuestion = messages.findLast((m) => m.role === "user")?.content ?? null;
    // 그 질문에 꾸로록이 한 답 (오류 안내는 답이 아니라서 보내지 않는다)
    const lastReply = messages.findLast((m) => m.role === "assistant");
    const previousAnswer = lastReply && !lastReply.isError ? lastReply.content : null;
    // 이 대화에서 이미 본 글 번호 ("다른 선배 얘기도 들려줘"라고 하면 backend 가 이 글들을 빼고 찾는다)
    const seenSourceIds = [
      ...new Set(messages.flatMap((m) => (m.role === "assistant" ? m.sources.map((s) => s.interview_id) : []))),
    ];
    // 이 대화에서 상담 번호 안내를 이미 받았는지 (받았으면 backend 가 같은 긴 안내를 되풀이하지 않는다)
    const safetyNoticeShown = messages.some((m) => m.role === "assistant" && m.safetyNotice);
    const moreHintShown = messages.some((m) => m.role === "assistant" && m.moreHint);
    const crisisNoticeShown = messages.some((m) => m.role === "assistant" && m.crisisNotice);
    const userMessage: ChatMessage = { id: newId(), role: "user", content: question };
    if (conversationId === null) {
      const created: Conversation = {
        id: newId(),
        title: titleFrom(question),
        updatedAt: Date.now(),
        messages: [userMessage],
      };
      conversationId = created.id;
      mutate((list) => [created, ...list].slice(0, MAX_CONVERSATIONS));
      setCurrentId(created.id);
    } else {
      append(conversationId, userMessage);
    }
    const id = conversationId;
    setPendingIds((prev) => [...prev, id]);

    // 2. 답변을 받아 '질문했던 그 대화'에 붙인다 (기다리는 사이 다른 대화를 열어도 섞이지 않는다)
    const reply = await buildReply(question, {
      previousQuestion,
      previousAnswer,
      seenSourceIds,
      safetyNoticeShown,
      crisisNoticeShown,
      moreHintShown,
    });
    append(id, reply);
    setPendingIds((prev) => prev.filter((p) => p !== id));
  }

  // 새 채팅: 지금 대화는 기록에 남겨 두고 빈 화면으로
  function startNew() {
    setCurrentId(null);
  }

  // 로고를 눌렀을 때: 메인(첫) 화면으로. 새 채팅과 같고, 열려 있던 사용 가이드 등 메인 화면 상태도 처음으로 되돌린다
  // (homeVersion 이 바뀌면 메인 화면이 가이드를 새로 그려서 닫힌 상태가 된다)
  const [homeVersion, setHomeVersion] = useState(0);
  function goHome() {
    setCurrentId(null);
    setHomeVersion((v) => v + 1);
  }

  // 최근 대화 하나 열기
  function open(conversationId: string) {
    setCurrentId(conversationId);
  }

  // 대화 하나 지우기 (지금 보던 대화면 새 채팅 화면으로)
  function remove(conversationId: string) {
    mutate((list) => list.filter((c) => c.id !== conversationId));
    if (conversationId === currentId) setCurrentId(null);
  }

  return { conversations, currentId, messages, loading, ask, startNew, goHome, homeVersion, open, remove };
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
