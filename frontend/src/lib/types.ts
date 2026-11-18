// 채팅 화면에서 쓰는 메시지 타입을 한 곳에 모아둔 파일.
// 나중에 대화 내역을 브라우저(localStorage)에 저장할 때도 이 타입을 그대로 저장하면 된다.
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
  question: string; // 이 답변이 어떤 질문에 대한 것인지 (연락 팝업에 미리 채울 때 쓴다)
  sources: Source[]; // 답변에 쓴 출처
  structured?: StructuredAnswer | null; // 카드형 답변 (선배 이야기일 때만). 있으면 content 대신 카드로 그린다
  aboutAspect?: AboutAspect | null; // 꾸로록 자신에 대한 설명일 때 (왜·누가 만들었는지 등). 있으면 '설명 블록'으로 그린다
  followUps?: string[]; // 다음에 물어볼 예시 질문. 있으면 답변 아래에 버튼으로 그린다
  hasEnoughEvidence: boolean; // 근거가 충분한지
  temporaryError?: boolean; // 서버 쪽 문제로 답하지 못했는지 (근거 부족과 구분해서 안내한다)
  mentors: MentorRecommendation[]; // 관련 경험을 가진 추천 멘토 (0~3명)
  isError?: boolean; // backend 호출이 실패했는지
};

export type ChatMessage = UserMessage | AssistantMessage;
