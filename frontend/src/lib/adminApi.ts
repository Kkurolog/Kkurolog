// 관리자 화면(/admin)에서 backend /admin/* 를 부르는 함수 + 응답 타입.
// 타입은 backend/app/admin/models.py 와 같은 모양이다. (한쪽을 바꾸면 다른 쪽도 같이 바꾼다)
//
// 로그인 흐름
// 1. 비밀번호 → POST /admin/login → token 을 받는다 (12시간 유효)
// 2. token 은 이 탭의 sessionStorage 에만 둔다. 탭을 닫으면 사라진다.
// 3. 이후 요청마다 "Authorization: Bearer <token>" 헤더를 붙인다.
// 4. 401 이 오면 token 을 지우고 로그인 화면으로 돌아간다 ("다시 로그인해 주세요.").
//
// 지켜야 할 것
// - 비밀번호는 코드나 NEXT_PUBLIC_ 환경변수에 넣지 않는다. 사람이 입력한 값을 login() 으로 보내기만 한다.
// - 학생 이름·메일 같은 개인정보가 담긴 응답은 console.log 로 찍지 않는다.
// - 진짜 보안은 backend 가 지킨다. 이 화면은 token 이 없으면 로그인 창을 보여줄 뿐이다.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const TOKEN_KEY = "kkurolog-admin-token";
const EXPIRES_KEY = "kkurolog-admin-expires";
const AUTH_EVENT = "kkurolog-admin-auth"; // 같은 탭 안에서 로그인 상태가 바뀌었다고 알리는 신호

export const RELOGIN_MESSAGE = "다시 로그인해 주세요.";

// ---------------------------------------------------------------- 타입 (backend/app/admin/models.py)
export type InquiryItem = {
  id: string; // 문의번호. 예: q20261117-0001
  created_at: string; // 보낸 일시 (ISO)
  mentor_id: string;
  mentor_name: string | null; // 멘토가 지워졌으면 null
  student_name: string;
  student_email: string;
  title: string;
  body: string;
  replied: boolean;
  replied_at: string | null; // 첫 답장 시각
  reminded_at: string | null; // 리마인드 보낸 시각
};

export type Paged<T> = { total: number; page: number; page_size: number; items: T[] };

export type ReplyStatus = "forwarded" | "needs_review" | "failed";

export type ReplyItem = {
  message_id: string;
  inquiry_id: string | null;
  from_email: string;
  received_at: string;
  status: ReplyStatus;
  reason: string | null; // sender_mismatch, empty_body 등
  reply_text: string | null;
};

export type InquiryDetail = { item: InquiryItem; replies: ReplyItem[] };

export type ReviewItem = ReplyItem & {
  inquiry_title: string | null;
  student_name: string | null;
  mentor_id: string | null;
};

export type AdminMentor = {
  id: string;
  name: string;
  exit_year: number | null;
  career_paths: string[];
  path_summary: string;
  summary: string;
  tags: string[];
  topics: string[];
  consent: boolean; // 참여 동의 (false 면 학생 화면 어디에도 안 보임)
  available: boolean; // 지금 문의를 받는지
  email: string | null;
};

export type MentorCreate = Omit<AdminMentor, "email"> & { email: string | null };
// 보낸 칸만 바뀐다. email 에 "" 나 null 을 보내면 메일 주소를 지운다. id 는 바꿀 수 없다.
export type MentorUpdate = Partial<Omit<AdminMentor, "id">>;

export type SettingItem = { key: string; value: string; description: string };

// ---------------------------------------------------------------- token 보관 (sessionStorage)
let lastLogoutReason: string | null = null; // 마지막으로 로그아웃된 이유 (만료·401)

// 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서도 화면이 깨지지 않게 try/catch 로 감싼다.
function read(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = read(TOKEN_KEY);
  const expires = Number(read(EXPIRES_KEY));
  if (token && expires && Date.now() >= expires) return null; // 12시간이 지났으면 없는 것으로 본다
  return token;
}

// 저장된 token 이 있었는데 시간이 지나 만료됐는지 (로그인 화면에 '다시 로그인해 주세요.'를 보여줄지)
export function isSessionExpired(): boolean {
  if (typeof window === "undefined") return false;
  const expires = Number(read(EXPIRES_KEY));
  return Boolean(read(TOKEN_KEY) && expires && Date.now() >= expires);
}

function saveToken(token: string, expiresAt: string) {
  try {
    window.sessionStorage.setItem(TOKEN_KEY, token);
    const ms = Date.parse(expiresAt);
    if (ms) window.sessionStorage.setItem(EXPIRES_KEY, String(ms));
  } catch {
    // 저장을 못 하면 로그인 상태를 유지할 수 없다 (브라우저 설정 문제)
  }
  lastLogoutReason = null;
  window.dispatchEvent(new CustomEvent(AUTH_EVENT));
}

