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
