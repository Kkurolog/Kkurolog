/**
 * Config.gs — 설정값과 공통 도구 (B 방식: 메일 전용)
 *
 * 이 프로젝트가 하는 일은 세 가지뿐입니다. 저장·판단은 모두 팀 백엔드 + Supabase가 합니다.
 *   1. 백엔드가 부르면 중계 Gmail로 메일을 보낸다 (sendMail)
 *   2. 5분마다 중계 Gmail에 온 멘토 답장 후보를 백엔드로 넘긴다 (checkReplies)
 *   3. 매일 한 번 백엔드에 "리마인드 보내 줘"라고 알린다 (sendReminders)
 *
 * 주의: 이메일 주소, 키, 백엔드 주소 같은 실제 값은 이 파일에 절대 적지 않습니다.
 *       비밀값과 백엔드 주소는 Script Properties(⚙ 프로젝트 설정 → 스크립트 속성)에 있습니다.
 */

/** Script Properties(비공개 저장 공간)의 키 이름 */
const PROPERTY_KEYS = Object.freeze({
  API_KEY: 'API_KEY', // 백엔드 → 이 웹앱. setup이 만든다 (백엔드 APPS_SCRIPT_API_KEY 와 같은 값)
  MAIL_WEBHOOK_SECRET: 'MAIL_WEBHOOK_SECRET', // 이 웹앱 → 백엔드. setup이 만든다 (백엔드 MAIL_WEBHOOK_SECRET 와 같은 값)
  BACKEND_URL: 'BACKEND_URL', // 팀 백엔드 주소. 직접 추가한다. 예: https://YOUR_BACKEND.onrender.com
  TEST_STUDENT_EMAIL: 'TEST_STUDENT_EMAIL', // Test.gs가 테스트 메일을 보낼 주소. 직접 추가한다
  // 아래 두 개는 답장 확인(Inbound.gs)이 자동으로 쓰고 관리합니다. 직접 고치지 않습니다.
  REPLY_LAST_CHECKED_AT: 'REPLY_LAST_CHECKED_AT', // 마지막으로 받은편지함을 확인한 시각(밀리초)
  REPLY_PROCESSED_IDS: 'REPLY_PROCESSED_IDS', // 백엔드에 넘겨 처리가 끝난 메일 ID 목록(최근 것만)
  // setup()이 자동으로 씁니다. 계정이 바뀌었는지(기관이 프로젝트를 복사했는지) 알아채는 용도입니다.
  SETUP_OWNER: 'SETUP_OWNER',
});

/** sendMail 입력 길이 제한 */
const LIMITS = Object.freeze({
  EMAIL_MAX: 254,
  FROM_NAME_MAX: 100,
  SUBJECT_MAX: 200,
  TEXT_BODY_MAX: 50000,
  HTML_BODY_MAX: 100000,
});

/** 문의번호 모양 (정규식 조각). 예: q20261117-0001 (Supabase next_inquiry_id()가 만든다) */
const INQUIRY_ID_PATTERN = 'q\\d{8}-\\d{4,}';

/** 멘토 메일 맨 아래에 백엔드가 넣는 "문의번호: q…" 줄의 앞말. 답장 후보를 고를 때 씁니다. */
const INQUIRY_ID_LINE_LABEL = '문의번호';

/** 답장 확인 설정 */
const REPLY_CONFIG = Object.freeze({
  TRIGGER_FUNCTION: 'checkReplies', // 시간 트리거가 부르는 함수 이름 (바꾸면 기존 트리거가 끊김)
  TRIGGER_EVERY_MINUTES: 5,
  FIRST_LOOKBACK_MS: 24 * 60 * 60 * 1000, // 처음 실행할 때 거슬러 올라가 볼 시간 (1일)
  OVERLAP_MS: 10 * 60 * 1000, // 지난 확인 시각보다 조금 앞부터 다시 봄 (늦게 도착한 메일 대비)
  MAX_MESSAGES_PER_RUN: 20, // 한 번 실행에 백엔드로 넘길 최대 메일 수
  BATCH_SIZE: 5, // 백엔드에 한 번에 넘기는 메일 수 (백엔드가 메일마다 학생에게 전달까지 하므로 작게)
  RUN_BUDGET_MS: 4 * 60 * 1000, // 이 시간이 지나면 남은 메일은 다음 차례로 (Apps Script 실행 제한 6분 대비)
  BODY_MAX_CHARS: 20000, // 백엔드로 넘길 본문 최대 글자 수
  PROCESSED_IDS_MAX: 300, // 기억해 둘 처리 완료 메일 ID 개수
});

/** 리마인드 설정 */
const REMINDER_CONFIG = Object.freeze({
  TRIGGER_FUNCTION: 'sendReminders', // 바꾸면 기존 트리거가 끊김
  TRIGGER_HOUR: 10, // 매일 10시~11시 사이 (구글이 1시간 안에서 시각을 정함)
});

