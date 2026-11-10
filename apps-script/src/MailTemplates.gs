/**
 * MailTemplates.gs — 메일 내용 만들기
 *
 * 이 파일이 하는 일
 * - 멘토에게 보낼 메일의 제목·본문(글자 버전, HTML 버전)을 만듭니다.
 * - 서비스 이름, 말머리, 맨 아래 안내 문구는 "설정" 탭 값을 씁니다.
 * - 학생의 메일 주소는 멘토에게 보여주지 않습니다. (멘토 답장은 중계 주소를 거쳐 학생에게 전달)
 * - 학생이 쓴 글은 HTML로 해석되지 않게 바꿔서(escape) 넣습니다.
 */

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

  // 제목 끝에 문의번호를 붙여 둡니다. 멘토·관리자가 메일함에서 문의를 찾기 쉽고,
  // Step 4에서 답장을 찾을 때 보조 단서로 쓸 수 있습니다.
  const subject = `${prefix} ${inquiry.title} (${inquiry.inquiryId})`;

  const textBody = [
    `안녕하세요, ${mentor.name}님.`,
    `${serviceName}에서 학생 문의가 도착했어요.`,
    '',
    `- 학생 이름: ${inquiry.studentName}`,
    `- 제목: ${inquiry.title}`,
    `- 문의번호: ${inquiry.inquiryId}`,
    '',
    '──────────',
    inquiry.body,
    '──────────',
    '',
    footer,
  ].join('\n');

  const e = escapeHtml_;
  const htmlBody = [
    '<div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#222">',
    `<p>안녕하세요, ${e(mentor.name)}님.<br>${e(serviceName)}에서 학생 문의가 도착했어요.</p>`,
    '<table style="border-collapse:collapse;margin:8px 0">',
    `<tr><td style="padding:2px 12px 2px 0;color:#666">학생 이름</td><td>${e(inquiry.studentName)}</td></tr>`,
    `<tr><td style="padding:2px 12px 2px 0;color:#666">제목</td><td>${e(inquiry.title)}</td></tr>`,
    `<tr><td style="padding:2px 12px 2px 0;color:#666">문의번호</td><td>${e(inquiry.inquiryId)}</td></tr>`,
    '</table>',
    `<div style="border-left:3px solid #ccc;padding:8px 12px;margin:12px 0;background:#fafafa">${nl2br_(e(inquiry.body))}</div>`,
    `<p style="margin-top:24px;font-weight:bold">${nl2br_(e(footer))}</p>`,
    '</div>',
  ].join('');

  return { subject: subject, textBody: textBody, htmlBody: htmlBody };
}
