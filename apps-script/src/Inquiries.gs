/**
 * Inquiries.gs — 문의 제출 (submitInquiry)
 *
 * 이 파일이 하는 일
 * 1. 입력값 검사 (이름·제목·내용 길이, 이메일 형식, 개인정보 동의, 활성 멘토)
 * 2. 같은 학생 메일로 너무 자주 보냈는지 확인 (Step 5-1. 기본: 10분에 1건, 하루 5건)
 * 3. 문의번호 만들기 (날짜마다 0001부터: q20261108-0001)
 * 4. "문의" 탭에 한 줄 저장
 * 5. 멘토에게 메일 발송 (Reply-To = 중계계정+문의번호 plus 주소)
 * 6. 발송에 실패하면 방금 저장한 줄을 지우고 SEND_FAILED
 * 7. 학생에게 "보낸 문의 사본" 발송 (Step 5-1. 실패해도 문의는 성공으로 처리하고 로그만 남김)
 *
 * 2~7번은 잠금(LockService) 안에서 합니다. 두 요청이 동시에 와도 문의번호가 겹치지 않고,
 * 같은 학생이 버튼을 두 번 눌러도 횟수 제한이 정확히 걸립니다.
 */

/** 이메일 형식 검사 (간단한 형식만 확인: 글자@글자.글자) */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 필수 글자 입력을 검사합니다. 앞뒤 공백은 지우고, 1~max자인지 봅니다.
 * @param {*} value
 * @param {string} field 필드 이름 (오류 문구용)
 * @param {number} max
 * @return {string} 정리된 값
 */
function requireText_(value, field, max) {
  if (typeof value !== 'string') {
    throw new AppError('INVALID_INPUT', `${field}는 글자로 입력해 주세요.`);
  }
  const text = value.replace(/\r\n?/g, '\n').trim();
  if (text.length < 1 || text.length > max) {
    throw new AppError('INVALID_INPUT', `${field}는 1~${max}자로 입력해 주세요.`);
  }
  return text;
}

/**
 * submitInquiry 요청을 검사하고 정리된 값을 돌려줍니다.
 * @param {Object} req 요청 본문
 * @return {{mentorId: string, studentName: string, studentEmail: string, title: string, body: string}}
 */
function validateInquiryRequest_(req) {
  const mentorId = req.mentorId;
  if (typeof mentorId !== 'string' || mentorId.length < 1 || mentorId.length > LIMITS.MENTOR_ID_MAX) {
    throw new AppError('INVALID_INPUT', 'mentorId를 확인해 주세요.');
  }
  const studentName = requireText_(req.studentName, 'studentName', LIMITS.STUDENT_NAME_MAX);
  const title = requireText_(req.title, 'title', LIMITS.TITLE_MAX);
  const body = requireText_(req.body, 'body', LIMITS.BODY_MAX);

  const studentEmail = typeof req.studentEmail === 'string' ? req.studentEmail.trim() : '';
  if (studentEmail.length > LIMITS.EMAIL_MAX || !EMAIL_PATTERN.test(studentEmail)) {
    throw new AppError('INVALID_EMAIL');
  }
  if (req.privacyConsent !== true) {
    throw new AppError('PRIVACY_CONSENT_REQUIRED');
  }
  return {
    mentorId: mentorId,
    studentName: studentName,
    studentEmail: studentEmail,
    title: title,
    body: body,
  };
}

/**
 * 오늘 날짜의 다음 문의번호를 만듭니다. 예: q20261108-0001
 * @param {string[]} existingIds "문의" 탭의 문의번호들
 * @param {Date} now
 * @return {string}
 */
function nextInquiryId_(existingIds, now) {
  const prefix = `q${toDateKey_(now)}-`;
  let maxSeq = 0;
  existingIds.forEach(function (id) {
    if (typeof id !== 'string' || id.indexOf(prefix) !== 0) return;
    const seq = parseInt(id.slice(prefix.length), 10);
    if (seq > maxSeq) maxSeq = seq;
  });
  return prefix + String(maxSeq + 1).padStart(4, '0');
}

