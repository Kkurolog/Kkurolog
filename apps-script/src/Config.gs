/**
 * Config.gs — 설정값과 공통 도구
 *
 * 이 파일이 하는 일
 * - 시트 탭 이름, 헤더(1행) 이름, 입력 길이 제한을 한곳에 모아 둡니다.
 * - 비밀값(apiKey, adminToken)은 Script Properties에서, 안내 문구는 "설정" 탭에서 읽습니다.
 * - 중계 메일 주소는 저장하지 않고 "지금 배포한 계정"의 주소를 자동으로 읽습니다.
 *
 * 주의: 이메일 주소, apiKey 같은 실제 값은 이 파일에 절대 적지 않습니다.
 */

/** 시트 탭 이름 (시트의 탭 이름과 글자 하나까지 같아야 합니다) */
const SHEET_NAMES = Object.freeze({
  MENTORS: '멘토',
  INQUIRIES: '문의',
  SETTINGS: '설정',
});

/** "멘토" 탭 헤더 */
const MENTOR_HEADERS = Object.freeze({
  ID: 'mentorId',
  NAME: '이름',
  EMAIL: '이메일',
  ACTIVE: '활성여부',
});

/** "문의" 탭 헤더 */
const INQUIRY_HEADERS = Object.freeze({
  ID: '문의번호',
  CREATED_AT: '보낸일시',
  MENTOR_ID: 'mentorId',
  STUDENT_NAME: '학생이름',
  STUDENT_EMAIL: '학생메일',
  TITLE: '제목',
  BODY: '내용',
  REPLIED: '답장여부',
  REPLIED_AT: '답장일시',
  REMINDED_AT: '리마인드일시', // Step 5-1: 멘토에게 리마인드를 보낸 시각 (안 보냈으면 빈칸)
});

/** "설정" 탭 헤더 */
const SETTING_HEADERS = Object.freeze({
  KEY: '키',
  VALUE: '값',
});

/** "설정" 탭의 키 이름 */
const SETTING_KEYS = Object.freeze({
  SERVICE_NAME: 'serviceName',
  SENDER_NAME: 'senderName',
  MENTOR_SUBJECT_PREFIX: 'mentorSubjectPrefix',
  MENTOR_FOOTER: 'mentorFooter',
  STUDENT_SUBJECT_PREFIX: 'studentSubjectPrefix',
  STUDENT_FORWARD_INTRO: 'studentForwardIntro',
  STUDENT_FORWARD_FOOTER: 'studentForwardFooter',
  // Step 5-1: 같은 학생 메일로 보내는 횟수 제한 (숫자. 0이면 제한 없음)
  RATE_LIMIT_MINUTES: 'rateLimitMinutes', // 몇 분 동안 셀지
  RATE_LIMIT_PER_WINDOW: 'rateLimitPerWindow', // 그 시간 안에 몇 건까지 보낼 수 있는지
  RATE_LIMIT_PER_DAY: 'rateLimitPerDay', // 하루(한국 시간 자정 기준)에 몇 건까지 보낼 수 있는지
  // Step 5-1: 학생에게 보내는 "보낸 문의 사본" 메일
  STUDENT_COPY_SUBJECT_PREFIX: 'studentCopySubjectPrefix',
  STUDENT_COPY_INTRO: 'studentCopyIntro',
  STUDENT_COPY_FOOTER: 'studentCopyFooter',
  // Step 5-1: 멘토 리마인드 (reminderDays: 숫자. 0이면 리마인드 안 보냄)
  REMINDER_DAYS: 'reminderDays',
  MENTOR_REMINDER_SUBJECT_PREFIX: 'mentorReminderSubjectPrefix',
  MENTOR_REMINDER_INTRO: 'mentorReminderIntro',
});

/**
 * 숫자 설정의 기본값. "설정" 탭 값이 비어 있거나 숫자가 아니면 이 값을 씁니다.
 * (SETTING_KEYS를 쓰기 때문에 함수로 만들었습니다)
 * @return {Object<string,number>}
 */
function numberSettingDefaults_() {
  const defaults = {};
  defaults[SETTING_KEYS.RATE_LIMIT_MINUTES] = 10; // 같은 학생 메일은 최근 10분 안에
  defaults[SETTING_KEYS.RATE_LIMIT_PER_WINDOW] = 3; // 3건까지 (4번째부터 막힘)
  defaults[SETTING_KEYS.RATE_LIMIT_PER_DAY] = 5; // 같은 학생 메일은 하루(한국 시간 자정 기준) 5건까지
  defaults[SETTING_KEYS.REMINDER_DAYS] = 10; // 보낸 날짜 + 10일째에 리마인드
  return defaults;
}

