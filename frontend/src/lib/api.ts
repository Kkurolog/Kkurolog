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
  url?: string | null; // [추가] 원문 주소. L3(실명 공개)일 때만 오고, 그 외에는 null (익명 보호)
  title?: string | null; // [추가] 원문 글 제목. url 과 같이 L3 일 때만 오고, 그 외에는 null
};

// [추가] 답변 종류. safety(위기 신호)면 멘토 추천 대신 상담 안내를 보여주는 게 좋다.
export type AnswerType = "answer" | "no_evidence" | "off_topic" | "safety";

// [추가] 카드형 답변의 카드 한 장 = 선배 한 명의 이야기
export type AnswerCard = {
  id: string; // "card-1" (목록 key, 순번)
  nickname: string | null; // 선배 별명. 공개 등급 L3 일 때만 오고, 그 외에는 null → label 을 제목으로 쓴다
  label: string; // 그 선배가 택한 길 = 어떻게 갔나 (예: "작게 바로 시작한 길")
  one_liner: string | null; // 그 선배가 지금 무엇을 하고 있나 (예: "지금은 여행 스타트업을 운영해요"). 글에 없으면 null
  body: string[]; // 본문 조각 2~4개 (주어 없이 쓴 문장)
  sources: Source[]; // 이 카드가 인용한 글 (카드별 출처, 보통 1개)
  avatar_id: string; // "avatar-1"~"avatar-7". 같은 선배는 항상 같은 값. 그림은 lib/avatar.ts 가 고른다
};

// [추가] 카드형 답변. components/AnswerCards.tsx 가 그린다
export type StructuredAnswer = {
  headline: string; // 질문에 대한 한 문장 답
  compare: string | null; // 선배들의 길이 어떻게 다른지 한 줄 (카드 2장 이상일 때만)
  cards: AnswerCard[]; // 1~4장
  closing: string | null; // 다음에 해 볼 만한 것 한 문장
};

// /ask 응답
export type AskResponse = {
  answer: string; // structured 가 있으면 같은 내용을 글로 풀어 쓴 것
  structured?: StructuredAnswer | null; // [추가] 카드형 답변. 실제 답변일 때만 오고, 안내 문구·demo 는 null
  sources: Source[];
  has_enough_evidence: boolean; // no_evidence 일 때만 false
  answer_type?: AnswerType; // [추가]
  // [추가] 서버 쪽 문제로 답하지 못했는지. true 면 has_enough_evidence 는 false 지만
  // "자료가 없어요"가 아니라 "잠깐 문제가 생겼어요"로 안내한다
  temporary_error?: boolean;
  // [추가] 이어지는 질문("다른 선배 얘기도 들려줘")에 더 전할 이야기가 없는지. true 면 "여기까지예요"로 안내한다
  // [추가] 학생이 멘토·프로필·연락할 선배를 찾았을 때 true. 답변 글 아래에 멘토 카드를 그린다.
  // 멘토는 mentor_query 로 recommendMentors 를 한 번 더 불러서 받는다 (이어지는 말이면 앞 질문의 주제가 들어 있다)
  show_mentors?: boolean;
  mentor_query?: string | null;
  no_more?: boolean;
  // [추가] 상담 번호가 들어 있는 안내(위기 안내 등)였는지. 받으면 같은 대화의 다음 요청부터 safety_notice_shown 을 보낸다
  safety_notice?: boolean;
  more_hint?: boolean; // [추가] 맺음말에 "다른 선배 이야기도 더 있어요"가 붙었는지. 받으면 다음 요청부터 more_hint_shown 을 보낸다
  crisis_notice?: boolean; // [추가] 위기 안내였는지. 받으면 다음 요청부터 crisis_notice_shown 을 보낸다
  // [추가] 카드 답변 위에 붙이는 한 줄 (감정이 담긴 진로 고민일 때 "막막한 게 당연해요. …"). 없으면 null
  preface?: string | null;
  intent?: Intent | null; // [추가] 학생의 말을 어떻게 이해했는지. 분석하지 않았으면 null
  user_context?: string | null; // [추가] 학생이 질문에서 스스로 밝힌 상황 (예: "18세, 창업 준비 중"). 없으면 null
  // [추가] 꾸로록 자신에 대한 질문(왜·누가 만들었는지, 자료, 신뢰, 질문 저장)에 고정 문구로 답했을 때 어느 측면인지.
  // 선배 글이 아니라 꾸로록의 설명이라 sources 는 비어 있다. answer 끝에 "꾸로록이 직접 알려드리는 내용이에요."가 붙는다
  about_aspect?: AboutAspect | null;
  follow_ups?: string[]; // [추가] 다음에 물어볼 예시 질문 (about_service 일 때 2개). answer 글에도 들어 있다
  emphasis?: string | null; // [추가] answer 안에서 굵게 강조할 문장 (글자 그대로 answer 에 들어 있다). 없으면 null
};

