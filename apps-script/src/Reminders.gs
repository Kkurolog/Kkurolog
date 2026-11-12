/**
 * Reminders.gs — 답장이 없는 문의를 멘토에게 한 번 더 보내기 (Step 5-1, 하루 한 번 도는 트리거)
 *
 * 이 파일이 하는 일 (sendReminders가 매일 오전 10시~11시 사이에 실행됨)
 * 1. "문의" 탭에서 아래 조건을 모두 만족하는 문의를 찾습니다.
 *    - 답장여부가 FALSE
 *    - 리마인드일시가 비어 있음 (리마인드는 한 번만 보냄)
 *    - 보낸 날짜 + reminderDays일(기본 10일)이 됐거나 지남 (한국 날짜 기준. 예: 11월 1일 → 11월 11일)
 * 2. 멘토가 비활성이면 보내지 않습니다. (쉬는 중인 멘토. 다시 활성화하면 다음 실행 때 보냅니다)
 * 3. 원래 문의 메일과 똑같이 보내되, 제목 말머리를 mentorReminderSubjectPrefix로 바꾸고 맨 위에 리마인드 문구를 넣습니다.
 *    답장 주소(Reply-To)는 원래와 같은 중계계정+문의번호라서, 멘토가 '답장'하면 checkReplies가 그대로 학생에게 전달합니다.
 * 4. 보낸 문의는 "리마인드일시"에 시각을 기록합니다.
 *
 * 설정 탭의 reminderDays를 0으로 하면 리마인드를 보내지 않습니다.
 */

/**
 * [시간 트리거가 부르는 함수] 편집기·시트 메뉴에서 직접 실행해도 됩니다. (조건에 맞는 문의만 보냄)
 * @return {string} 결과 요약
 */
function sendReminders() {
  const lock = LockService.getDocumentLock() || LockService.getScriptLock();
  if (!lock.tryLock(60000)) {
    const busy = '다른 작업(답장 확인 등)이 오래 걸려 이번 리마인드는 건너뜁니다. 다음 실행 때 보냅니다.';
    console.warn(busy);
    return busy;
  }
  try {
    return processReminders_();
  } catch (err) {
    console.error(`리마인드 중 오류: ${err && err.detail ? err.detail : ''} ${err && err.stack ? err.stack : err}`);
    throw err; // 트리거 실패 알림 메일이 중계 계정으로 갑니다
  } finally {
    lock.releaseLock();
  }
}

/**
 * 리마인드를 보낼 때가 됐는지 봅니다. (시트를 읽지 않는 계산만 하는 함수: Test.gs에서 검사)
 * @param {{replied: boolean, remindedAt: string, createdAt: string}} inquiry
 * @param {Date} now
 * @param {number} days reminderDays (0이면 항상 false)
 * @return {boolean}
 */
function isReminderDue_(inquiry, now, days) {
  if (days <= 0) return false;
  if (inquiry.replied) return false;
  if (String(inquiry.remindedAt || '').trim() !== '') return false;
  const createdAt = parseIsoDate_(inquiry.createdAt);
  if (!createdAt) return false;
  return calendarDaysBetween_(createdAt, now) >= days;
}

/**
 * "문의" 탭의 모든 줄을 읽습니다. (리마인드용)
 * @return {{sheet: GoogleAppsScript.Spreadsheet.Sheet, col: Object<string,number>, rows: Object[]}}
 */
function readInquiryRows_() {
  const table = readTable_(SHEET_NAMES.INQUIRIES);
  const col = columnIndexes_(table.headers, INQUIRY_HEADERS, SHEET_NAMES.INQUIRIES);
  const rows = [];
  table.displayValues.forEach(function (row, i) {
    if (!row[col.ID]) return;
    rows.push({
      rowNumber: i + 2, // 1행은 헤더
      inquiryId: row[col.ID],
      createdAt: row[col.CREATED_AT],
      mentorId: row[col.MENTOR_ID],
      studentName: row[col.STUDENT_NAME],
      title: row[col.TITLE],
      body: row[col.BODY],
      replied: isTruthyCell_(table.values[i][col.REPLIED]),
      remindedAt: row[col.REMINDED_AT],
    });
  });
  return { sheet: table.sheet, col: col, rows: rows };
}