/** Script Properties(비밀 저장소)의 키 이름. 값은 코드가 아니라 프로젝트 설정 화면에 있습니다. */
const PROPERTY_KEYS = Object.freeze({
  API_KEY: 'API_KEY',
  ADMIN_TOKEN: 'ADMIN_TOKEN',
  TEST_STUDENT_EMAIL: 'TEST_STUDENT_EMAIL', // Test.gs에서만 쓰는 테스트용 학생 메일
  // 아래 두 개는 답장 확인(Replies.gs)이 자동으로 쓰고 관리합니다. 직접 고치지 않습니다.
  REPLY_LAST_CHECKED_AT: 'REPLY_LAST_CHECKED_AT', // 마지막으로 받은편지함을 확인한 시각(밀리초)
  REPLY_PROCESSED_IDS: 'REPLY_PROCESSED_IDS', // 이미 처리한 메일 ID 목록(최근 것만)
  // setup()이 자동으로 씁니다. 계정이 바뀌었는지(기관이 사본을 만들었는지) 알아채는 용도입니다.
  SETUP_OWNER: 'SETUP_OWNER', // 마지막으로 setup()을 실행한 계정의 메일 주소
});

/** 입력 길이 제한 (API 명세와 같음) */
const LIMITS = Object.freeze({
  STUDENT_NAME_MAX: 30,
  TITLE_MAX: 100,
  BODY_MAX: 2000,
  EMAIL_MAX: 254,
  MENTOR_ID_MAX: 100,
});

/** 동시에 두 요청이 같은 문의번호를 만들지 않도록 기다리는 최대 시간(밀리초) */
const LOCK_WAIT_MS = 10000;

/** 문의번호 모양 (정규식 조각). 예: q20261108-0001 */
const INQUIRY_ID_PATTERN = 'q\\d{8}-\\d{4,}';

/** 답장 자동 전달 설정 (Step 4) */
const REPLY_CONFIG = Object.freeze({
  TRIGGER_FUNCTION: 'checkReplies', // 시간 트리거가 부르는 함수 이름
  TRIGGER_EVERY_MINUTES: 5, // 몇 분마다 확인할지 (1, 5, 10, 15, 30 중 하나)
  FIRST_LOOKBACK_MS: 24 * 60 * 60 * 1000, // 처음 실행할 때 거슬러 올라가 볼 시간 (1일)
  OVERLAP_MS: 10 * 60 * 1000, // 지난 확인 시각보다 조금 앞부터 다시 봄 (늦게 도착한 메일 대비, 10분)
  MAX_MESSAGES_PER_RUN: 20, // 한 번 실행에 처리할 최대 메일 수 (실행 시간 6분 제한 대비)
  PROCESSED_IDS_MAX: 300, // 기억해 둘 처리 완료 메일 ID 개수
});

/** 멘토 리마인드 설정 (Step 5-1) */
const REMINDER_CONFIG = Object.freeze({
  TRIGGER_FUNCTION: 'sendReminders', // 하루 한 번 도는 트리거가 부르는 함수 이름
  TRIGGER_HOUR: 10, // 매일 오전 10시~11시 사이에 실행 (구글이 1시간 안에서 시각을 정함)
  MAX_MESSAGES_PER_RUN: 30, // 한 번 실행에 보낼 최대 리마인드 수 (실행 시간 6분 제한 대비)
});

/** 중계 Gmail 메일함에 붙이는 라벨 (사람이 메일함에서 상태를 보기 위한 것) */
const GMAIL_LABELS = Object.freeze({
  FORWARDED: '메일자동화/전달완료', // 학생에게 전달함
  NEEDS_REVIEW: '메일자동화/확인필요', // 보낸 사람이 멘토가 아님, 내용이 비어 있음, 전달 실패 등
});

// ---------------------------------------------------------------------------
// 비밀값 (Script Properties)
// ---------------------------------------------------------------------------

/**
 * Script Properties에서 비밀값을 읽습니다. 없으면 오류를 냅니다.
 * @param {string} key PROPERTY_KEYS 중 하나
 * @return {string}
 */
function getSecret_(key) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) {
    throw new AppError(
      'INTERNAL_ERROR',
      null,
      `Script Properties에 ${key} 값이 없습니다. 시트 메뉴에서 ① 설치·점검 (setup)을 실행하세요.`
    );
  }
  return value;
}

/**
 * 추측할 수 없는 긴 무작위 문자열(64자)을 만듭니다.
 * @return {string}
 */
function generateSecret_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