/**
 * 같은 학생 메일로 너무 자주 보냈는지 확인합니다. (시트를 읽지 않는 계산만 하는 함수: Test.gs에서 검사)
 * - 하루: 한국 시간 자정 기준. 오늘 이미 perDay건을 보냈으면 막습니다.
 * - 간격: 마지막으로 보낸 뒤 minutes분이 지나지 않았으면 막습니다.
 * - 메일 주소는 대소문자·앞뒤 공백을 무시하고 비교합니다.
 * - 0으로 설정한 제한은 쓰지 않습니다.
 * @param {{email: string, createdAt: string}[]} entries "문의" 탭의 학생메일·보낸일시
 * @param {string} email 이번에 보낸 학생 메일
 * @param {Date} now
 * @param {{minutes: number, perDay: number}} limits
 * @return {?AppError} 막아야 하면 TOO_MANY_REQUESTS 에러, 괜찮으면 null
 */
function findRateLimitError_(entries, email, now, limits) {
  const target = String(email).trim().toLowerCase();
  const todayKey = toDateKey_(now);
  let todayCount = 0;
  let lastSentAt = null;
  entries.forEach(function (entry) {
    if (String(entry.email).trim().toLowerCase() !== target) return;
    const sentAt = parseIsoDate_(entry.createdAt);
    if (!sentAt) return;
    if (toDateKey_(sentAt) === todayKey) todayCount++;
    if (!lastSentAt || sentAt > lastSentAt) lastSentAt = sentAt;
  });
  if (limits.perDay > 0 && todayCount >= limits.perDay) {
    return new AppError(
      'TOO_MANY_REQUESTS',
      `같은 메일 주소로는 하루에 ${limits.perDay}건까지 보낼 수 있어요. 내일 다시 시도해 주세요.`,
      `하루 제한: 오늘 ${todayCount}건`
    );
  }
  if (limits.minutes > 0 && lastSentAt && now - lastSentAt < limits.minutes * 60 * 1000) {
    return new AppError(
      'TOO_MANY_REQUESTS',
      `같은 메일 주소로는 ${limits.minutes}분에 한 번만 보낼 수 있어요. 잠시 후 다시 시도해 주세요.`,
      `간격 제한: 마지막 문의 ${toIsoKst_(lastSentAt)}`
    );
  }
  return null;
}

/**
 * 학생에게 "보낸 문의 사본"을 보냅니다. 실패해도 오류를 던지지 않고 로그만 남깁니다.
 * (멘토에게는 이미 보냈으므로 문의 자체는 성공입니다)
 * - Reply-To를 따로 정하지 않습니다. 학생이 사본에 답장하면 중계 메일함에 들어가고, 멘토에게 가지 않습니다.
 */
function sendStudentCopy_(settings, mentor, input, now, inquiryId) {
  try {
    const copy = buildStudentCopyMail_(settings, mentor.name, {
      studentName: input.studentName,
      title: input.title,
      body: input.body,
      sentAt: now,
    });
    Mailer.send({
      to: input.studentEmail,
      fromName: requireSetting_(settings, SETTING_KEYS.SENDER_NAME),
      subject: copy.subject,
      textBody: copy.textBody,
      htmlBody: copy.htmlBody,
    });
  } catch (err) {
    console.warn(`학생 사본 발송 실패(무시함): ${inquiryId}: ${err && err.detail ? err.detail : err}`);
  }
}

/**
 * action: submitInquiry
 * @param {Object} req 요청 본문
 * @return {{inquiryId: string, createdAt: string}}
 */
