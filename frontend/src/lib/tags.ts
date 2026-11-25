// 태그 code → 한글 이름. 기준은 docs/TAGS.md (TAGS.md 를 바꾸면 여기와 backend/app/ingest/tags.py 도 같이 바꾼다).
// 저장은 영어 code, 화면에는 한글 이름을 쓴다.

export const TOPIC_TAGS: Record<string, string> = {
  choice_reason: "선택 이유",
  worry: "고민",
  failure: "실패",
  turning_point: "전환점",
  what_helped: "도움된 것",
  advice: "조언",
  current_status: "근황",
  campus_experience: "거캠 경험",
  future_plan: "앞으로 계획",
  values: "가치관",
  etc: "기타",
};

export const PATH_TAGS: Record<string, string> = {
  domestic_university: "국내 대학",
  overseas_university: "해외 대학",
  alternative_university: "대안 대학",
  exam_prep: "입시 준비",
  employment: "취업",
  internship: "인턴십",
  startup: "창업",
  freelance: "프리랜서",
  gap_year: "갭이어",
  military_service: "군 복무",
  training_program: "교육 프로그램",
  etc: "기타",
};

export const FIELD_TAGS: Record<string, string> = {
  dev_it: "개발·IT",
  design_art: "디자인·예술",
  media_content: "미디어·콘텐츠",
  business_social_innovation: "경영·사회혁신",
  humanities_social: "인문·사회",
  science_engineering: "자연·공학",
  education: "교육",
  etc: "기타",
};