/**
 * [편집기에서 직접 실행] apiKey와 adminToken을 처음 한 번 만들어 Script Properties에 저장합니다.
 * - 이미 값이 있으면 덮어쓰지 않습니다. (백엔드에 넣어 둔 키가 갑자기 바뀌지 않게)
 * - 값은 로그에 찍지 않습니다. ⚙ 프로젝트 설정 → 스크립트 속성에서 확인하세요.
 */
function initSecrets() {
  const props = PropertiesService.getScriptProperties();
  [PROPERTY_KEYS.API_KEY, PROPERTY_KEYS.ADMIN_TOKEN].forEach(function (key) {
    if (props.getProperty(key)) {
      console.log(`${key}: 이미 있어서 그대로 둡니다.`);
    } else {
      props.setProperty(key, generateSecret_());
      console.log(`${key}: 새로 만들어 저장했습니다. (값은 프로젝트 설정 → 스크립트 속성에서 확인)`);
    }
  });
  console.log(`중계 메일 주소(자동 인식): ${getRelayAddress_()}`);
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
 * 중계 메일 주소 = 이 스크립트를 실행(배포)하는 계정의 주소.
 * 기관이 새 계정으로 시트 사본을 만들면 자동으로 그 계정 주소가 됩니다.
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
 * Gmail plus 주소를 만듭니다. 예: 계정@gmail.com + q20261108-0001 → 계정+q20261108-0001@gmail.com
 * @param {string} address 원래 주소
 * @param {string} tag + 뒤에 붙일 값 (문의번호)
 * @return {string}
 */
function toPlusAddress_(address, tag) {
  const parts = splitAddress_(address);
  return `${parts.local}+${tag}@${parts.domain}`;
}

/**
 * 메일 주소를 + 앞부분(local)과 도메인으로 나눕니다. 예: a+b@gmail.com → {local:'a', domain:'gmail.com'}
 * @param {string} address
 * @return {{local: string, domain: string}}
 */
function splitAddress_(address) {
  const at = address.lastIndexOf('@');
  return { local: address.slice(0, at).split('+')[0], domain: address.slice(at + 1) };
}

/**
 * "이름 <주소>" 모양에서 주소만 꺼내 소문자로 바꿉니다.
 * @param {string} from 예: "홍길동 <Mentor@Example.com>"
 * @return {string} 예: mentor@example.com
 */
function extractAddress_(from) {
  const text = String(from || '');
  const match = text.match(/<([^>]+)>/);
  return (match ? match[1] : text).trim().toLowerCase();
}

/** 정규식 특수문자를 글자 그대로 찾도록 바꿉니다. */
function escapeRegExp_(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// 시간
// ---------------------------------------------------------------------------

/**
 * 날짜를 ISO 8601 한국 시간 문자열로 바꿉니다. 예: 2026-11-08T14:03:00+09:00
 * (시간대는 appsscript.json의 Asia/Seoul을 따릅니다)
 * @param {Date} date
 * @return {string}
 */
function toIsoKst_(date) {
  const tz = Session.getScriptTimeZone();
  const base = Utilities.formatDate(date, tz, "yyyy-MM-dd'T'HH:mm:ss");
  const offset = Utilities.formatDate(date, tz, 'Z'); // 예: +0900
  return `${base}${offset.slice(0, 3)}:${offset.slice(3)}`;
}

/**
 * 날짜를 yyyyMMdd 로 바꿉니다. (문의번호용)
 * @param {Date} date
 * @return {string}
 */
function toDateKey_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyyMMdd');
}

/**
 * 날짜를 사람이 읽기 쉬운 한국 시간으로 바꿉니다. 예: 2026-11-08 14:03 (메일 본문용)
 * @param {Date} date
 * @return {string}
 */
function toDisplayKst_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
}

/**
 * 시트에 적힌 ISO 시간 글자를 날짜로 바꿉니다. 예: "2026-11-08T14:03:00+09:00"
 * @param {*} text
 * @return {?Date} 읽지 못하면 null
 */
function parseIsoDate_(text) {
  const value = String(text || '').trim();
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * 두 날짜가 한국 날짜(달력) 기준으로 며칠 차이인지 셉니다. 시각은 보지 않습니다.
 * 예: 11월 1일 23:59 → 11월 11일 00:01 = 10일
 * @param {Date} from
 * @param {Date} to
 * @return {number}
 */
function calendarDaysBetween_(from, to) {
  const toUtcDay = function (date) {
    const key = toDateKey_(date); // yyyyMMdd (한국 날짜)
    return Date.UTC(Number(key.slice(0, 4)), Number(key.slice(4, 6)) - 1, Number(key.slice(6, 8)));
  };
  return Math.round((toUtcDay(to) - toUtcDay(from)) / (24 * 60 * 60 * 1000));
}
