// 인터뷰 넣기: 공개하기 전에 남은 할 일 (backend/app/ingest/draft.py 의 publish_problems 와 같은 규칙).
// 화면에서 미리 보여주려고 같은 검사를 한 번 더 한다. 최종 검사는 backend 가 한다.
import type { DraftPerson, ImportDraft } from "./adminApi";

export const PERSON_ID_PATTERN = /^p-[a-z0-9][a-z0-9-]{0,60}$/;
export const MAX_TOPICS = 2;

export function personName(p: DraftPerson) {
  return p.nickname || p.label || p.ref;
}

export function alumniRefs(draft: ImportDraft) {
  return new Set(draft.people.filter((p) => p.role === "alumni").map((p) => p.ref));
}

export function importProblems(draft: ImportDraft, existingIds: Set<string>): string[] {
  const problems: string[] = [];
  const alumni = draft.people.filter((p) => p.role === "alumni");
  const refs = new Set(alumni.map((p) => p.ref));
  const chunks = draft.chunks.filter((c) => refs.has(c.speaker));

  if (!draft.pii_checked) problems.push("개인정보 의심 부분을 확인해 주세요.");
  if (chunks.length === 0) problems.push("졸업생이 말한 조각이 하나도 없어요.");

  const newIds = new Set<string>();
  for (const p of alumni) {
    const name = personName(p);
    if (!p.confirmed) problems.push(`'${name}' 인물 정보를 확인해 주세요.`);
    if (p.link === "existing") {
      if (!existingIds.has(p.person_id)) problems.push(`'${name}': 연결할 인물을 골라 주세요.`);
      continue;
    }
    if (!p.nickname.trim()) problems.push(`'${name}': 별명을 적어 주세요.`);
    if (!PERSON_ID_PATTERN.test(p.person_id)) problems.push(`'${name}': 인물 ID는 p- 로 시작하고 영어 소문자·숫자·'-'만 쓸 수 있어요.`);
    else if (existingIds.has(p.person_id)) problems.push(`'${name}': 인물 ID ${p.person_id} 는 이미 있어요. 다른 ID를 쓰거나 '있는 인물에 연결'을 골라 주세요.`);
    else if (newIds.has(p.person_id)) problems.push(`'${name}': 인물 ID ${p.person_id} 가 이 파일 안에서 겹쳐요.`);
    newIds.add(p.person_id);
    if (p.career_paths.length === 0) problems.push(`'${name}': 진로 경로 태그를 하나 이상 골라 주세요 (맞는 게 없으면 기타).`);
    if (p.career_paths.includes("etc") && p.path_detail.length === 0) problems.push(`'${name}': 경로가 기타면 상세 내용을 적어 주세요.`);
    if (p.career_fields.includes("etc") && p.field_detail.length === 0) problems.push(`'${name}': 분야가 기타면 상세 내용을 적어 주세요.`);
  }

  const unconfirmed = chunks.filter((c) => !c.confirmed).length;
  if (unconfirmed) problems.push(`아직 확인하지 않은 조각이 ${unconfirmed}개 있어요.`);
  for (const c of chunks) {
    if (!c.content.trim()) problems.push(`조각 ${c.key}: 내용이 비어 있어요.`);
    if (c.topics.length < 1 || c.topics.length > MAX_TOPICS) problems.push(`조각 ${c.key}: 주제 태그를 1~2개 골라 주세요.`);
    if (c.topics.includes("etc") && c.topic_detail.length === 0) problems.push(`조각 ${c.key}: 주제가 기타면 상세 내용을 적어 주세요.`);
  }
  return problems;
}

// txt 파일 읽기: UTF-8 이 아니면(윈도우 메모장의 ANSI 저장 등) EUC-KR 로 다시 읽는다. UTF-16(BOM 있음)도 읽는다.
export async function readTextFile(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("euc-kr").decode(bytes);
  }
}

// 쉼표로 나눈 글 ↔ 목록
export const splitList = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
export const joinList = (list: string[]) => list.join(", ");