// 로그아웃·만료. reason 이 있으면 로그인 화면에 그 문구를 보여준다.
export function clearToken(reason?: string) {
  try {
    window.sessionStorage.removeItem(TOKEN_KEY);
    window.sessionStorage.removeItem(EXPIRES_KEY);
  } catch {
    // 무시
  }
  lastLogoutReason = reason ?? null;
  window.dispatchEvent(new CustomEvent(AUTH_EVENT));
}

// 로그인 화면에 보여줄 '왜 로그아웃됐는지' 문구 (직접 로그아웃했으면 null)
export function getLogoutReason(): string | null {
  return lastLogoutReason ?? (isSessionExpired() ? RELOGIN_MESSAGE : null);
}

// useSyncExternalStore 로 로그인 상태를 구독할 때 쓴다
export function subscribeAuth(callback: () => void) {
  window.addEventListener(AUTH_EVENT, callback);
  return () => window.removeEventListener(AUTH_EVENT, callback);
}

// ---------------------------------------------------------------- 요청
export class AdminApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// FastAPI 오류 응답에서 사람이 읽을 문구를 꺼낸다.
// detail 이 문자열이면 그대로(backend 가 한국어로 써 둠), 입력 검사 실패(배열)면 일반 문구.
async function errorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.detail === "string") return data.detail;
    if (Array.isArray(data?.detail)) return "입력한 내용을 다시 확인해 주세요.";
  } catch {
    // 본문이 JSON 이 아니면 아래 기본 문구
  }
  if (res.status >= 500) return "서버에 문제가 있어요. 잠시 후 다시 시도해 주세요.";
  return "요청을 처리하지 못했어요.";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  if (!token) {
    clearToken(RELOGIN_MESSAGE);
    throw new AdminApiError(401, RELOGIN_MESSAGE);
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init.headers },
      cache: "no-store",
    });
  } catch {
    throw new AdminApiError(0, "서버에 연결하지 못했어요. backend 서버가 켜져 있는지 확인해 주세요.");
  }
  if (res.status === 401) {
    clearToken(RELOGIN_MESSAGE);
    throw new AdminApiError(401, RELOGIN_MESSAGE);
  }
  if (!res.ok) throw new AdminApiError(res.status, await errorMessage(res));
  if (res.status === 204) return undefined as T; // 지우기 등 본문이 없는 응답
  return (await res.json()) as T;
}

function query(params: Record<string, string | number | boolean | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

// ---------------------------------------------------------------- API
export async function login(password: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
      cache: "no-store",
    });
  } catch {
    throw new AdminApiError(0, "서버에 연결하지 못했어요. backend 서버가 켜져 있는지 확인해 주세요.");
  }
  if (!res.ok) throw new AdminApiError(res.status, await errorMessage(res));
  const data = (await res.json()) as { token: string; expires_at: string };
  saveToken(data.token, data.expires_at);
}

export function logout() {
  clearToken();
}

export const PAGE_SIZE = 20;

// replied: true=답장 받음, false=답장 전, undefined=전체
export function fetchInquiries(opts: { replied?: boolean; page?: number; pageSize?: number } = {}) {
  return request<Paged<InquiryItem>>(
    `/admin/inquiries${query({ replied: opts.replied, page: opts.page ?? 1, page_size: opts.pageSize ?? PAGE_SIZE })}`,
  );
}

export function fetchInquiry(id: string) {
  return request<InquiryDetail>(`/admin/inquiries/${encodeURIComponent(id)}`);
}

export function fetchReview(opts: { page?: number; pageSize?: number } = {}) {
  return request<Paged<ReviewItem>>(
    `/admin/replies/review${query({ page: opts.page ?? 1, page_size: opts.pageSize ?? PAGE_SIZE })}`,
  );
}

export function fetchAdminMentors() {
  return request<AdminMentor[]>("/admin/mentors");
}

export function createMentor(body: MentorCreate) {
  return request<AdminMentor>("/admin/mentors", { method: "POST", body: JSON.stringify(body) });
}

