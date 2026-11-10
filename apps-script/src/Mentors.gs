/**
 * Mentors.gs — 멘토 목록 (getMentors)
 *
 * 이 파일이 하는 일
 * - "멘토" 탭에서 활성 멘토만 골라냅니다.
 * - 밖으로 나가는 응답에는 mentorId와 이름만 담습니다. (이메일은 절대 포함하지 않음)
 * - mentorId는 형식을 따지지 않는 그냥 문자열입니다. 화면에 보이는 글자 그대로 비교합니다.
 */

/**
 * 시트의 활성 멘토 목록 (내부용 — 이메일 포함, 응답에 그대로 내보내지 않습니다)
 * @return {{mentorId: string, name: string, email: string}[]}
 */
function readActiveMentors_() {
  const table = readTable_(SHEET_NAMES.MENTORS);
  const col = columnIndexes_(table.headers, MENTOR_HEADERS, SHEET_NAMES.MENTORS);
  const mentors = [];
  table.values.forEach(function (row, i) {
    const display = table.displayValues[i];
    const mentor = {
      mentorId: display[col.ID],
      name: String(display[col.NAME]).trim(),
      email: String(display[col.EMAIL]).trim(),
    };
    if (!mentor.mentorId || !mentor.email || !isTruthyCell_(row[col.ACTIVE])) return;
    mentors.push(mentor);
  });
  return mentors;
}

/**
 * 활성 멘토 한 명을 mentorId로 찾습니다. 없거나 비활성이면 MENTOR_NOT_FOUND.
 * @param {string} mentorId
 * @return {{mentorId: string, name: string, email: string}}
 */
function findActiveMentor_(mentorId) {
  const mentor = readActiveMentors_().find(function (m) { return m.mentorId === mentorId; });
  if (!mentor) throw new AppError('MENTOR_NOT_FOUND');
  return mentor;
}

/**
 * action: getMentors
 * @return {{mentors: {mentorId: string, name: string}[]}}
 */
function getMentorsAction_() {
  const mentors = readActiveMentors_().map(function (m) {
    return { mentorId: m.mentorId, name: m.name }; // 이메일 제외
  });
  return { mentors: mentors };
}