/**
 * 리마인드 한 번
 * @return {string} 결과 요약
 */
function processReminders_() {
  const settings = getSettings_();
  const days = getNumberSetting_(settings, SETTING_KEYS.REMINDER_DAYS);
  if (days <= 0) {
    const off = '설정 탭의 reminderDays가 0이라 리마인드를 보내지 않습니다.';
    console.log(off);
    return off;
  }
  [
    SETTING_KEYS.SERVICE_NAME,
    SETTING_KEYS.SENDER_NAME,
    SETTING_KEYS.MENTOR_FOOTER,
    SETTING_KEYS.MENTOR_REMINDER_SUBJECT_PREFIX,
    SETTING_KEYS.MENTOR_REMINDER_INTRO,
  ].forEach(function (key) { requireSetting_(settings, key); });

  const now = new Date();
  const data = readInquiryRows_();
  const due = data.rows.filter(function (inquiry) { return isReminderDue_(inquiry, now, days); });
  const mentorsById = {};
  readAllMentors_().forEach(function (m) { mentorsById[m.mentorId] = m; });

  const counts = { sent: 0, skipped: 0, failed: 0, later: 0 };
  for (let i = 0; i < due.length; i++) {
    const inquiry = due[i];
    const mentor = mentorsById[inquiry.mentorId];
    if (!mentor || !mentor.active) {
      counts.skipped++; // 비활성(또는 지워진) 멘토: 보내지 않음
      continue;
    }
    if (counts.sent >= REMINDER_CONFIG.MAX_MESSAGES_PER_RUN || Mailer.remainingDailyQuota() < 1) {
      counts.later = due.length - i; // 남은 것은 다음 실행(내일)에 보냄
      break;
    }
    try {
      sendReminderForRow_(data.sheet, data.col, inquiry, mentor, settings, now);
      counts.sent++;
    } catch (err) {
      counts.failed++;
      console.warn(`리마인드 실패(다음 실행 때 다시 시도): ${inquiry.inquiryId}: ${err && err.detail ? err.detail : err}`);
    }
  }

  const summary =
    `리마인드 완료: 보냄 ${counts.sent}, 비활성 멘토라 건너뜀 ${counts.skipped}, 실패 ${counts.failed}, 다음에 보냄 ${counts.later}`;
  console.log(summary);
  return summary;
}

/**
 * 문의 한 건의 리마인드를 멘토에게 보내고 "리마인드일시"를 기록합니다. (Test.gs의 testSendReminder도 씁니다)
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet "문의" 탭
 * @param {Object<string,number>} col 열 위치
 * @param {{rowNumber: number, inquiryId: string, studentName: string, title: string, body: string}} inquiry
 * @param {{name: string, email: string}} mentor
 * @param {Object<string,string>} settings
 * @param {Date} now
 */
function sendReminderForRow_(sheet, col, inquiry, mentor, settings, now) {
  const message = buildMentorInquiryMail_(settings, mentor, inquiry, true);
  Mailer.send({
    to: mentor.email,
    replyTo: toPlusAddress_(getRelayAddress_(), inquiry.inquiryId),
    fromName: requireSetting_(settings, SETTING_KEYS.SENDER_NAME),
    subject: message.subject,
    textBody: message.textBody,
    htmlBody: message.htmlBody,
  });

  // 보낸 뒤 기록. 그사이 줄이 바뀌었으면(드문 경우) 문의번호로 다시 찾습니다.
  let rowNumber = inquiry.rowNumber;
  const idCell = sheet.getRange(rowNumber, col.ID + 1).getDisplayValue();
  if (String(idCell).toLowerCase() !== String(inquiry.inquiryId).toLowerCase()) {
    const again = readInquiryRows_().rows.find(function (r) {
      return String(r.inquiryId).toLowerCase() === String(inquiry.inquiryId).toLowerCase();
    });
    if (!again) return;
    rowNumber = again.rowNumber;
  }
  const cell = sheet.getRange(rowNumber, col.REMINDED_AT + 1);
  cell.setNumberFormat('@');
  cell.setValue(toIsoKst_(now));
  SpreadsheetApp.flush();
  console.log(`리마인드 보냄: ${inquiry.inquiryId} → ${mentor.mentorId}`);
}