export function updateMentor(id: string, body: MentorUpdate) {
  return request<AdminMentor>(`/admin/mentors/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function fetchSettings() {
  return request<SettingItem[]>("/admin/settings");
}

export function updateSettings(values: Record<string, string>) {
  return request<SettingItem[]>("/admin/settings", { method: "PATCH", body: JSON.stringify({ values }) });
}

// ---------------------------------------------------------------- 인터뷰 넣기 (backend/app/ingest/models.py)
export type ImportStatus = "analyzing" | "review" | "published" | "failed";

export type ImportSummary = { people: number; chunks: number; confirmed: number; pii: number };

export type ImportItem = {
  id: string; // 예: imp-20261125-a1b2c3
  filename: string;
  status: ImportStatus;
  error: string | null;
  summary: ImportSummary | null;
  source_id: string | null; // 공개 후 sources.id
  created_at: string;
  updated_at: string;
  analyzed_at: string | null;
  published_at: string | null;
};

export type DraftSource = {
  title: string;
  source_type: "졸업생 인터뷰" | "졸업생 에세이";
  published_at: string | null; // YYYY-MM-DD
  visibility: "L1" | "L2" | "L3";
};

export type PersonRole = "alumni" | "interviewer" | "other";

export type DraftPerson = {
  ref: string; // 초안 안의 이름표 (S1, S2 …)
  label: string; // 원문에서 이 사람을 부르는 표시 (실명일 수 있다)
  role: PersonRole;
  link: "new" | "existing";
  person_id: string;
  nickname: string;
  real_name: string;
  path_summary: string;
  career_paths: string[];
  path_detail: string[];
  career_fields: string[];
  field_detail: string[];
  organizations: string[];
  ai_career_paths: string[];
  ai_career_fields: string[];
  confirmed: boolean;
};

export type DraftChunk = {
  key: string; // 초안 안의 이름표 (c01, c02 …)
  speaker: string; // DraftPerson.ref
  question: string;
  content: string;
  lines: number[]; // 원문 줄 번호 [시작, 끝]
  topics: string[];
  topic_detail: string[];
  ai_topics: string[];
  confirmed: boolean;
};

export type PiiFlag = {
  line: number;
  text: string;
  kind: "name" | "school" | "phone" | "email" | "address" | "other";
  by: "ai" | "rule";
};

export type ImportDraft = {
  source: DraftSource;
  people: DraftPerson[];
  chunks: DraftChunk[];
  pii: PiiFlag[];
  pii_checked: boolean;
  model: string;
  note: string | null;
};

export type ImportDetail = { item: ImportItem; raw_text: string; draft: ImportDraft | null };

export type PersonOption = {
  id: string;
  nickname: string;
  path_summary: string | null;
  career_paths: string[];
  career_fields: string[];
};

export type PublishResult = { source_id: string; people: number; chunks: number };

export const MAX_IMPORT_FILES = 20;
export const MAX_IMPORT_CHARS = 100_000;

export function uploadImports(files: { filename: string; text: string }[]) {
  return request<ImportItem[]>("/admin/imports", { method: "POST", body: JSON.stringify({ files }) });
}

export function fetchImports(opts: { page?: number; pageSize?: number } = {}) {
  return request<Paged<ImportItem>>(`/admin/imports${query({ page: opts.page ?? 1, page_size: opts.pageSize ?? PAGE_SIZE })}`);
}

export function fetchImport(id: string) {
  return request<ImportDetail>(`/admin/imports/${encodeURIComponent(id)}`);
}

export function saveImportDraft(id: string, draft: ImportDraft) {
  return request<ImportDetail>(`/admin/imports/${encodeURIComponent(id)}/draft`, {
    method: "PUT",
    body: JSON.stringify(draft),
  });
}

export function reanalyzeImport(id: string) {
  return request<ImportItem>(`/admin/imports/${encodeURIComponent(id)}/analyze`, { method: "POST" });
}

export function publishImport(id: string) {
  return request<PublishResult>(`/admin/imports/${encodeURIComponent(id)}/publish`, { method: "POST" });
}

export function deleteImport(id: string) {
  return request<void>(`/admin/imports/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function fetchImportPeople() {
  return request<PersonOption[]>("/admin/imports/people");
}

// ---------------------------------------------------------------- 화면 표시 도우미
// "2026.11.17 18:42" (한국 시간)
const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const p = Object.fromEntries(dateFormat.formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.year}.${p.month}.${p.day} ${p.hour}:${p.minute}`;
}

export const REPLY_STATUS_LABEL: Record<ReplyStatus, string> = {
  forwarded: "학생에게 전달함",
  needs_review: "확인필요",
  failed: "전달 실패",
};

const REASON_LABEL: Record<string, string> = {
  sender_mismatch: "등록된 멘토 메일이 아닌 주소에서 옴",
  empty_body: "전달할 내용이 없음",
};

export function reasonLabel(reason: string | null): string {
  if (!reason) return "—";
  return REASON_LABEL[reason] ?? reason;
}
