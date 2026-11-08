// backend API를 호출하는 함수와 응답 타입을 모아둔 파일.
// 타입은 backend/app/schemas.py 와 똑같이 맞춰야 한다.

// backend 주소. .env.local 의 NEXT_PUBLIC_API_URL 값을 사용한다.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// [백엔드 제안 브랜치 feat/ask-plan-draft에서 수정: docs/proposals/ask-plan.md]
// 새 필드는 모두 선택(?) 필드라서, 이 필드를 안 쓰는 기존 화면 코드는 그대로 동작한다.

// 답변의 근거가 된 인터뷰 구간 하나
export type Source = {
  alumni: string;
  // 공개 등급 L1(원문 비공개)이면 null. 그 외에는 지금처럼 항상 문자열이다.
  // [수정] string → string | null. 실제 L1 데이터가 들어오기 전까지 null 은 오지 않는다.
  excerpt: string | null;
  interview_id: string;
  visibility?: "L1" | "L2" | "L3" | null; // [추가] 공개 등급
  date?: string | null; // [추가] 글·인터뷰 날짜 (오래된 정보 표시용)
  url?: string | null; // [추가] 원문 주소 (L1 이면 null)
};

// [추가] 답변 종류. safety(위기 신호)면 멘토 추천 대신 상담 안내를 보여주는 게 좋다.
export type AnswerType = "answer" | "no_evidence" | "off_topic" | "safety";

// /ask 응답
export type AskResponse = {
  answer: string;
  sources: Source[];
  has_enough_evidence: boolean; // no_evidence 일 때만 false
  answer_type?: AnswerType; // [추가]
};

// [추가] 브라우저별 익명 ID. backend 가 '학생 한 명당 질문 횟수'를 셀 때 쓴다.
// 학교 와이파이는 모두 IP가 같아서 IP로는 학생을 구분할 수 없다.
// 이름·이메일 같은 개인정보는 들어 있지 않은 무작위 값이다.
// (쿠키는 프론트·백엔드 도메인이 달라 브라우저가 막을 수 있어서 localStorage + 헤더를 쓴다)
const CLIENT_ID_KEY = "kkurolog-client-id";

function getClientId(): string | null {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    // 사생활 보호 모드 등으로 저장이 막히면 헤더 없이 보낸다 (backend 는 IP 기준 제한만 적용)
    return null;
  }
}

// 질문을 backend로 보내고 답변을 받아온다.
export async function askQuestion(question: string): Promise<AskResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const clientId = getClientId(); // [추가]
  if (clientId) headers["X-Client-Id"] = clientId;

  const res = await fetch(`${API_URL}/ask`, {
    method: "POST",
    headers,
    body: JSON.stringify({ question }),
  });

  if (!res.ok) {
    // [추가] 429(질문 횟수 초과)는 backend 가 한국어 안내(detail)를 보내준다.
    if (res.status === 429) {
      const body = await res.json().catch(() => null);
      throw new Error(typeof body?.detail === "string" ? body.detail : "잠시 후 다시 시도해 주세요.");
    }
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

// /contact-requests 요청: 학생 → 꾸로록 → 멘토 첫 연락
export type ContactRequest = {
  mentor_id: string;
  sender_name: string; // 내 이름 또는 별명 (1~30자)
  reply_email: string; // 답장 받을 이메일
  subject: string; // 메일 제목 (1~100자)
  message: string; // 질문 내용 (10~2000자)
};

// /contact-requests 응답
export type ContactResponse = {
  status: "delivered";
  message: string; // 학생에게 보여줄 안내 문구
};

// 멘토에게 첫 연락을 보낸다. 실패하면 화면에 보여줄 문구를 담아 오류를 던진다.
export async function sendContactRequest(request: ContactRequest): Promise<ContactResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/contact-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    // 서버에 아예 닿지 못한 경우 (backend 가 꺼져 있거나 인터넷 문제)
    throw new Error("서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }

  if (!res.ok) {
    // 404, 409 는 backend 가 한국어 안내(detail)를 보내준다. 422 는 입력 형식 오류.
    const body = await res.json().catch(() => null);
    const detail =
      typeof body?.detail === "string"
        ? body.detail
        : res.status === 422
          ? "입력한 내용을 다시 확인해 주세요. (이메일 형식, 질문은 10자 이상)"
          : `서버 오류 (${res.status})`;
    throw new Error(detail);
  }
  return res.json();
}
