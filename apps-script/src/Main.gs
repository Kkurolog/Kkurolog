/**
 * Main.gs — 웹앱 입구 (라우터)
 *
 * 이 파일이 하는 일
 * - 팀 백엔드 서버가 웹앱 URL로 POST를 보내면 doPost가 받습니다.
 * - 본문(JSON)을 읽고 → apiKey를 확인하고 → action에 맞는 함수로 보냅니다.
 * - 어떤 오류가 나도 항상 {"ok":false,"error":{...}} 형식으로 답합니다.
 *   (Apps Script 웹앱은 HTTP 상태 코드를 바꿀 수 없어서 항상 200입니다. 성공 여부는 ok 값으로 봅니다)
 */

/** 웹앱 POST 입구 */
function doPost(e) {
  const raw = e && e.postData ? e.postData.contents : '';
  return toJsonOutput_(handleRequest_(raw));
}

/** 웹앱 GET 입구: 주소가 살아 있는지만 확인합니다. (정보는 아무것도 주지 않음) */
function doGet() {
  return toJsonOutput_(okResponse_({ status: 'alive' }));
}

/**
 * action 이름 → 처리 함수
 * (함수 안에 두어야 파일 순서와 상관없이 다른 파일의 함수를 찾을 수 있습니다)
 * @param {*} action
 * @return {function(Object): Object}
 */
function getActionHandler_(action) {
  const handlers = {
    getMentors: getMentorsAction_,
    submitInquiry: submitInquiryAction_,
    // Step 5에서 추가: getInquiries, getInquiry
  };
  if (typeof action !== 'string' || !Object.prototype.hasOwnProperty.call(handlers, action)) {
    throw new AppError('INVALID_ACTION');
  }
  return handlers[action];
}

/**
 * 요청 본문(JSON 문자열)을 객체로 바꿉니다.
 * @param {string} raw
 * @return {Object}
 */
function parseRequestBody_(raw) {
  let req;
  try {
    req = JSON.parse(raw);
  } catch (err) {
    throw new AppError('INVALID_INPUT', '요청 본문이 올바른 JSON이 아닙니다.');
  }
  if (!req || typeof req !== 'object' || Array.isArray(req)) {
    throw new AppError('INVALID_INPUT', '요청 본문이 올바른 JSON 객체가 아닙니다.');
  }
  return req;
}

/** apiKey 확인. 틀리면 UNAUTHORIZED */
function verifyApiKey_(apiKey) {
  if (!safeEqual_(apiKey, getSecret_(PROPERTY_KEYS.API_KEY))) {
    throw new AppError('UNAUTHORIZED');
  }
}

/**
 * 요청 하나를 처리해 응답 객체를 돌려줍니다. (Test.gs도 이 함수를 직접 부릅니다)
 * @param {string} raw 요청 본문
 * @return {Object} 성공/실패 응답 객체
 */
function handleRequest_(raw) {
  let action = '(알 수 없음)';
  try {
    const req = parseRequestBody_(raw);
    action = String(req.action);
    verifyApiKey_(req.apiKey);
    const handler = getActionHandler_(req.action);
    return okResponse_(handler(req));
  } catch (err) {
    if (err instanceof AppError) {
      // 로그에는 내부 설명까지, 응답에는 공개 문구만
      console.warn(`[${action}] ${err.code}: ${err.message} ${err.detail}`);
      return errorResponse_(err.code, err.message);
    }
    console.error(`[${action}] 예상하지 못한 오류: ${err && err.stack ? err.stack : err}`);
    return errorResponse_('INTERNAL_ERROR');
  }
}
