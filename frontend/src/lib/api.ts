// backend API를 호출하는 함수와 응답 타입을 모아둔 파일.
// 타입은 backend/app/schemas.py 와 똑같이 맞춰야 한다.

// backend 주소. .env.local 의 NEXT_PUBLIC_API_URL 값을 사용한다.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// 답변의 근거가 된 인터뷰 구간 하나
export type Source = {
  alumni: string;
  excerpt: string;
  interview_id: string;
};

// /ask 응답
export type AskResponse = {
  answer: string;
  sources: Source[];
  has_enough_evidence: boolean;
};

// 질문을 backend로 보내고 답변을 받아온다.
export async function askQuestion(question: string): Promise<AskResponse> {
  const res = await fetch(`${API_URL}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });

  if (!res.ok) {
    throw new Error(`서버 오류 (${res.status})`);
  }
  return res.json();
}

// 멘토 프로필 (공개해도 되는 필드만. 이메일은 backend가 절대 보내지 않는다)
export type Mentor = {
  id: string;
  name: string; // 이름 또는 별명
  exit_year: number; // 엑시트(졸업) 연도
  career_paths: string[]; // 진로 경로 (대학 진학 / 해외 대학 / 취업 / 창업 / 디자인·예술 / 개발 / 기타 경로)
  path_summary: string; // 진로 경로 한 줄 요약
  summary: string; // 경험 요약 1~2줄
  tags: string[]; // 경험 태그
  topics: string[]; // 답변 가능 주제
  available: boolean; // 지금 연락 가능한지
};

// 멘토 목록을 받아온다 (참여에 동의한 멘토만 온다).
export async function fetchMentors(): Promise<Mentor[]> {
  const res = await fetch(`${API_URL}/mentors`);
  if (!res.ok) {
    throw new Error(`서버 오류 (${res.status})`);
  }
  return res.json();
}

// 추천 멘토 한 명 + 추천 이유
export type MentorRecommendation = {
  mentor: Mentor;
  reason: string;
};

// /mentors/recommend 응답
export type RecommendResponse = {
  recommendations: MentorRecommendation[];
  is_fallback: boolean; // 질문과 맞는 멘토가 없어 '다양한 경험' 멘토를 대신 보여주는지
};

// 질문에 맞는 멘토를 추천받는다 (/ask 와 따로 부른다).
export async function recommendMentors(question: string): Promise<RecommendResponse> {
  const res = await fetch(`${API_URL}/mentors/recommend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) {
    throw new Error(`서버 오류 (${res.status})`);
  }
  return res.json();
}
