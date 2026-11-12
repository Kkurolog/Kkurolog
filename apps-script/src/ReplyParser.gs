/**
 * ReplyParser.gs — 멘토 답장에서 문의번호 찾기, 학생에게 보낼 본문만 남기기
 *
 * 이 파일이 하는 일
 * 1. 문의번호 찾기
 *    ① 1순위: 받는 사람 주소의 plus 부분 (중계계정+q20261108-0001@...)
 *    ② 2순위: 본문(인용 부분 포함)의 "문의번호: q20261108-0001" 줄
 *    ③ 둘 다 없으면 null (그 메일은 무시)
 * 2. 학생에게 보낼 본문 만들기
 *    - 원래 메일의 인용 부분 전체를 지웁니다. (학생 본인의 문의, 멘토 안내 문구, 문의번호 줄이 여기 있음)
 *    - 인용 지우기가 완벽하지 않을 때를 대비해, 문의번호 줄과 멘토 안내 문구(mentorFooter)를 따로 한 번 더 지웁니다.
 *    - (Step 5-1) 리마인드 메일에 답장한 경우를 위해, 리마인드 문구(mentorReminderIntro)도 같은 방법으로 지웁니다.
 */

/**
 * 메일에서 문의번호를 찾습니다.
 * @param {{recipients: string[], plainBody: string}} message Receiver가 만든 메일
 * @param {string} relayAddress 중계 메일 주소
 * @return {?string} 문의번호 (소문자) 또는 null
 */
function findInquiryIdInMessage_(message, relayAddress) {
  // ① 받는 사람 주소의 +문의번호
  const parts = splitAddress_(relayAddress);
  const plusPattern = new RegExp(
    `${escapeRegExp_(parts.local)}\\+(${INQUIRY_ID_PATTERN})@${escapeRegExp_(parts.domain)}`,
    'i'
  );
  for (let i = 0; i < message.recipients.length; i++) {
    const match = String(message.recipients[i]).match(plusPattern);
    if (match) return match[1].toLowerCase();
  }
  // ② 본문의 "문의번호: q..." 줄 (보조 단서)
  const linePattern = new RegExp(
    `${escapeRegExp_(INQUIRY_ID_LINE_LABEL)}\\s*:\\s*(${INQUIRY_ID_PATTERN})`,
    'i'
  );
  const bodyMatch = String(message.plainBody).match(linePattern);
  return bodyMatch ? bodyMatch[1].toLowerCase() : null;
}

/**
 * 인용(원래 메일)이 시작되는 줄인지 봅니다. 메일 앱마다 모양이 달라서 자주 쓰는 모양을 모았습니다.
 * @param {string[]} lines
 * @param {number} i 지금 줄 번호
 * @param {string} introLine 멘토 메일 둘째 줄 (예: "꾸로록에서 학생 문의가 도착했어요.")
 * @return {boolean}
 */
function isQuoteStart_(lines, i, introLine, reminderIntro) {
  const line = lines[i].trim();
  const next = (lines[i + 1] || '').trim();
  // Gmail 영어: "On Tue, Nov 10, 2026 at 1:45 PM 꾸로록 <...> wrote:" (두 줄로 나뉘기도 함)
  if (/^On\s.+/i.test(line) && (/wrote:$/i.test(line) || /^wrote:$/i.test(next) || /wrote:$/i.test(next))) return true;
  // Gmail·네이버 한국어: "2026년 11월 10일 (화) 오후 1:45, 꾸로록 <...>님이 작성:" (두 줄로 나뉘기도 함)
  if (/^\d{4}년\s*\d{1,2}월\s*\d{1,2}일/.test(line) && (/작성:$/.test(line) || /작성:$/.test(next))) return true;
  // 아웃룩·네이버·다음 등: "-----Original Message-----", "-----원본 메시지-----", "------ 원본 메일 ------"
  if (/^-{2,}\s*(original message|원본\s*메시지|원본\s*메일|forwarded message|전달된\s*메시지)\s*-{2,}$/i.test(line)) return true;
  // 아웃룩: 밑줄 구분선 다음에 "From:/보낸 사람:"
  if (/^_{5,}$/.test(line) && /^(from|보낸\s*사람)\s*:/i.test(next)) return true;
  // 헤더 묶음이 바로 나오는 경우: "From: ..." 다음 줄이 "Sent:/Date:/보낸 날짜:"
  if (/^(from|보낸\s*사람)\s*:/i.test(line) && /^(sent|date|보낸\s*날짜|날짜)\s*:/i.test(next)) return true;
  // 인용 표시 없이 원래 메일이 그대로 붙은 경우: "안녕하세요, ○○님." + 멘토 메일 둘째 줄
  if (/^안녕하세요,/.test(line) && next === introLine) return true;
  if (line === introLine) return true;
  // 인용 표시 없이 리마인드 메일이 그대로 붙은 경우: 맨 위 리마인드 문구
  if (reminderIntro && line === reminderIntro) return true;
  return false;
}

/**
 * 멘토 답장 원문에서 학생에게 보낼 부분만 남깁니다.
 * @param {string} plainBody 답장 메일 본문 (글자 버전)
 * @param {Object<string,string>} settings "설정" 탭 값
 * @return {string} 남은 본문 (비어 있을 수 있음)
 */
function extractReplyText_(plainBody, settings) {
  const footer = requireSetting_(settings, SETTING_KEYS.MENTOR_FOOTER);
  const introLine = buildMentorIntroLine_(requireSetting_(settings, SETTING_KEYS.SERVICE_NAME));
  // 리마인드 문구는 없어도 됩니다 (설정 탭에 키가 아직 없는 시트 대비)
  const reminderIntro = String(settings[SETTING_KEYS.MENTOR_REMINDER_INTRO] || '').trim();

  const lines = String(plainBody).replace(/\r\n?/g, '\n').split('\n');

  // 1) 인용이 시작되는 줄부터 끝까지 잘라냅니다.
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (isQuoteStart_(lines, i, introLine, reminderIntro)) {
      end = i;
      break;
    }
  }
  const idLinePattern = new RegExp(
    `^\\s*${escapeRegExp_(INQUIRY_ID_LINE_LABEL)}\\s*:\\s*${INQUIRY_ID_PATTERN}\\s*$`,
    'i'
  );
  const kept = lines.slice(0, end).filter(function (line) {
    // 2) ">"로 시작하는 인용 줄을 지웁니다. (중간중간 끼워 답한 경우 포함)
    if (/^\s*>/.test(line)) return false;
    // 3) 혹시 남은 문의번호 줄을 지웁니다.
    if (idLinePattern.test(line)) return false;
    return true;
  });

  // 4) 혹시 남은 멘토 안내 문구·리마인드 문구를 지웁니다.
  let text = kept.join('\n').split(footer).join('');
  if (reminderIntro) text = text.split(reminderIntro).join('');

  // 5) 빈 줄 정리
  text = text.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
  return text;
}