// [추가] backend/app/schemas.py 의 AboutAspect 와 같다
export type AboutAspect =
  | "what"
  | "name" // 이름의 뜻
  | "why"
  | "story" // 어떻게 시작됐는지
  | "survey" // 학생들에게 물어본 것
  | "difference" // 다른 AI 와 다른 점
  | "goal" // 바라는 것
  | "stage" // 지금 어느 단계인지
  | "who"
  | "data"
  | "trust"
  | "privacy";

// [추가] 1차 의도 분석 결과 (backend/app/schemas.py 의 Intent 와 같다)
// greeting·about_service·smalltalk·unclear 는 backend 가 고정 안내 문구로 답한다 (answer_type 은 off_topic)
export type Intent = "greeting" | "about_service" | "career_question" | "mentor_request" | "smalltalk" | "unclear";

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

// [추가] 답변을 기다리는 최대 시간. backend 의 최악 대기 시간(약 160초, backend/app/rag/config.py)보다 조금 길게 둔다.
// 이 시간이 지나면 기다리기를 그만두고 안내 문구를 보여준다 (화면이 끝없이 '찾는 중'으로 남지 않게)
const ASK_TIMEOUT_MS = 180_000;

// 질문과 함께 보내는 '이 대화의 맥락'. 모두 선택이고, backend 는 저장하지 않는다.
export type AskContext = {
  previousQuestion?: string | null; // 바로 앞 질문 ("더 자세히 알려줘" 같은 이어지는 질문을 이해하게)
  previousAnswer?: string | null; // 그 질문에 꾸로록이 한 답 (같은 답을 되풀이하지 않게)
  seenSourceIds?: string[]; // 이미 본 글 번호 ("다른 선배 얘기도 들려줘"일 때 그 글을 빼고 찾게)
  safetyNoticeShown?: boolean; // 상담 번호를 이미 받았는지 (가벼운 안내의 번호 줄을 되풀이하지 않게)
  moreHintShown?: boolean; // "다른 선배 이야기도 더 있어요"를 이미 봤는지 (대화당 한 번만 붙이게)
  crisisNoticeShown?: boolean; // 위기 안내 전체 문구를 이미 받았는지 (받았을 때만 짧은 형태로 다시 준다)
};

// 질문을 backend로 보내고 답변을 받아온다.
export async function askQuestion(question: string, context: AskContext = {}): Promise<AskResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const clientId = getClientId(); // [추가]
  if (clientId) headers["X-Client-Id"] = clientId;

  let res: Response;
  try {
    res = await fetch(`${API_URL}/ask`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        question,
        previous_question: context.previousQuestion ?? null,
        previous_answer: context.previousAnswer ? context.previousAnswer.slice(0, 6000) : null, // backend 가 받는 최대 길이
        seen_source_ids: (context.seenSourceIds ?? []).slice(-60), // backend 가 받는 최대 개수
        safety_notice_shown: context.safetyNoticeShown ?? false,
        crisis_notice_shown: context.crisisNoticeShown ?? false,
        more_hint_shown: context.moreHintShown ?? false,
      }),
      signal: AbortSignal.timeout(ASK_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error("답변이 너무 오래 걸려서 멈췄어요. 잠시 후 다시 물어봐 주세요.");
    }
    // [추가] 서버에 아예 닿지 못한 경우. 브라우저의 영어 문구("Failed to fetch")가 화면에 그대로 나오지 않게 한다
    throw new Error("서버 오류 (연결 실패)");
  }

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
  avatar_id?: string; // [추가] "avatar-1"~"avatar-7". 답변 카드의 같은 선배와 같은 그림 (lib/avatar.ts)
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
