/**
 * Setup.gs — 처음 설치·인수인계용 setup()
 *
 * setup()을 한 번 실행하면 아래를 차례로 처리합니다. 여러 번 실행해도 안전합니다.
 * 1. 계정 확인: 시트 사본을 다른 계정(기관)이 만든 경우, 이전 계정의 apiKey·adminToken·답장 처리 기록을 지우고 새로 만듭니다.
 * 2. 탭·헤더 점검: "멘토/문의/설정" 탭과 1행 헤더, 설정 키가 빠져 있으면 그것만 만듭니다. 있는 데이터는 건드리지 않습니다.
 * 3. 비밀값: API_KEY, ADMIN_TOKEN이 없으면 만듭니다.
 * 4. 트리거: 5분마다 답장 확인 + 매일 리마인드, 각각 1개만 켭니다.
 * 5. 점검: 활성 멘토 수, 예시 메일(example.com)이 남아 있는지, 오늘 남은 발송 수를 알려 줍니다.
 *
 * 반드시 중계 계정(메일을 보낼 계정)으로 실행합니다. 시트 메뉴 또는 편집기에서 실행할 수 있습니다.
 */

// 주의: 아래 기본값은 다른 파일(Config.gs)의 상수를 쓰기 때문에 함수로 만들었습니다.
// (파일을 읽는 순서와 상관없이, 실제로 부를 때 만들어지도록)

/**
 * 탭을 새로 만들 때 쓰는 기본 헤더 (Config.gs의 헤더 이름과 같음)
 * @return {Object<string,string[]>} 탭 이름 → 헤더 목록
 */
function defaultHeaders_() {
  const headers = {};
  headers[SHEET_NAMES.MENTORS] = [MENTOR_HEADERS.ID, MENTOR_HEADERS.NAME, MENTOR_HEADERS.EMAIL, MENTOR_HEADERS.ACTIVE];
  headers[SHEET_NAMES.INQUIRIES] = [
    INQUIRY_HEADERS.ID,
    INQUIRY_HEADERS.CREATED_AT,
    INQUIRY_HEADERS.MENTOR_ID,
    INQUIRY_HEADERS.STUDENT_NAME,
    INQUIRY_HEADERS.STUDENT_EMAIL,
    INQUIRY_HEADERS.TITLE,
    INQUIRY_HEADERS.BODY,
    INQUIRY_HEADERS.REPLIED,
    INQUIRY_HEADERS.REPLIED_AT,
    INQUIRY_HEADERS.REMINDED_AT,
  ];
  headers[SHEET_NAMES.SETTINGS] = [SETTING_HEADERS.KEY, SETTING_HEADERS.VALUE, '설명'];
  return headers;
}

/**
 * "설정" 탭 기본값 [키, 값, 설명] (templates/settings.example.csv와 같음)
 * @return {string[][]}
 */
