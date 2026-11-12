/**
 * Replies.gs — 멘토 답장을 학생에게 자동 전달 (시간 트리거)
 *
 * 이 파일이 하는 일 (checkReplies가 5분마다 실행됨)
 * 1. 지난번 확인 이후 중계 Gmail에 들어온 메일을 가져옵니다. (Receiver.gs)
 * 2. 메일마다 문의번호를 찾습니다. 못 찾거나 시트에 없는 번호면 무시합니다. (ReplyParser.gs)
 * 3. 보낸 사람이 그 문의의 멘토(시트에 등록된 메일)인지 확인합니다. 아니면 전달하지 않고 '확인필요' 라벨.
 * 4. 인용문·문의번호·안내 문구를 지운 본문을 학생에게 전달합니다. (멘토 이름만 표시)
 * 5. 시트에 답장여부 TRUE, 답장일시(첫 답장 시각)를 기록합니다. 두 번째 답장부터는 전달만 하고 일시는 그대로.
 *
 * 같은 메일을 두 번 전달하지 않도록
 * - 처리한 메일 ID를 Script Properties에 기억합니다. (사람이 메일을 읽음 처리해도 영향 없음)
 * - 실행이 겹치지 않게 잠금(LockService)을 씁니다.
 */

/**
 * [시간 트리거가 부르는 함수] 편집기·시트 메뉴에서 직접 실행해도 됩니다. (5분을 기다리지 않고 바로 확인)
 * @return {string} 결과 요약
 */
function checkReplies() {
  const lock = LockService.getDocumentLock() || LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    const busy = '이전 확인이 아직 진행 중이라 이번 차례는 건너뜁니다.';
    console.log(busy);
    return busy;
  }
  try {
    return processReplies_();
  } catch (err) {
    console.error(`답장 확인 중 오류: ${err && err.detail ? err.detail : ''} ${err && err.stack ? err.stack : err}`);
    throw err; // 트리거 실패 알림 메일이 중계 계정으로 갑니다
  } finally {
    lock.releaseLock();
  }
}

/** 기억해 둔 상태(마지막 확인 시각, 처리한 메일 ID)를 읽습니다. */
function loadReplyState_(props) {
  let processedIds = [];
  try {
    processedIds = JSON.parse(props.getProperty(PROPERTY_KEYS.REPLY_PROCESSED_IDS) || '[]');
  } catch (err) {
    processedIds = [];
  }
  return {
    lastCheckedAt: Number(props.getProperty(PROPERTY_KEYS.REPLY_LAST_CHECKED_AT)) || 0,
    processedIds: Array.isArray(processedIds) ? processedIds : [],
  };
}

/** 처리한 메일 ID를 기억합니다. (최근 PROCESSED_IDS_MAX개만) */
function rememberProcessed_(props, state, messageId) {
  if (state.processedIds.indexOf(messageId) >= 0) return;
  state.processedIds.push(messageId);
  if (state.processedIds.length > REPLY_CONFIG.PROCESSED_IDS_MAX) {
    state.processedIds = state.processedIds.slice(-REPLY_CONFIG.PROCESSED_IDS_MAX);
  }
  props.setProperty(PROPERTY_KEYS.REPLY_PROCESSED_IDS, JSON.stringify(state.processedIds));
}

/**
 * 답장 확인 한 번
 * @return {string} 결과 요약
 */
function processReplies_() {
  const startedAt = Date.now();
  const props = PropertiesService.getScriptProperties();
  const state = loadReplyState_(props);
  const since = state.lastCheckedAt
    ? new Date(state.lastCheckedAt - REPLY_CONFIG.OVERLAP_MS)
    : new Date(startedAt - REPLY_CONFIG.FIRST_LOOKBACK_MS);

  const settings = getSettings_();
  [
    SETTING_KEYS.SERVICE_NAME,
    SETTING_KEYS.SENDER_NAME,
    SETTING_KEYS.MENTOR_FOOTER,
    SETTING_KEYS.STUDENT_SUBJECT_PREFIX,
    SETTING_KEYS.STUDENT_FORWARD_INTRO,
    SETTING_KEYS.STUDENT_FORWARD_FOOTER,
  ].forEach(function (key) { requireSetting_(settings, key); });

  const relay = getRelayAddress_().toLowerCase();
  const messages = Receiver.findMessagesSince(since);
  const counts = { forwarded: 0, ignored: 0, review: 0, retry: 0 };
  let handled = 0;
  let canAdvance = true; // 못 끝낸 메일이 있으면 다음 실행에서 다시 보도록 확인 시각을 옮기지 않음

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (state.processedIds.indexOf(message.id) >= 0) continue; // 이미 처리함
    if (message.fromAddress === relay) continue; // 우리가 보낸 메일
    if (handled >= REPLY_CONFIG.MAX_MESSAGES_PER_RUN) {
      canAdvance = false;
      break;
    }
    handled++;
    const result = handleReplyMessage_(message, relay, settings, function () {
      rememberProcessed_(props, state, message.id);
    });
    counts[result]++;
    if (result === 'retry') canAdvance = false;
    else rememberProcessed_(props, state, message.id);
  }

  if (canAdvance) props.setProperty(PROPERTY_KEYS.REPLY_LAST_CHECKED_AT, String(startedAt));
  const summary =
    `답장 확인 완료: 전달 ${counts.forwarded}, 무시 ${counts.ignored}, 확인필요 ${counts.review}, 다음에 재시도 ${counts.retry}`;
  console.log(summary);
  return summary;
}

