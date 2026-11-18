/**
 * MailApi.gs — 웹앱 action: sendMail, getQuota
 *
 * - sendMail: 백엔드가 만든 메일(받는 사람·제목·본문)을 중계 Gmail로 그대로 보냅니다.
 *   메일 문장은 백엔드가 Supabase mail_settings 값으로 만들어 보냅니다. 여기서는 내용을 고치지 않습니다.
 * - 답장 주소: replyToInquiryId(문의번호)를 주면 "중계계정+문의번호@도메인"을 여기서 만들어 Reply-To로 씁니다.
 *   그래서 백엔드는 중계 메일 주소를 몰라도 됩니다. (기관 계정으로 바뀌어도 백엔드 설정 그대로)
 * - getQuota: 오늘 남은 Gmail 발송 수
 */

/** 메일 주소 형식 (간단히: 글자@글자.글자) */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 글자 입력을 검사합니다.
 * @param {*} value
 * @param {string} field 오류 문구용 이름
 * @param {number} min 최소 길이
 * @param {number} max 최대 길이
 * @return {string}
 */
function requireString_(value, field, min, max) {
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    throw new AppError('INVALID_INPUT', `${field}는 ${min}~${max}자 글자로 보내 주세요.`);
  }
  return value;
}

/**
 * sendMail 요청을 검사하고 정리합니다. (메일을 보내지 않는 함수: Test.gs에서 검사)
 * @param {Object} req
 * @return {{to: string, replyToInquiryId: ?string, fromName: string, subject: string,
 *           textBody: string, htmlBody: ?string}}
 */
function validateSendMailRequest_(req) {
  const to = typeof req.to === 'string' ? req.to.trim() : '';
  if (to.length > LIMITS.EMAIL_MAX || !EMAIL_PATTERN.test(to)) {
    throw new AppError('INVALID_EMAIL', '받는 사람(to) 메일 주소 형식이 올바르지 않습니다.');
  }
  let replyToInquiryId = null;
  if (req.replyToInquiryId !== undefined && req.replyToInquiryId !== null) {
    const pattern = new RegExp(`^${INQUIRY_ID_PATTERN}$`);
    if (typeof req.replyToInquiryId !== 'string' || !pattern.test(req.replyToInquiryId)) {
      throw new AppError('INVALID_INPUT', 'replyToInquiryId는 문의번호 형식(예: q20261117-0001)이어야 합니다.');
    }
    replyToInquiryId = req.replyToInquiryId;
  }
  const htmlBody =
    req.htmlBody === undefined || req.htmlBody === null
      ? null
      : requireString_(req.htmlBody, 'htmlBody', 1, LIMITS.HTML_BODY_MAX);
  return {
    to: to,
    replyToInquiryId: replyToInquiryId,
    fromName: requireString_(req.fromName, 'fromName', 1, LIMITS.FROM_NAME_MAX),
    subject: requireString_(req.subject, 'subject', 1, LIMITS.SUBJECT_MAX),
    textBody: requireString_(req.textBody, 'textBody', 1, LIMITS.TEXT_BODY_MAX),
    htmlBody: htmlBody,
  };
}

/**
 * action: sendMail
 * @param {Object} req
 * @return {{sentAt: string}}
 */
function sendMailAction_(req) {
  const mail = validateSendMailRequest_(req);
  if (Mailer.remainingDailyQuota() < 1) {
    throw new AppError('QUOTA_EXCEEDED');
  }
  try {
    Mailer.send({
      to: mail.to,
      replyTo: mail.replyToInquiryId ? toPlusAddress_(getRelayAddress_(), mail.replyToInquiryId) : undefined,
      fromName: mail.fromName,
      subject: mail.subject,
      textBody: mail.textBody,
      htmlBody: mail.htmlBody || undefined,
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('SEND_FAILED', null, String(err && err.message));
  }
  return { sentAt: toIsoKst_(new Date()) };
}

/**
 * action: getQuota
 * @return {{remaining: number}}
 */
function getQuotaAction_() {
  return { remaining: Mailer.remainingDailyQuota() };
}
