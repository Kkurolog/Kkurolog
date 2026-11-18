/**
 * Response.gs — 공통 응답 형식과 에러
 *
 * - 성공 응답 {"ok":true,"data":{...}} 과 실패 응답 {"ok":false,"error":{...}} 을 만듭니다.
 * - 코드 어디서든 `throw new AppError('INVALID_INPUT', '...')` 처럼 던지면 Main.gs가 실패 응답으로 바꿉니다.
 */

/** 에러 코드별 기본 문구 (docs/API.md 의 에러 코드 목록과 같음) */
const ERROR_MESSAGES = Object.freeze({
  UNAUTHORIZED: '인증에 실패했습니다.',
  INVALID_ACTION: '지원하지 않는 action입니다.',
  INVALID_EMAIL: '메일 주소 형식이 올바르지 않습니다.',
  INVALID_INPUT: '입력값이 올바르지 않습니다.',
  QUOTA_EXCEEDED: '오늘 보낼 수 있는 메일 수를 모두 썼습니다.',
  SEND_FAILED: '메일을 보내지 못했습니다.',
  INTERNAL_ERROR: '서버 오류가 발생했습니다.',
});

/**
 * 우리가 의도해서 던지는 에러.
 * - code: 응답에 나가는 에러 코드
 * - message: 응답에 나가는 문구 (null이면 기본 문구)
 * - detail: 로그에만 남기는 내부 설명
 */
class AppError extends Error {
  constructor(code, message, detail) {
    super(message || ERROR_MESSAGES[code] || ERROR_MESSAGES.INTERNAL_ERROR);
    this.name = 'AppError';
    this.code = ERROR_MESSAGES[code] ? code : 'INTERNAL_ERROR';
    this.detail = detail || '';
  }
}

/** 성공 응답 객체 */
function okResponse_(data) {
  return { ok: true, data: data };
}

/** 실패 응답 객체 */
function errorResponse_(code, message) {
  return { ok: false, error: { code: code, message: message || ERROR_MESSAGES[code] } };
}

/** 응답 객체를 웹앱이 돌려줄 JSON 텍스트로 바꿉니다. */
function toJsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