/**
 * 메일 한 통 처리
 * @param {Object} message Receiver가 만든 메일
 * @param {string} relay 중계 메일 주소 (소문자)
 * @param {Object<string,string>} settings
 * @param {function()} markProcessed 학생에게 보낸 직후 부름 (그 뒤 오류가 나도 두 번 보내지 않게)
 * @return {'forwarded'|'ignored'|'review'|'retry'}
 */
function handleReplyMessage_(message, relay, settings, markProcessed) {
  // 1) 문의번호 찾기
  const inquiryId = findInquiryIdInMessage_(message, relay);
  if (!inquiryId) return 'ignored'; // 문의번호 없는 메일은 건드리지 않음

  const found = findInquiryRow_(inquiryId);
  if (!found) {
    console.log(`무시: 시트에 없는 문의번호 ${inquiryId}`);
    return 'ignored';
  }

  // 2) 보낸 사람 = 그 문의의 멘토인지 확인
  const mentor = findMentorById_(found.inquiry.mentorId);
  if (!mentor || mentor.email.toLowerCase() !== message.fromAddress) {
    console.warn(`확인필요: ${inquiryId} 답장을 보낸 사람이 등록된 멘토 메일과 다릅니다.`);
    Receiver.addLabel(message, GMAIL_LABELS.NEEDS_REVIEW);
    return 'review';
  }

  // 3) 학생에게 보낼 본문 만들기
  const replyText = extractReplyText_(message.plainBody, settings);
  if (!replyText) {
    console.warn(`확인필요: ${inquiryId} 답장에서 전달할 내용을 찾지 못했습니다.`);
    Receiver.addLabel(message, GMAIL_LABELS.NEEDS_REVIEW);
    return 'review';
  }

  // 4) 학생에게 전달
  const mail = buildStudentForwardMail_(settings, found.inquiry, mentor.name, replyText);
  try {
    Mailer.send({
      to: found.inquiry.studentEmail,
      fromName: requireSetting_(settings, SETTING_KEYS.SENDER_NAME),
      subject: mail.subject,
      textBody: mail.textBody,
      htmlBody: mail.htmlBody,
    });
  } catch (err) {
    console.warn(`재시도 예정: ${inquiryId} 학생에게 전달하지 못했습니다: ${err}`);
    Receiver.addLabel(message, GMAIL_LABELS.NEEDS_REVIEW);
    return 'retry';
  }
  markProcessed();

  // 5) 시트 기록 (첫 답장일 때만 답장일시를 씀)
  markInquiryReplied_(found.rowNumber, inquiryId, message.date);
  Receiver.addLabel(message, GMAIL_LABELS.FORWARDED);
  console.log(`전달 완료: ${inquiryId} → 학생`);
  return 'forwarded';
}

/**
 * "문의" 탭에서 문의번호로 한 줄을 찾습니다.
 * @param {string} inquiryId
 * @return {?{rowNumber: number, inquiry: {inquiryId: string, mentorId: string, studentName: string,
 *           studentEmail: string, title: string}}} 없으면 null
 */
function findInquiryRow_(inquiryId) {
  const table = readTable_(SHEET_NAMES.INQUIRIES);
  const col = columnIndexes_(table.headers, INQUIRY_HEADERS, SHEET_NAMES.INQUIRIES);
  for (let i = 0; i < table.displayValues.length; i++) {
    const row = table.displayValues[i];
    if (String(row[col.ID]).toLowerCase() !== inquiryId) continue;
    return {
      rowNumber: i + 2, // 1행은 헤더
      inquiry: {
        inquiryId: row[col.ID],
        mentorId: row[col.MENTOR_ID],
        studentName: row[col.STUDENT_NAME],
        studentEmail: row[col.STUDENT_EMAIL],
        title: row[col.TITLE],
      },
    };
  }
  return null;
}

/**
 * 답장여부 TRUE, 답장일시 기록. 이미 답장 기록이 있으면 그대로 둡니다. (첫 답장 시각 유지)
 * @param {number} rowNumber
 * @param {string} inquiryId 줄이 바뀌지 않았는지 한 번 더 확인하는 용도
 * @param {Date} repliedAt 멘토 답장 메일의 시각
 */
function markInquiryReplied_(rowNumber, inquiryId, repliedAt) {
  const sheet = getSheet_(SHEET_NAMES.INQUIRIES);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    .map(function (h) { return String(h).trim(); });
  const col = columnIndexes_(headers, INQUIRY_HEADERS, SHEET_NAMES.INQUIRIES);
  const idCell = sheet.getRange(rowNumber, col.ID + 1).getDisplayValue();
  if (String(idCell).toLowerCase() !== inquiryId) {
    const again = findInquiryRow_(inquiryId);
    if (!again) return;
    rowNumber = again.rowNumber;
  }
  const repliedCell = sheet.getRange(rowNumber, col.REPLIED + 1);
  if (isTruthyCell_(repliedCell.getValue())) return; // 두 번째 이후 답장
  repliedCell.setValue(true);
  const repliedAtCell = sheet.getRange(rowNumber, col.REPLIED_AT + 1);
  repliedAtCell.setNumberFormat('@');
  repliedAtCell.setValue(toIsoKst_(repliedAt));
  SpreadsheetApp.flush();
}
