// 채팅 화면에서 쓰는 메시지 타입을 한 곳에 모아둔 파일.
// 나중에 대화 내역을 브라우저(localStorage)에 저장할 때도 이 타입을 그대로 저장하면 된다.
import type { Source } from "./api";

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
  hasEnoughEvidence: boolean; // 근거가 충분한지
  isError?: boolean; // backend 호출이 실패했는지
};

export type ChatMessage = UserMessage | AssistantMessage;