function defaultSettings_() {
  return [
    [SETTING_KEYS.SERVICE_NAME, '꾸로록', '서비스 이름. 메일 본문 인사말 등에 쓴다'],
    [SETTING_KEYS.SENDER_NAME, '꾸로록', "메일 '보낸 사람'에 보이는 이름"],
    [SETTING_KEYS.MENTOR_SUBJECT_PREFIX, '[꾸로록 문의]', '멘토에게 가는 메일 제목 앞에 붙는 말'],
    [
      SETTING_KEYS.MENTOR_FOOTER,
      "답장을 보내실 때, 반드시 해당 메일 주소로 '답장' 기능을 활용해 보내주세요!",
      '멘토에게 가는 메일 맨 아래 안내 문구',
    ],
    [SETTING_KEYS.STUDENT_SUBJECT_PREFIX, '[꾸로록 답장]', '학생에게 전달되는 답장 메일 제목 앞에 붙는 말'],
    [SETTING_KEYS.STUDENT_FORWARD_INTRO, '멘토님이 보내주신 답장을 전달해 드려요.', '학생에게 전달되는 메일 맨 위 안내 문구'],
    [
      SETTING_KEYS.STUDENT_FORWARD_FOOTER,
      '이 메일은 꾸로록이 자동으로 전달한 메일이에요. 추가로 궁금한 점은 꾸로록에서 새 문의를 보내주세요.',
      '학생에게 전달되는 메일 맨 아래 안내 문구',
    ],
    [SETTING_KEYS.RATE_LIMIT_MINUTES, '10', '같은 학생 메일의 문의 수를 셀 시간(분). rateLimitPerWindow와 함께 씀. 0이면 이 제한 없음'],
    [SETTING_KEYS.RATE_LIMIT_PER_WINDOW, '3', 'rateLimitMinutes분 안에 같은 학생 메일로 보낼 수 있는 문의 수. 0이면 이 제한 없음'],
    [SETTING_KEYS.RATE_LIMIT_PER_DAY, '5', '같은 학생 메일로 하루(자정 기준)에 보낼 수 있는 문의 수. 0이면 제한 없음'],
    [SETTING_KEYS.STUDENT_COPY_SUBJECT_PREFIX, '[꾸로록 보낸 문의]', '학생에게 가는 "보낸 문의 사본" 메일 제목 앞에 붙는 말'],
    [
      SETTING_KEYS.STUDENT_COPY_INTRO,
      '멘토님께 아래 문의를 보냈어요. 답장이 오면 이 메일 주소로 전달해 드려요.',
      '학생에게 가는 "보낸 문의 사본" 메일 맨 위 안내 문구',
    ],
    [
      SETTING_KEYS.STUDENT_COPY_FOOTER,
      '이 메일은 보낸 문의의 사본이에요. 이 메일에 답장해도 멘토에게 전달되지 않아요.',
      '학생에게 가는 "보낸 문의 사본" 메일 맨 아래 안내 문구',
    ],
    [SETTING_KEYS.REMINDER_DAYS, '10', '답장이 없을 때 보낸 날짜로부터 며칠째에 멘토에게 한 번 더 보낼지. 0이면 보내지 않음'],
    [SETTING_KEYS.MENTOR_REMINDER_SUBJECT_PREFIX, '[꾸로록 리마인드]', '멘토에게 가는 리마인드 메일 제목 앞에 붙는 말'],
    [
      SETTING_KEYS.MENTOR_REMINDER_INTRO,
      "열흘 전 꾸로록에 들어온 문의가 멘토님을 기다리고 있어요. 해당 메일의 '답장' 버튼으로 회신해 주세요!",
      '멘토에게 가는 리마인드 메일 맨 위 문구',
    ],
  ];
}

/** "멘토" 탭 예시 행 (templates/mentors.example.csv와 같음. 실제 메일이 아님) */
const EXAMPLE_MENTORS = Object.freeze([
  ['mt-01', '새벽 (demo)', 'mentor1@example.com', true],
  ['mt-02', '도토리 (demo)', 'mentor2@example.com', true],
  ['mt-03', '바람 (demo)', 'mentor3@example.com', true],
  ['mt-04', '하람 (demo)', 'mentor4@example.com', true],
  ['mt-05', '모래 (demo)', 'mentor5@example.com', true],
  ['mt-06', '누리 (demo)', 'mentor6@example.com', false],
]);

/**
 * 계정이 바뀌면 지우는 Script Properties (이전 계정의 비밀값·상태)
 * @return {string[]}
 */
function ownerBoundProperties_() {
  return [
    PROPERTY_KEYS.API_KEY,
    PROPERTY_KEYS.ADMIN_TOKEN,
    PROPERTY_KEYS.TEST_STUDENT_EMAIL,
    PROPERTY_KEYS.REPLY_LAST_CHECKED_AT,
    PROPERTY_KEYS.REPLY_PROCESSED_IDS,
  ];
}

/**
 * [시트 메뉴 또는 편집기에서 실행] 설치·점검을 한 번에 합니다.
 * @return {string[]} 결과 안내 문구 목록 (메뉴에서 실행하면 창으로 보여 줌)
 */
function setup() {
  const report = [];
  const relay = getRelayAddress_();
  report.push(`실행 계정(중계 메일): ${relay}`);

  checkOwner_(relay, report);
  ensureSheets_(report);
  initSecrets();
  report.push('API_KEY·ADMIN_TOKEN: 준비됨 (값은 ⚙ 프로젝트 설정 → 스크립트 속성에서 확인)');
  installAutoTriggers().forEach(function (line) { report.push(line); });
  checkMentors_(report);
  report.push(`오늘 남은 Gmail 발송 수: ${Mailer.remainingDailyQuota()}통`);
  report.push('웹앱을 아직 배포하지 않았다면: 편집기 → 배포 → 새 배포 (README/HANDOVER 참고)');

  report.forEach(function (line) { console.log(line); });
  return report;
}

