/**
 * Backend.gs — 이 웹앱 → 팀 백엔드 호출
 *
 * - 백엔드 주소는 Script Properties의 BACKEND_URL에서 읽습니다. (코드에 적지 않음)
 * - 모든 요청에 헤더 X-Kkurolog-Mail-Secret: MAIL_WEBHOOK_SECRET 을 붙입니다. 백엔드는 이 값이 맞을 때만 처리합니다.
 * - 백엔드(Render 무료 플랜)는 한동안 요청이 없으면 잠들었다가 깨어나는 데 30~60초가 걸립니다.
 *   응답을 못 받으면 오류를 던지고, 부른 쪽(Inbound.gs)은 다음 차례에 다시 시도합니다.
 */

/**
 * 백엔드 주소 (끝의 / 제거). https:// 로 시작해야 합니다.
 * @return {string}
 */
function getBackendUrl_() {
  const raw = String(PropertiesService.getScriptProperties().getProperty(PROPERTY_KEYS.BACKEND_URL) || '').trim();
  if (!raw) {
    throw new AppError('INTERNAL_ERROR', null, 'Script Properties에 BACKEND_URL이 없습니다. (예: https://YOUR_BACKEND.onrender.com)');
  }
  if (!/^https:\/\/[^\s/]+/.test(raw)) {
    throw new AppError('INTERNAL_ERROR', null, 'BACKEND_URL은 https:// 로 시작해야 합니다.');
  }
  return raw.replace(/\/+$/, '');
}

/**
 * 백엔드에 JSON을 POST하고 응답 JSON을 돌려줍니다. 실패하면 오류를 던집니다.
 * @param {string} path BACKEND_PATHS 중 하나
 * @param {Object} payload
 * @return {Object}
 */
function callBackend_(path, payload) {
  const url = getBackendUrl_() + path;
  const headers = {};
  headers[WEBHOOK_HEADER] = getSecret_(PROPERTY_KEYS.MAIL_WEBHOOK_SECRET);
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    headers: headers,
    muteHttpExceptions: true, // 4xx·5xx도 예외 대신 응답으로 받아 상태 코드를 직접 확인
    followRedirects: true,
  });
  const status = response.getResponseCode();
  const text = response.getContentText();
  if (status < 200 || status >= 300) {
    // 응답 본문에 개인정보가 섞일 수 있어 앞부분만 로그에 남깁니다.
    throw new AppError('INTERNAL_ERROR', null, `백엔드 ${path} 응답 ${status}: ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new AppError('INTERNAL_ERROR', null, `백엔드 ${path} 응답이 JSON이 아닙니다.`);
  }
}

/**
 * 백엔드가 살아 있는지 확인합니다. (GET /health, 비밀값 없이)
 * @return {string} 결과 문구
 */
function pingBackend_() {
  let url;
  try {
    url = getBackendUrl_() + BACKEND_PATHS.HEALTH;
  } catch (err) {
    return `백엔드 주소 없음 → 스크립트 속성에 BACKEND_URL을 추가하세요.`;
  }
  try {
    const response = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true, followRedirects: true });
    const status = response.getResponseCode();
    return status === 200 ? '백엔드 연결: 정상' : `백엔드 연결: 응답 ${status} (주소를 확인하세요)`;
  } catch (err) {
    return `백엔드 연결: 실패 (${err && err.message ? err.message : err})`;
  }
}