function submitInquiryAction_(req) {
  const input = validateInquiryRequest_(req);
  const mentor = findActiveMentor_(input.mentorId);
  const settings = getSettings_();
  // 메일에 필요한 설정이 빠져 있으면 저장하기 전에 멈춥니다.
  [
    SETTING_KEYS.SERVICE_NAME,
    SETTING_KEYS.SENDER_NAME,
    SETTING_KEYS.MENTOR_SUBJECT_PREFIX,
    SETTING_KEYS.MENTOR_FOOTER,
  ].forEach(function (key) { requireSetting_(settings, key); });

  // 멘토 메일 1통 + 학생 사본 1통
  if (Mailer.remainingDailyQuota() < 2) {
    throw new AppError('SEND_FAILED', null, '오늘 Gmail 발송 한도가 부족합니다 (2통 필요).');
  }
  const limits = {
    minutes: getNumberSetting_(settings, SETTING_KEYS.RATE_LIMIT_MINUTES),
    perDay: getNumberSetting_(settings, SETTING_KEYS.RATE_LIMIT_PER_DAY),
  };

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) {
    throw new AppError('INTERNAL_ERROR', null, '잠금을 얻지 못했습니다 (동시 요청이 많음).');
  }
  try {
    const table = readTable_(SHEET_NAMES.INQUIRIES);
    const col = columnIndexes_(table.headers, INQUIRY_HEADERS, SHEET_NAMES.INQUIRIES);
    const now = new Date();

    // 같은 학생 메일로 너무 자주 보냈는지 (저장하기 전에 확인)
    const rateLimitError = findRateLimitError_(
      table.displayValues.map(function (r) {
        return { email: r[col.STUDENT_EMAIL], createdAt: r[col.CREATED_AT] };
      }),
      input.studentEmail,
      now,
      limits
    );
    if (rateLimitError) throw rateLimitError;

    const inquiryId = nextInquiryId_(
      table.displayValues.map(function (row) { return row[col.ID]; }),
      now
    );
    const createdAt = toIsoKst_(now);

    // 헤더 위치에 맞춰 한 줄을 만듭니다. (열 순서가 바뀌어도 동작)
    const row = new Array(table.headers.length).fill('');
    row[col.ID] = inquiryId;
    row[col.CREATED_AT] = createdAt;
    row[col.MENTOR_ID] = mentor.mentorId;
    row[col.STUDENT_NAME] = input.studentName;
    row[col.STUDENT_EMAIL] = input.studentEmail;
    row[col.TITLE] = input.title;
    row[col.BODY] = input.body;
    row[col.REPLIED] = false;
    row[col.REPLIED_AT] = '';
    row[col.REMINDED_AT] = '';

    // 모든 칸을 '일반 텍스트'로 저장합니다.
    // (학생이 "=..."로 시작하는 글을 써도 수식으로 실행되지 않고, 날짜·ID가 멋대로 바뀌지 않게)
    // 답장여부 칸만 true/false 값으로 둡니다.
    const sheet = table.sheet;
    const rowNumber = sheet.getLastRow() + 1;
    const range = sheet.getRange(rowNumber, 1, 1, row.length);
    range.setNumberFormat('@');
    sheet.getRange(rowNumber, col.REPLIED + 1).setNumberFormat('General');
    range.setValues([row]);
    SpreadsheetApp.flush();

    const inquiry = {
      inquiryId: inquiryId,
      createdAt: createdAt,
      studentName: input.studentName,
      title: input.title,
      body: input.body,
    };
    try {
      const message = buildMentorInquiryMail_(settings, mentor, inquiry);
      Mailer.send({
        to: mentor.email,
        replyTo: toPlusAddress_(getRelayAddress_(), inquiryId),
        fromName: requireSetting_(settings, SETTING_KEYS.SENDER_NAME),
        subject: message.subject,
        textBody: message.textBody,
        htmlBody: message.htmlBody,
      });
    } catch (sendError) {
      // 발송 실패: 시트에는 실제로 보낸 문의만 남깁니다.
      sheet.deleteRow(rowNumber);
      SpreadsheetApp.flush();
      if (sendError instanceof AppError && sendError.code === 'INTERNAL_ERROR') throw sendError;
      throw new AppError('SEND_FAILED', null, String(sendError && sendError.message));
    }

    console.log(`문의 저장·발송 완료: ${inquiryId} → ${mentor.mentorId}`);
    sendStudentCopy_(settings, mentor, input, now, inquiryId);
    return { inquiryId: inquiryId, createdAt: createdAt };
  } finally {
    lock.releaseLock();
  }
}