/**
 * 계정 확인. 사본을 다른 계정이 만들었으면 이전 계정의 비밀값·상태를 지웁니다.
 * - SETUP_OWNER가 없고 API_KEY도 없음 → 새 설치. 그냥 기록
 * - SETUP_OWNER가 없고 API_KEY는 있음 → setup() 도입 전부터 쓰던 시트. 키를 유지하고 기록만
 * - SETUP_OWNER가 지금 계정과 다름 → 계정이 바뀜. 비밀값·상태를 지우고 새로 만듦
 */
function checkOwner_(relay, report) {
  const props = PropertiesService.getScriptProperties();
  const owner = props.getProperty(PROPERTY_KEYS.SETUP_OWNER);
  if (owner && owner.toLowerCase() !== relay.toLowerCase()) {
    ownerBoundProperties_().forEach(function (key) { props.deleteProperty(key); });
    report.push(
      '⚠ 계정이 바뀌어 이전 계정의 API_KEY·ADMIN_TOKEN·답장 처리 기록·TEST_STUDENT_EMAIL을 지우고 새로 만듭니다. ' +
        '새 API_KEY를 팀 백엔드(사이트) 환경변수에 넣어야 합니다.'
    );
  }
  props.setProperty(PROPERTY_KEYS.SETUP_OWNER, relay);
}

/** 탭·헤더·설정 키를 점검하고 빠진 것만 만듭니다. */
function ensureSheets_(report) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const allHeaders = defaultHeaders_();
  [SHEET_NAMES.MENTORS, SHEET_NAMES.INQUIRIES, SHEET_NAMES.SETTINGS].forEach(function (name) {
    const headers = allHeaders[name];
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sheet.setFrozenRows(1);
      report.push(`"${name}" 탭이 없어서 새로 만들었습니다.`);
    } else {
      const lastCol = Math.max(sheet.getLastColumn(), 1);
      const current = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0]
        .map(function (h) { return String(h).trim(); });
      const missing = headers.filter(function (h) { return current.indexOf(h) < 0; });
      if (missing.length > 0) {
        const startCol = current.filter(function (h) { return h !== ''; }).length === 0 ? 1 : lastCol + 1;
        sheet.getRange(1, startCol, 1, missing.length).setValues([missing]).setFontWeight('bold');
        report.push(`"${name}" 탭 1행에 빠진 헤더를 오른쪽 끝에 추가했습니다: ${missing.join(', ')}`);
      }
    }
  });
  formatInquirySheet_();
  ensureSettingKeys_(report);
  report.push('탭·헤더 점검 완료');
}

/** "문의" 탭의 문의번호·보낸일시·답장일시·리마인드일시 열을 일반 텍스트로 둡니다. */
function formatInquirySheet_() {
  const sheet = getSheet_(SHEET_NAMES.INQUIRIES);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    .map(function (h) { return String(h).trim(); });
  [INQUIRY_HEADERS.ID, INQUIRY_HEADERS.CREATED_AT, INQUIRY_HEADERS.REPLIED_AT, INQUIRY_HEADERS.REMINDED_AT].forEach(function (h) {
    const col = headers.indexOf(h) + 1;
    if (col > 0) sheet.getRange(2, col, sheet.getMaxRows() - 1, 1).setNumberFormat('@');
  });
}

/** "설정" 탭에 빠진 키가 있으면 기본값으로 아래에 추가합니다. (있는 값은 그대로) */
function ensureSettingKeys_(report) {
  const table = readTable_(SHEET_NAMES.SETTINGS);
  const col = columnIndexes_(table.headers, SETTING_HEADERS, SHEET_NAMES.SETTINGS);
  const descCol = table.headers.indexOf('설명');
  const existing = table.displayValues.map(function (row) { return String(row[col.KEY]).trim(); });
  const added = [];
  defaultSettings_().forEach(function (item) {
    if (existing.indexOf(item[0]) >= 0) return;
    const row = new Array(table.headers.length).fill('');
    row[col.KEY] = item[0];
    row[col.VALUE] = item[1];
    if (descCol >= 0) row[descCol] = item[2];
    table.sheet.appendRow(row);
    added.push(item[0]);
  });
  if (added.length > 0) report.push(`"설정" 탭에 빠진 키를 기본값으로 추가했습니다: ${added.join(', ')}`);
}

