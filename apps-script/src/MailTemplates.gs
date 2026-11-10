/**
 * MailTemplates.gs — 메일 내용 만들기
 *
 * 이 파일이 하는 일
 * - 멘토에게 보낼 메일, 학생에게 전달할 답장 메일의 제목·본문(글자 버전, HTML 버전)을 만듭니다.
 * - 서비스 이름, 말머리, 맨 아래 안내 문구는 "설정" 탭 값을 씁니다.
 * - 학생의 메일 주소는 멘토에게 보여주지 않습니다. (멘토 답장은 중계 주소를 거쳐 학생에게 전달)
 * - 학생이 쓴 글은 HTML로 해석되지 않게 바꿔서(escape) 넣습니다.
 * - 문의번호는 제목에 넣지 않고, 본문 맨 아래 작은 글씨 한 줄로만 넣습니다.
 *   답장 매칭은 Reply-To의 plus 주소(+문의번호)가 1순위이고,
 *   이 줄은 멘토 답장의 인용 부분에서 문의번호를 찾는 보조 단서입니다. (Step 4)
 */

/** 본문 맨 아래 문의번호 줄의 앞말. Step 4에서 이 줄을 찾고, 학생에게 전달할 때 지웁니다. */
const INQUIRY_ID_LINE_LABEL = '문의번호';

/**
 * 본문 맨 아래 문의번호 한 줄. 예: "문의번호: q20261108-0001"
 * @param {string} inquiryId
 * @return {string}
 */
function buildInquiryIdLine_(inquiryId) {
  return `${INQUIRY_ID_LINE_LABEL}: ${inquiryId}`;
}

/**
 * 멘토 메일의 둘째 줄. 예: "꾸로록에서 학생 문의가 도착했어요."
 * 답장에 원래 메일이 인용 표시 없이 붙어 오면, ReplyParser.gs가 이 줄을 찾아 그 아래를 잘라냅니다.
 * @param {string} serviceName
 * @return {string}
 */
function buildMentorIntroLine_(serviceName) {
  return `${serviceName}에서 학생 문의가 도착했어요.`;
}

/**
 * HTML 특수문자를 안전한 글자로 바꿉니다.
 * @param {string} text
 * @return {string}
 */
function escapeHtml_(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 줄바꿈을 HTML 줄바꿈으로 바꿉니다 (escape 후 사용) */
function nl2br_(html) {
  return html.replace(/\n/g, '<br>');
}

/**
 * 멘토에게 보낼 문의 메일
 * @param {Object<string,string>} settings "설정" 탭 값
 * @param {{name: string}} mentor
 * @param {{inquiryId: string, studentName: string, title: string, body: string}} inquiry
 * @return {{subject: string, textBody: string, htmlBody: string}}
 */
function buildMentorInquiryMail_(settings, mentor, inquiry) {
  const serviceName = requireSetting_(settings, SETTING_KEYS.SERVICE_NAME);
  const prefix = requireSetting_(settings, SETTING_KEYS.MENTOR_SUBJECT_PREFIX);
  const footer = requireSetting_(settings, SETTING_KEYS.MENTOR_FOOTER);

  const subject = `${prefix} ${inquiry.title}`;
  const idLine = buildInquiryIdLine_(inquiry.inquiryId);

  const textBody = [
    `안녕하세요, ${mentor.name}님.`,
    buildMentorIntroLine_(serviceName),
    '',
    `- 학생 이름: ${inquiry.studentName}`,
    `- 제목: ${inquiry.title}`,
    '',
    '──────────',
    inquiry.body,
    '──────────',
    '',
    footer,
    '',
    idLine,
  ].join('\n');

  const e = escapeHtml_;
  const htmlBody = [
    '<div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#222">',
    `<p>안녕하세요, ${e(mentor.name)}님.<br>${e(buildMentorIntroLine_(serviceName))}</p>`,
    '<table style="border-collapse:collapse;margin:8px 0">',
    `<tr><td style="padding:2px 12px 2px 0;color:#666">학생 이름</td><td>${e(inquiry.studentName)}</td></tr>`,
    `<tr><td style="padding:2px 12px 2px 0;color:#666">제목</td><td>${e(inquiry.title)}</td></tr>`,
    '</table>',
    `<div style="border-left:3px solid #ccc;padding:8px 12px;margin:12px 0;background:#fafafa">${nl2br_(e(inquiry.body))}</div>`,
    `<p style="margin-top:24px;font-weight:bold">${nl2br_(e(footer))}</p>`,
    `<p style="margin-top:16px;font-size:11px;color:#999">${e(idLine)}</p>`,
    '</div>',
  ].join('');

  return { subject: subject, textBody: textBody, htmlBody: htmlBody };
}

/**
 * 학생에게 전달할 답장 메일
 * - 멘토 이름만 보여주고, 멘토 이메일·문의번호·멘토 안내 문구는 넣지 않습니다.
 * @param {Object<string,string>} settings "설정" 탭 값
 * @param {{studentName: string, title: string}} inquiry
 * @param {string} mentorName "멘토" 탭의 이름
 * @param {string} replyText 인용문·문의번호·안내 문구를 지운 멘토 답장 본문 (ReplyParser.gs)
 * @return {{subject: string, textBody: string, htmlBody: string}}
 */
function buildStudentForwardMail_(settings, inquiry, mentorName, replyText) {
  const prefix = requireSetting_(settings, SETTING_KEYS.STUDENT_SUBJECT_PREFIX);
  const intro = requireSetting_(settings, SETTING_KEYS.STUDENT_FORWARD_INTRO);
  const footer = requireSetting_(settings, SETTING_KEYS.STUDENT_FORWARD_FOOTER);

  const subject = `${prefix} ${inquiry.title}`;

  const textBody = [
    `안녕하세요, ${inquiry.studentName}님.`,
    intro,
    '',
    `- 답장한 멘토: ${mentorName}`,
    `- 내 문의 제목: ${inquiry.title}`,
    '',
    '──────────',
    replyText,
    '──────────',
    '',
    footer,
  ].join('\n');

  const e = escapeHtml_;
  const htmlBody = [
    '<div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#222">',
    `<p>안녕하세요, ${e(inquiry.studentName)}님.<br>${nl2br_(e(intro))}</p>`,
    '<table style="border-collapse:collapse;margin:8px 0">',
    `<tr><td style="padding:2px 12px 2px 0;color:#666">답장한 멘토</td><td>${e(mentorName)}</td></tr>`,
    `<tr><td style="padding:2px 12px 2px 0;color:#666">내 문의 제목</td><td>${e(inquiry.title)}</td></tr>`,
    '</table>',
    `<div style="border-left:3px solid #ccc;padding:8px 12px;margin:12px 0;background:#fafafa">${nl2br_(e(replyText))}</div>`,
    `<p style="margin-top:24px;font-size:12px;color:#666">${nl2br_(e(footer))}</p>`,
    '</div>',
  ].join('');

  return { subject: subject, textBody: textBody, htmlBody: htmlBody };
}
