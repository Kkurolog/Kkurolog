/**
 * Admin.gs — 관리자 API (Step 5-2): getInquiries, getInquiry
 *
 * 이 파일이 하는 일
 * - "문의" 탭의 기록을 관리자 페이지가 보기 좋은 모양으로 돌려줍니다. (시트를 읽기만 하고, 고치지 않습니다)
 * - adminToken 검사는 Main.gs(handleRequest_)가 먼저 합니다. 여기 함수들은 검사를 통과한 요청만 받습니다.
 * - 응답에는 학생 이름·메일(개인정보)이 들어 있습니다. 팀 백엔드는 관리자 로그인에 성공한 경우에만 호출하고,
 *   이 응답을 학생 화면에 보내지 않습니다. 멘토 이메일은 넣지 않습니다.
 *
 * 문의 한 건의 모양 (관리자 화면 8개 항목 + remindedAt)
 *   inquiryId, createdAt(보낸 일시), mentorId, mentorName(멘토 이름), studentName(학생 이름),
 *   studentEmail(학생 메일), title(메일 제목), body(메일 내용), replied(멘토 답변 여부),
 *   repliedAt(멘토 답변 일시, 첫 답장 시각. 없으면 null), remindedAt(리마인드 보낸 시각. 없으면 null)
 */

/** 페이지 규칙 (API 명세 v0.6) */
const ADMIN_PAGE = Object.freeze({
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
});

/**
 * 1 이상의 정수인지 확인합니다. 없으면(생략) 기본값.
 * @param {*} value 요청 값
 * @param {number} fallback 생략했을 때 값
 * @param {number} max 최대값 (넘으면 INVALID_INPUT)
 * @param {string} field 오류 문구용 이름
 * @return {number}
 */
function readPositiveInt_(value, fallback, max, field) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > max) {
    throw new AppError('INVALID_INPUT', `${field}는 1~${max} 사이의 정수로 보내 주세요.`);
  }
  return value;
}

/**
 * getInquiries 요청을 검사하고 정리된 값을 돌려줍니다. (시트를 읽지 않는 함수: Test.gs에서 검사)
 * @param {Object} req 요청 본문
 * @return {{replied: ?boolean, page: number, pageSize: number}} replied가 null이면 전체
 */
function validateListRequest_(req) {
  const filter = req.filter;
  let replied = null;
  if (filter !== undefined && filter !== null) {
    if (typeof filter !== 'object' || Array.isArray(filter)) {
      throw new AppError('INVALID_INPUT', 'filter는 객체로 보내 주세요. 예: {"replied": false}');
    }
    if (filter.replied !== undefined && filter.replied !== null) {
      if (typeof filter.replied !== 'boolean') {
        throw new AppError('INVALID_INPUT', 'filter.replied는 true 또는 false로 보내 주세요.');
      }
      replied = filter.replied;
    }
  }
  return {
    replied: replied,
    page: readPositiveInt_(req.page, ADMIN_PAGE.DEFAULT_PAGE, Number.MAX_SAFE_INTEGER, 'page'),
    pageSize: readPositiveInt_(req.pageSize, ADMIN_PAGE.DEFAULT_PAGE_SIZE, ADMIN_PAGE.MAX_PAGE_SIZE, 'pageSize'),
  };
}

/**
 * 문의 목록을 최신순으로 정렬하고, 필터·페이지를 적용합니다. (시트를 읽지 않는 함수: Test.gs에서 검사)
 * - 최신순: 보낸 일시가 늦은 것부터. 같으면 문의번호가 큰 것부터. 보낸 일시를 못 읽는 줄은 맨 뒤.
 * @param {Object[]} items readAdminInquiries_()의 결과
 * @param {{replied: ?boolean, page: number, pageSize: number}} query validateListRequest_()의 결과
 * @return {{total: number, items: Object[]}}
 */
function buildInquiryPage_(items, query) {
  const filtered = items.filter(function (item) {
    return query.replied === null || item.replied === query.replied;
  });
  const time = function (item) {
    const date = parseIsoDate_(item.createdAt);
    return date ? date.getTime() : -Infinity;
  };
  filtered.sort(function (a, b) {
    const diff = time(b) - time(a);
    if (diff !== 0 && !isNaN(diff)) return diff;
    return String(b.inquiryId).localeCompare(String(a.inquiryId));
  });
  const start = (query.page - 1) * query.pageSize;
  return { total: filtered.length, items: filtered.slice(start, start + query.pageSize) };
}

/**
 * "문의" 탭 전체를 관리자 응답 모양으로 읽습니다. (멘토 이름은 "멘토" 탭에서 mentorId로 찾음)
 * @return {Object[]}
 */
function readAdminInquiries_() {
  const table = readTable_(SHEET_NAMES.INQUIRIES);
  const col = columnIndexes_(table.headers, INQUIRY_HEADERS, SHEET_NAMES.INQUIRIES);
  const mentorNames = {};
  readAllMentors_().forEach(function (m) { mentorNames[m.mentorId] = m.name; });
  const orNull = function (text) {
    const value = String(text === undefined || text === null ? '' : text).trim();
    return value === '' ? null : value;
  };

  const items = [];
  table.displayValues.forEach(function (row, i) {
    if (!String(row[col.ID]).trim()) return;
    items.push({
      inquiryId: row[col.ID],
      createdAt: row[col.CREATED_AT],
      mentorId: row[col.MENTOR_ID],
      mentorName: mentorNames[row[col.MENTOR_ID]] || null, // 멘토 탭에서 지워졌으면 null
      studentName: row[col.STUDENT_NAME],
      studentEmail: row[col.STUDENT_EMAIL],
      title: row[col.TITLE],
      body: row[col.BODY],
      replied: isTruthyCell_(table.values[i][col.REPLIED]),
      repliedAt: orNull(row[col.REPLIED_AT]),
      remindedAt: orNull(row[col.REMINDED_AT]),
    });
  });
  return items;
}

/**
 * action: getInquiries (관리자)
 * @param {Object} req 요청 본문
 * @return {{total: number, items: Object[]}}
 */
function getInquiriesAction_(req) {
  const query = validateListRequest_(req);
  return buildInquiryPage_(readAdminInquiries_(), query);
}

/**
 * action: getInquiry (관리자) — 문의번호로 한 건
 * @param {Object} req 요청 본문
 * @return {{item: Object}}
 */
function getInquiryAction_(req) {
  const pattern = new RegExp(`^${INQUIRY_ID_PATTERN}$`, 'i');
  const inquiryId = typeof req.inquiryId === 'string' ? req.inquiryId.trim() : '';
  if (!pattern.test(inquiryId)) {
    throw new AppError('INVALID_INPUT', 'inquiryId 형식을 확인해 주세요. 예: q20261108-0001');
  }
  const target = inquiryId.toLowerCase();
  const item = readAdminInquiries_().find(function (it) {
    return String(it.inquiryId).toLowerCase() === target;
  });
  if (!item) throw new AppError('INQUIRY_NOT_FOUND');
  return { item: item };
}