/** 멘토 탭 점검: 활성 멘토 수, 예시 메일이 남아 있는지 */
function checkMentors_(report) {
  const mentors = readAllMentors_();
  const active = mentors.filter(function (m) { return m.active; });
  report.push(`멘토: 전체 ${mentors.length}명, 활성 ${active.length}명`);
  const examples = mentors.filter(function (m) { return /@example\.com$/i.test(m.email); });
  if (examples.length > 0) {
    report.push(
      `⚠ 예시 메일(example.com)이 남은 멘토 ${examples.length}명: ${examples.map(function (m) { return m.mentorId; }).join(', ')} ` +
        '→ 실제 멘토 메일로 바꾸거나 활성여부 체크를 끄세요.'
    );
  }
}

/**
 * [시트 메뉴에서만 실행] 기관에 넘길 템플릿 사본의 데이터를 비웁니다.
 * - 원본에서 실수로 실행하지 않도록: 파일 이름에 "템플릿"이 있어야 하고, 확인 창을 두 번 거칩니다.
 * - 문의 기록 전부 삭제, 멘토 탭은 예시 값으로 교체, Script Properties 전부 삭제, 자동 실행 트리거(답장 확인·리마인드) 끄기.
 * - 설정 탭 문구는 그대로 둡니다.
 */
function clearForTemplate() {
  const ui = getUiOrNull_();
  if (!ui) {
    throw new Error('이 기능은 확인 창이 필요해서 시트 메뉴에서만 실행할 수 있습니다.');
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getName().indexOf('템플릿') < 0) {
    ui.alert(
      '실행하지 않았습니다',
      '원본을 지키기 위해, 파일 이름에 "템플릿"이 들어간 사본에서만 실행할 수 있습니다.\n' +
        '먼저 파일 → 사본 만들기 → 이름에 "템플릿"을 넣은 뒤, 그 사본에서 실행하세요.',
      ui.ButtonSet.OK
    );
    return;
  }
  const first = ui.alert(
    '템플릿용으로 데이터 비우기',
    `"${ss.getName()}"의 문의 기록을 모두 지우고, 멘토 탭을 예시 값으로 바꾸고, 비밀값(API_KEY 등)을 지웁니다.\n` +
      '되돌릴 수 없습니다. 계속할까요?',
    ui.ButtonSet.YES_NO
  );
  if (first !== ui.Button.YES) return;
  const second = ui.prompt('한 번 더 확인', '계속하려면 비우기 라고 입력하세요.', ui.ButtonSet.OK_CANCEL);
  if (second.getSelectedButton() !== ui.Button.OK || second.getResponseText().trim() !== '비우기') {
    ui.alert('취소했습니다.');
    return;
  }

  // 문의 기록 삭제 (헤더만 남김)
  const inquiries = getSheet_(SHEET_NAMES.INQUIRIES);
  if (inquiries.getLastRow() > 1) inquiries.deleteRows(2, inquiries.getLastRow() - 1);

  // 멘토 탭을 예시 값으로
  const mentorTable = readTable_(SHEET_NAMES.MENTORS);
  const col = columnIndexes_(mentorTable.headers, MENTOR_HEADERS, SHEET_NAMES.MENTORS);
  const mentorSheet = mentorTable.sheet;
  if (mentorSheet.getLastRow() > 1) mentorSheet.deleteRows(2, mentorSheet.getLastRow() - 1);
  const rows = EXAMPLE_MENTORS.map(function (ex) {
    const row = new Array(mentorTable.headers.length).fill('');
    row[col.ID] = ex[0];
    row[col.NAME] = ex[1];
    row[col.EMAIL] = ex[2];
    row[col.ACTIVE] = ex[3];
    return row;
  });
  mentorSheet.getRange(2, 1, rows.length, mentorTable.headers.length).setValues(rows);
  mentorSheet.getRange(2, col.ACTIVE + 1, rows.length, 1).insertCheckboxes();
  mentorSheet.getRange(2, col.ACTIVE + 1, rows.length, 1).setValues(
    EXAMPLE_MENTORS.map(function (ex) { return [ex[3]]; })
  );

  // 비밀값·상태 전부 삭제, 트리거 끄기 (이 사본의 스크립트에만 해당. 원본에는 영향 없음)
  PropertiesService.getScriptProperties().deleteAllProperties();
  removeAutoTriggers();
  SpreadsheetApp.flush();

  ui.alert(
    '완료',
    '문의 기록 삭제, 멘토 예시 값으로 교체, 비밀값 삭제, 트리거 끄기를 마쳤습니다.\n' +
      '이 사본을 기관에 넘기면 됩니다. (원본 시트는 공유하지 마세요)',
    ui.ButtonSet.OK
  );
}
