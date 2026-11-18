/**
 * Setup.gs — 처음 설치·점검용 setup()
 *
 * setup()을 한 번 실행하면 아래를 차례로 처리합니다. 여러 번 실행해도 안전합니다.
 * 1. 계정 확인: 프로젝트를 다른 계정(기관)이 복사한 경우, 이전 계정의 비밀값·백엔드 주소·처리 기록을 지웁니다.
 * 2. 비밀값: API_KEY, MAIL_WEBHOOK_SECRET이 없으면 만듭니다.
 * 3. 옛 값 정리: 시트 방식 때 쓰던 ADMIN_TOKEN이 남아 있으면 지웁니다.
 * 4. 트리거: 답장 확인(5분마다) + 리마인드(매일) 트리거를 각각 1개만 켭니다.
 * 5. 점검: BACKEND_URL이 있는지, 백엔드가 응답하는지, 오늘 남은 발송 수.
 *
 * 반드시 중계 계정(메일을 보낼 계정)으로 실행합니다.
 */

/**
 * 계정이 바뀌면 지우는 Script Properties
 * - BACKEND_URL도 지웁니다. 복사한 프로젝트가 이전 팀의 백엔드로 학생 메일을 넘기는 일을 막기 위해서입니다.
 * @return {string[]}
 */
function ownerBoundProperties_() {
  return [
    PROPERTY_KEYS.API_KEY,
    PROPERTY_KEYS.MAIL_WEBHOOK_SECRET,
    PROPERTY_KEYS.BACKEND_URL,
    PROPERTY_KEYS.TEST_STUDENT_EMAIL,
    PROPERTY_KEYS.REPLY_LAST_CHECKED_AT,
    PROPERTY_KEYS.REPLY_PROCESSED_IDS,
  ];
}

/** 시트 방식(이전 버전) 때만 쓰던 Script Properties. 남아 있으면 지웁니다. */
const LEGACY_PROPERTIES = Object.freeze(['ADMIN_TOKEN']);

/**
 * [메뉴 또는 편집기에서 실행] 설치·점검을 한 번에 합니다.
 * @return {string[]} 결과 안내 문구 목록
 */
function setup() {
  const report = [];
  const relay = getRelayAddress_();
  report.push(`실행 계정(중계 메일): ${relay}`);

  checkOwner_(relay, report);
  initSecrets();
  report.push('API_KEY·MAIL_WEBHOOK_SECRET: 준비됨 (값은 ⚙ 프로젝트 설정 → 스크립트 속성에서 확인)');
  removeLegacyProperties_(report);
  installAutoTriggers().forEach(function (line) { report.push(line); });

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty(PROPERTY_KEYS.BACKEND_URL)) {
    report.push('⚠ BACKEND_URL이 없습니다. 스크립트 속성에 팀 백엔드 주소를 추가하세요. (예: https://YOUR_BACKEND.onrender.com)');
  }
  report.push(pingBackend_());
  report.push(`오늘 남은 Gmail 발송 수: ${Mailer.remainingDailyQuota()}통`);
  report.push('웹앱을 아직 배포하지 않았다면: 편집기 → 배포 → 새 배포. 코드를 바꿨다면: 배포 관리 → 새 버전');

  report.forEach(function (line) { console.log(line); });
  return report;
}

/**
 * 계정 확인. 다른 계정이 이 프로젝트를 복사해 실행했으면 이전 계정의 값을 지웁니다.
 * - SETUP_OWNER가 없음 → 처음 설치(또는 setup 도입 전부터 쓰던 프로젝트). 기록만 합니다.
 * - SETUP_OWNER가 지금 계정과 다름 → 계정이 바뀜. ownerBoundProperties_()를 지우고 새로 만듭니다.
 */
function checkOwner_(relay, report) {
  const props = PropertiesService.getScriptProperties();
  const owner = props.getProperty(PROPERTY_KEYS.SETUP_OWNER);
  if (owner && owner.toLowerCase() !== relay.toLowerCase()) {
    ownerBoundProperties_().forEach(function (key) { props.deleteProperty(key); });
    report.push(
      '⚠ 계정이 바뀌어 이전 계정의 API_KEY·MAIL_WEBHOOK_SECRET·BACKEND_URL·처리 기록을 지우고 새로 만듭니다. ' +
        '새 BACKEND_URL을 스크립트 속성에 추가하고, 새 키 두 개를 백엔드 환경변수에 넣어야 합니다.'
    );
  }
  props.setProperty(PROPERTY_KEYS.SETUP_OWNER, relay);
}

/** 이전 버전에서만 쓰던 값을 지웁니다. */
function removeLegacyProperties_(report) {
  const props = PropertiesService.getScriptProperties();
  LEGACY_PROPERTIES.forEach(function (key) {
    if (props.getProperty(key)) {
      props.deleteProperty(key);
      report.push(`이전 버전에서 쓰던 ${key}를 지웠습니다. (관리자 조회는 이제 백엔드가 Supabase에서 합니다)`);
    }
  });
}
