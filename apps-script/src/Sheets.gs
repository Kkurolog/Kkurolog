/**
 * Sheets.gs — 시트 읽기 도구
 *
 * 이 파일이 하는 일
 * - 탭 이름으로 시트를 찾고, 1행(헤더) 이름으로 열 위치를 찾습니다.
 * - 열 순서가 바뀌어도 헤더 이름만 같으면 동작합니다.
 */

/**
 * 탭 이름으로 시트를 찾습니다.
 * @param {string} name
 * @return {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getSheet_(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) {
    throw new AppError('INTERNAL_ERROR', null, `시트에 "${name}" 탭이 없습니다.`);
  }
  return sheet;
}

/**
 * 탭 전체를 읽습니다.
 * - values: 실제 값 (체크박스는 true/false)
 * - displayValues: 화면에 보이는 글자 그대로 (ID·날짜를 문자열로 다룰 때 사용)
 * @param {string} sheetName
 * @return {{sheet: GoogleAppsScript.Spreadsheet.Sheet, headers: string[],
 *           values: any[][], displayValues: string[][]}}
 */
function readTable_(sheetName) {
  const sheet = getSheet_(sheetName);
  const range = sheet.getDataRange();
  const values = range.getValues();
  const displayValues = range.getDisplayValues();
  if (values.length === 0) {
    throw new AppError('INTERNAL_ERROR', null, `"${sheetName}" 탭에 헤더(1행)가 없습니다.`);
  }
  return {
    sheet: sheet,
    headers: displayValues[0].map(function (h) { return String(h).trim(); }),
    values: values.slice(1),
    displayValues: displayValues.slice(1),
  };
}

/**
 * 헤더 이름들의 열 위치(0부터 시작)를 한 번에 찾습니다. 하나라도 없으면 오류를 냅니다.
 * @param {string[]} headers 시트 1행
 * @param {Object<string,string>} headerNames 예: MENTOR_HEADERS
 * @param {string} sheetName 오류 메시지용
 * @return {Object<string,number>} headerNames와 같은 키 → 열 위치
 */
function columnIndexes_(headers, headerNames, sheetName) {
  const result = {};
  Object.keys(headerNames).forEach(function (key) {
    const index = headers.indexOf(headerNames[key]);
    if (index < 0) {
      throw new AppError(
        'INTERNAL_ERROR',
        null,
        `"${sheetName}" 탭 1행에 "${headerNames[key]}" 헤더가 없습니다.`
      );
    }
    result[key] = index;
  });
  return result;
}

/**
 * 체크박스 값(true) 또는 글자 TRUE를 참으로 봅니다.
 * @param {*} value
 * @return {boolean}
 */
function isTruthyCell_(value) {
  return value === true || String(value).trim().toUpperCase() === 'TRUE';
}

/**
 * "설정" 탭을 { 키: 값 } 형태로 읽습니다.
 * @return {Object<string,string>}
 */
function getSettings_() {
  const table = readTable_(SHEET_NAMES.SETTINGS);
  const col = columnIndexes_(table.headers, SETTING_HEADERS, SHEET_NAMES.SETTINGS);
  const settings = {};
  table.displayValues.forEach(function (row) {
    const key = String(row[col.KEY]).trim();
    if (key) settings[key] = String(row[col.VALUE]).trim();
  });
  return settings;
}

/**
 * 설정값 하나를 꺼냅니다. 비어 있으면 오류를 냅니다. (안내 문구가 빠진 채 메일이 나가지 않게)
 * @param {Object<string,string>} settings getSettings_() 결과
 * @param {string} key SETTING_KEYS 중 하나
 * @return {string}
 */
function requireSetting_(settings, key) {
  const value = settings[key];
  if (!value) {
    throw new AppError('INTERNAL_ERROR', null, `"설정" 탭에 "${key}" 값이 없습니다.`);
  }
  return value;
}

/**
 * 숫자 설정값 하나를 꺼냅니다. (0 이상의 정수)
 * - 비어 있으면 기본값(numberSettingDefaults_)을 씁니다.
 * - 숫자가 아니거나 음수·소수면 기본값을 쓰고 로그에 경고를 남깁니다. (문의가 멈추지 않게)
 * @param {Object<string,string>} settings getSettings_() 결과
 * @param {string} key SETTING_KEYS 중 숫자 설정
 * @return {number}
 */
function getNumberSetting_(settings, key) {
  const fallback = numberSettingDefaults_()[key];
  const raw = String(settings[key] === undefined ? '' : settings[key]).trim();
  if (raw === '') return fallback;
  if (!/^\d+$/.test(raw)) {
    console.warn(`"설정" 탭의 ${key} 값 "${raw}"이 0 이상의 정수가 아니라서 기본값 ${fallback}을 씁니다.`);
    return fallback;
  }
  return Number(raw);
}
