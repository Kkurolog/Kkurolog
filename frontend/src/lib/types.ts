// 채팅 화면에서 쓰는 메시지·대화 타입을 한 곳에 모아둔 파일.
// 대화 기록은 이 모양 그대로 브라우저(localStorage)에 저장한다 (lib/useChat.ts).
import type { AboutAspect, MentorRecommendation, Source, StructuredAnswer } from "./api";

// 학생이 보낸 질문
export type UserMessage = {
  id: string;
  role: "user";
  content: string; // 질문 내용
};

// 꾸로록의 답변
export type AssistantMessage = {
  id: string;
  role: "assistant";
  content: string; // 답변 내용 (오류일 때는 오류 안내 문구)
  question: string; // 이 답변이 어떤 질문에 대한 것인지
  sources: Source[]; // 답변에 쓴 출처
  structured?: StructuredAnswer | null; // 카드형 답변 (선배 이야기일 때만). 있으면 content 대신 카드로 그린다
  aboutAspect?: AboutAspect | null; // 꾸로록 자신에 대한 설명일 때 (왜·누가 만들었는지 등). 있으면 '설명 블록'으로 그린다
  followUps?: string[]; // 다음에 물어볼 예시 질문. 있으면 답변 아래에 버튼으로 그린다
  emphasis?: string | null; // content 안에서 굵게 강조할 문장 (없으면 강조 없음)
  hasEnoughEvidence: boolean; // 근거가 충분한지
  safetyNotice?: boolean; // 상담 번호가 들어 있는 안내였는지 (같은 대화에서 긴 안내를 되풀이하지 않으려고 기억한다)
  moreHint?: boolean; // 맺음말에 "다른 선배 이야기도 더 있어요"가 붙었는지 (대화당 한 번만 붙이려고 기억한다)
  crisisNotice?: boolean; // 위기 안내였는지 (같은 대화에서 전체 문구를 되풀이하지 않으려고 기억한다)
  preface?: string | null; // 카드 답변 위에 붙이는 한 줄 (감정이 담긴 진로 고민일 때)
  showMentors?: boolean; // 멘토·프로필을 찾는 말에 대한 답인지. true 면 답변 글 아래에 멘토 카드를 그린다
  noMore?: boolean; // 이어지는 질문에 더 전할 이야기가 없는지 ("여기까지예요"로 안내한다)
  temporaryError?: boolean; // 서버 쪽 문제로 답하지 못했는지 (근거 부족과 구분해서 안내한다)
  mentors: MentorRecommendation[]; // 관련 경험을 가진 추천 멘토 (0~3명)
  isError?: boolean; // backend 호출이 실패했는지
};

export type ChatMessage = UserMessage | AssistantMessage;

// 대화 하나 (사이드바 '최근 대화'의 한 줄)
export type Conversation = {
  id: string;
  title: string; // 첫 질문 앞부분
  updatedAt: number; // 마지막으로 메시지가 쌓인 시각 (ms)
  messages: ChatMessage[];
};