/** 팀 백엔드 주소 뒤에 붙는 경로 */
const BACKEND_PATHS = Object.freeze({
  INBOUND: '/internal/mail/inbound', // 답장 후보 넘기기
  REMINDERS: '/internal/mail/reminders', // 리마인드 실행 요청
  HEALTH: '/health', // 연결 확인
});

/** 이 웹앱 → 백엔드 요청에 MAIL_WEBHOOK_SECRET 을 담는 헤더 이름 */
const WEBHOOK_HEADER = 'X-Kkurolog-Mail-Secret';

/** 중계 Gmail 메일함 라벨 (사람이 메일함에서 상태를 보기 위한 것) */
const GMAIL_LABELS = Object.freeze({
  FORWARDED: '메일자동화/전달완료',
  NEEDS_REVIEW: '메일자동화/확인필요',
});

// ---------------------------------------------------------------------------
// 비밀값 (Script Properties)
// ---------------------------------------------------------------------------

/**
 * Script Properties에서 값을 읽습니다. 없으면 오류를 냅니다. (원인은 로그에만 남김)
 * @param {string} key PROPERTY_KEYS 중 하나
 * @return {string}
 */
function getSecret_(key) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) {
    throw new AppError(
      'INTERNAL_ERROR',
      null,
      `Script Properties에 ${key} 값이 없습니다. 메뉴의 ① 설치·점검 (setup)을 실행하세요.`
    );
  }
  return value;
}

/** 추측할 수 없는 긴 무작위 문자열(64자) */
function generateSecret_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

/**
 * [편집기에서 실행 가능] API_KEY, MAIL_WEBHOOK_SECRET이 없으면 만들어 저장합니다. 있으면 그대로 둡니다.
 * 값은 로그에 찍지 않습니다. ⚙ 프로젝트 설정 → 스크립트 속성에서 확인하세요.
 */
function initSecrets() {
  const props = PropertiesService.getScriptProperties();
  [PROPERTY_KEYS.API_KEY, PROPERTY_KEYS.MAIL_WEBHOOK_SECRET].forEach(function (key) {
    if (props.getProperty(key)) {
      console.log(`${key}: 이미 있어서 그대로 둡니다.`);
    } else {
      props.setProperty(key, generateSecret_());
      console.log(`${key}: 새로 만들어 저장했습니다. (값은 프로젝트 설정 → 스크립트 속성에서 확인)`);
    }
  });
}

/**
 * 두 문자열이 같은지 비교합니다. 비교에 걸리는 시간으로 값을 추측하기 어렵게 해시끼리 비교합니다.
 * @param {*} a
 * @param {*} b
 * @return {boolean}
 */
function safeEqual_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const algo = Utilities.DigestAlgorithm.SHA_256;
  const charset = Utilities.Charset.UTF_8;
  const da = Utilities.computeDigest(algo, a, charset);
  const db = Utilities.computeDigest(algo, b, charset);
  let diff = 0;
  for (let i = 0; i < da.length; i++) diff |= da[i] ^ db[i];
  return diff === 0;
}

// ---------------------------------------------------------------------------
// 중계 메일 주소
// ---------------------------------------------------------------------------

/**
 * 중계 메일 주소 = 이 스크립트를 실행(배포)하는 계정의 주소. 어디에도 저장하지 않습니다.
 * @return {string}
 */
function getRelayAddress_() {
  const email = Session.getEffectiveUser().getEmail();
  if (!email) {
    throw new AppError('INTERNAL_ERROR', null, '실행 계정의 메일 주소를 읽지 못했습니다.');
  }
  return email;
}

/**
 * Gmail plus 주소. 예: 계정@gmail.com + q20261117-0001 → 계정+q20261117-0001@gmail.com
 * @param {string} address
 * @param {string} tag
 * @return {string}
 */
function toPlusAddress_(address, tag) {
  const parts = splitAddress_(address);
  return `${parts.local}+${tag}@${parts.domain}`;
}

/** 메일 주소를 + 앞부분(local)과 도메인으로 나눕니다. 예: a+b@gmail.com → {local:'a', domain:'gmail.com'} */
function splitAddress_(address) {
  const at = address.lastIndexOf('@');
  return { local: address.slice(0, at).split('+')[0], domain: address.slice(at + 1) };
}

/** "이름 <주소>" 모양에서 주소만 꺼내 소문자로 바꿉니다. */
function extractAddress_(from) {
  const text = String(from || '');
  const match = text.match(/<([^>]+)>/);
  return (match ? match[1] : text).trim().toLowerCase();
}

/** 정규식 특수문자를 글자 그대로 찾도록 바꿉니다. */
function escapeRegExp_(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 날짜를 ISO 8601 한국 시간 문자열로 바꿉니다. 예: 2026-11-17T14:03:00+09:00
 * @param {Date} date
 * @return {string}
 */
function toIsoKst_(date) {
  const tz = Session.getScriptTimeZone();
  const base = Utilities.formatDate(date, tz, "yyyy-MM-dd'T'HH:mm:ss");
  const offset = Utilities.formatDate(date, tz, 'Z');
  return `${base}${offset.slice(0, 3)}:${offset.slice(3)}`;
}
