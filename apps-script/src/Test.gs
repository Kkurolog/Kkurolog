/**
 * Test.gs — 편집기에서 직접 실행하는 테스트
 *
 * 사용법: 편집기 위쪽 함수 선택 칸에서 함수를 고르고 ▷ 실행 → 아래 "실행 로그"를 봅니다.
 * - 반드시 중계 계정으로 로그인한 상태에서 실행합니다.
 * - 웹앱 배포 없이도 동작을 확인할 수 있습니다. (doPost 안쪽 함수를 직접 부름)
 * - 테스트용 학생 메일은 코드에 적지 않고 Script Properties의 TEST_STUDENT_EMAIL에서 읽습니다.
 * - (Step 5-1) 새 설정 키를 쓰는 테스트는 코드를 붙여넣은 뒤 시트 메뉴 ① 설치·점검 (setup)을 한 번 실행한 다음 돌립니다.
 *
 * 메일을 보내지 않는 테스트: testGetMentors, testValidationErrors, testReplyParser,
 *                          testRateLimit, testReminderSchedule, testMailTemplates
 * 메일을 보내는 테스트:     testSubmitInquiry (2통: 멘토 + 학생 사본), testSendReminder (1통)
 */

/**
 * 테스트용으로 Script Properties 값을 읽습니다.
 * 값이 없으면 "무엇이 빠졌는지"를 실행 로그에 그대로 보여줍니다.
 * (웹앱 응답용 getSecret_은 보안상 원인을 숨기기 때문에, 테스트에서는 이 함수를 씁니다)
 * @param {string} key PROPERTY_KEYS 중 하나
 * @return {string}
 */
function testProperty_(key) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) {
    throw new Error(
      `Script Properties에 "${key}" 값이 없습니다. ` +
        '⚙ 프로젝트 설정 → 스크립트 속성에서 속성 이름(대소문자·공백 포함)과 값을 확인하세요. ' +
        (key === PROPERTY_KEYS.TEST_STUDENT_EMAIL
          ? '이 값은 직접 추가해야 합니다 (README 6-2의 5번).'
          : '시트 메뉴에서 ① 설치·점검 (setup)을 실행하면 만들어집니다.')
    );
  }
  return value;
}

/** 1) 활성 멘토 목록 확인 (메일 안 보냄) */
function testGetMentors() {
  const res = handleRequest_(
    JSON.stringify({ apiKey: testProperty_(PROPERTY_KEYS.API_KEY), action: 'getMentors' })
  );
  console.log(JSON.stringify(res, null, 2));
  const leaked = JSON.stringify(res).indexOf('@') >= 0;
  console.log(leaked ? '❌ 응답에 이메일이 들어 있습니다!' : '✅ 응답에 이메일 없음');
}

/** 2) 검증 오류가 제대로 나는지 확인 (메일 안 보냄) */
function testValidationErrors() {
  const apiKey = testProperty_(PROPERTY_KEYS.API_KEY);
  const mentors = readActiveMentors_();
  if (mentors.length === 0) throw new Error('"멘토" 탭에 활성 멘토가 없습니다.');
  const valid = {
    apiKey: apiKey,
    action: 'submitInquiry',
    mentorId: mentors[0].mentorId,
    studentName: '테스트학생',
    studentEmail: 'student@example.com',
    title: '테스트 제목',
    body: '테스트 내용',
    privacyConsent: true,
  };
  const cases = [
    ['apiKey 틀림', Object.assign({}, valid, { apiKey: 'WRONG_KEY' }), 'UNAUTHORIZED'],
    ['없는 action', Object.assign({}, valid, { action: 'noSuchAction' }), 'INVALID_ACTION'],
    ['이메일 형식 오류', Object.assign({}, valid, { studentEmail: 'not-an-email' }), 'INVALID_EMAIL'],
    ['이름 비어 있음', Object.assign({}, valid, { studentName: '  ' }), 'INVALID_INPUT'],
    ['이름 31자', Object.assign({}, valid, { studentName: '가'.repeat(31) }), 'INVALID_INPUT'],
    ['제목 101자', Object.assign({}, valid, { title: '가'.repeat(101) }), 'INVALID_INPUT'],
    ['내용 2001자', Object.assign({}, valid, { body: '가'.repeat(2001) }), 'INVALID_INPUT'],
    ['동의 false', Object.assign({}, valid, { privacyConsent: false }), 'PRIVACY_CONSENT_REQUIRED'],
    ['동의 "true"(글자)', Object.assign({}, valid, { privacyConsent: 'true' }), 'PRIVACY_CONSENT_REQUIRED'],
    ['없는 멘토', Object.assign({}, valid, { mentorId: 'no-such-mentor' }), 'MENTOR_NOT_FOUND'],
  ];
  let failed = 0;
  cases.forEach(function (c) {
    const res = handleRequest_(JSON.stringify(c[1]));
    const code = res.ok ? 'OK' : res.error.code;
    const pass = code === c[2];
    if (!pass) failed++;
    console.log(`${pass ? '✅' : '❌'} ${c[0]}: 기대 ${c[2]} / 실제 ${code}`);
  });
  console.log(failed === 0 ? '모두 통과했습니다.' : `${failed}개 실패했습니다.`);
}

/**
 * 3) 실제로 문의 1건 저장 + 첫 번째 활성 멘토에게 메일 발송 + 학생 사본 (메일 2통 사용)
 * - 같은 TEST_STUDENT_EMAIL로 10분 안에 4번째 실행하면 TOO_MANY_REQUESTS가 나옵니다. (정상, 하루 5건 제한도 있음)
 *   테스트 기간에는 설정 탭 rateLimitMinutes·rateLimitPerDay를 0으로 두고, 운영 전에 10·5로 되돌립니다.
 */
function testSubmitInquiry() {
  const studentEmail = testProperty_(PROPERTY_KEYS.TEST_STUDENT_EMAIL);
  const mentor = readActiveMentors_()[0];
  if (!mentor) throw new Error('"멘토" 탭에 활성 멘토가 없습니다.');
  const res = handleRequest_(
    JSON.stringify({
      apiKey: testProperty_(PROPERTY_KEYS.API_KEY),
      action: 'submitInquiry',
      mentorId: mentor.mentorId,
      studentName: '테스트학생',
      studentEmail: studentEmail,
      title: '테스트 문의입니다',
      body: '꾸로록 메일 자동화 테스트 메일입니다.\n답장 버튼으로 회신해 주세요.',
      privacyConsent: true,
    })
  );
  console.log(JSON.stringify(res, null, 2));
  console.log(
    res.ok
      ? `✅ "문의" 탭에 ${res.data.inquiryId} 줄이 생겼는지, ${mentor.mentorId} 멘토 메일함에 메일이 왔는지, ` +
          'TEST_STUDENT_EMAIL 메일함에 "보낸 문의 사본"이 왔는지 확인하세요.'
      : '❌ 실패했습니다. 위 error와 로그를 확인하세요.'
  );
}

/**
 * 4) 답장 본문 정리·문의번호 찾기 확인 (메일 안 보냄, 메일함 안 읽음)
 * 여러 메일 앱의 답장 모양을 흉내 낸 글로, 학생에게 갈 본문만 남는지 봅니다.
 */
function testReplyParser() {
  const settings = getSettings_();
  const relay = getRelayAddress_();
  const footer = requireSetting_(settings, SETTING_KEYS.MENTOR_FOOTER);
  const intro = buildMentorIntroLine_(requireSetting_(settings, SETTING_KEYS.SERVICE_NAME));
  const id = 'q20261108-0001';
  const idLine = buildInquiryIdLine_(id);
  const original = ['안녕하세요, 테스트멘토님.', intro, '', '- 학생 이름: 테스트학생', '', '학생 문의 내용', '', footer, '', idLine];
  const quoted = original.map(function (l) { return '> ' + l; });
  const answer = '좋은 질문이에요.\n제 경험을 말씀드리면 이래요.';

  const parserCases = [
    ['Gmail 한국어', [answer, '', '2026년 11월 8일 (일) 오후 2:03, 꾸로록 <relay>님이 작성:'].concat(quoted)],
    ['Gmail 한국어(두 줄)', [answer, '', '2026년 11월 8일 (일) 오후 2:03, 꾸로록 <relay>님이', '작성:'].concat(quoted)],
    ['Gmail 영어(두 줄)', [answer, '', 'On Sun, Nov 8, 2026 at 2:03 PM 꾸로록 <relay>', 'wrote:', ''].concat(quoted)],
    ['네이버/아웃룩', [answer, '', '-----Original Message-----', 'From: 꾸로록 <relay>', 'Sent: 2026-11-08'].concat(original)],
    ['인용 표시 없음', [answer, ''].concat(original)],
    ['> 인용만', [answer, ''].concat(quoted)],
    ['안내 문구·번호만 남음', [answer, '', footer, idLine]],
  ];
  // (Step 5-1) 리마인드 메일에 답장한 경우: 맨 위 리마인드 문구도 지워져야 함
  const reminderIntro = String(settings[SETTING_KEYS.MENTOR_REMINDER_INTRO] || '').trim();
  if (reminderIntro) {
    parserCases.push(['리마인드 메일, 인용 표시 없음', [answer, '', reminderIntro, ''].concat(original)]);
    parserCases.push(['리마인드 메일, Gmail 한국어', [answer, '', '2026년 11월 18일 (수) 오전 10:03, 꾸로록 <relay>님이 작성:', '> ' + reminderIntro, '>'].concat(quoted)]);
  } else {
    console.log('⚠ 설정 탭에 mentorReminderIntro가 없어 리마인드 답장 검사는 건너뜁니다. setup을 먼저 실행하세요.');
  }
  let failed = 0;
  parserCases.forEach(function (c) {
    const out = extractReplyText_(c[1].join('\n'), settings);
    const pass = out === answer;
    if (!pass) failed++;
    console.log(`${pass ? '✅' : '❌'} 본문 정리 - ${c[0]}${pass ? '' : '\n결과:\n' + out}`);
  });
  const emptyOut = extractReplyText_(['2026년 11월 8일 (일) 오후 2:03, 꾸로록 <relay>님이 작성:'].concat(quoted).join('\n'), settings);
  console.log(`${emptyOut === '' ? '✅' : '❌'} 본문 정리 - 멘토가 아무것도 안 씀 → 빈 본문`);
  if (emptyOut !== '') failed++;

  const plus = toPlusAddress_(relay, id);
  const idCases = [
    ['plus 주소(1순위)', { recipients: [`꾸로록 <${plus}>`], plainBody: '' }, id],
    ['plus 주소 대문자', { recipients: [plus.toUpperCase()], plainBody: '' }, id],
    ['본문 번호(2순위)', { recipients: [relay], plainBody: answer + '\n> ' + idLine }, id],
    ['plus가 본문보다 우선', { recipients: [toPlusAddress_(relay, 'q20261108-0002')], plainBody: '> ' + idLine }, 'q20261108-0002'],
    ['번호 없음', { recipients: [relay], plainBody: answer }, null],
  ];
  idCases.forEach(function (c) {
    const got = findInquiryIdInMessage_(c[1], relay);
    const pass = got === c[2];
    if (!pass) failed++;
    console.log(`${pass ? '✅' : '❌'} 문의번호 찾기 - ${c[0]}: 기대 ${c[2]} / 실제 ${got}`);
  });
  console.log(failed === 0 ? '모두 통과했습니다.' : `${failed}개 실패했습니다.`);
}

/** 테스트 결과 한 줄을 찍고, 실패면 1을 돌려줍니다. */
function testCheck_(name, pass, detail) {
  console.log(`${pass ? '✅' : '❌'} ${name}${pass || !detail ? '' : ' / ' + detail}`);
  return pass ? 0 : 1;
}

/** 5) (Step 5-1) 같은 학생 메일 횟수 제한 계산 확인 (메일 안 보냄, 시트 안 읽음) */
function testRateLimit() {
  const now = new Date();
  const minutesAgo = function (m) { return toIsoKst_(new Date(now.getTime() - m * 60 * 1000)); };
  const email = 'student@example.com';
  const limits = { minutes: 10, perWindow: 3, perDay: 5 };
  const codeOf = function (entries, lim) {
    const err = findRateLimitError_(entries, email, now, lim || limits);
    return err ? `${err.code}:${err.message.indexOf('하루') >= 0 ? '하루' : '10분'}` : 'OK';
  };
  const same = function (n, createdAt, address) {
    const list = [];
    for (let i = 0; i < n; i++) list.push({ email: address || email, createdAt: createdAt });
    return list;
  };
  const noDay = { minutes: 10, perWindow: 3, perDay: 0 };
  const cases = [
    ['처음 보냄', [], null, 'OK'],
    ['10분 안에 2건 → 3번째 통과', same(2, minutesAgo(5)), null, 'OK'],
    ['10분 안에 3건 → 4번째 막힘', same(3, minutesAgo(5)), null, 'TOO_MANY_REQUESTS:10분'],
    ['3건이 모두 11분 전 → 통과', same(3, minutesAgo(11)), noDay, 'OK'],
    ['11분 전 2건 + 5분 전 1건 → 통과', same(2, minutesAgo(11)).concat(same(1, minutesAgo(5))), noDay, 'OK'],
    ['대소문자·공백만 다른 주소 3건 → 막힘', same(3, minutesAgo(5), '  Student@Example.COM '), null, 'TOO_MANY_REQUESTS:10분'],
    ['다른 주소 3건 → 통과', same(3, minutesAgo(1), 'other@example.com'), null, 'OK'],
    ['오늘 4건 (10분 제한 0) → 통과', same(4, toIsoKst_(now)), { minutes: 0, perWindow: 3, perDay: 5 }, 'OK'],
    ['오늘 5건 (10분 제한 0) → 막힘', same(5, toIsoKst_(now)), { minutes: 0, perWindow: 3, perDay: 5 }, 'TOO_MANY_REQUESTS:하루'],
    ['어제 5건 → 통과', same(5, toIsoKst_(new Date(now.getTime() - 24 * 60 * 60 * 1000))), null, 'OK'],
    ['제한 모두 0 → 통과', same(9, toIsoKst_(now)), { minutes: 0, perWindow: 0, perDay: 0 }, 'OK'],
    ['rateLimitPerWindow만 0 → 10분 제한 없음', same(4, minutesAgo(1)), { minutes: 10, perWindow: 0, perDay: 0 }, 'OK'],
    ['보낸일시를 못 읽는 줄은 셈하지 않음', same(5, '날짜아님'), null, 'OK'],
  ];
  let failed = 0;
  cases.forEach(function (c) {
    const got = codeOf(c[1], c[2]);
    failed += testCheck_(`횟수 제한 - ${c[0]}`, got === c[3], `기대 ${c[3]} / 실제 ${got}`);
  });
  const msgErr = findRateLimitError_(same(3, minutesAgo(1)), email, now, noDay);
  failed += testCheck_(
    '10분 제한 문구',
    !!msgErr && msgErr.message === '현재 메일 발송량이 많아 전송이 잠시 제한되었어요. 10분 후 다시 시도해 주세요.',
    msgErr && msgErr.message
  );
  console.log(failed === 0 ? '모두 통과했습니다.' : `${failed}개 실패했습니다.`);
}

/** 6) (Step 5-1) 리마인드 보낼 날짜 계산 확인 (메일 안 보냄, 시트 안 읽음) */
function testReminderSchedule() {
  const created = '2026-11-01T23:59:00+09:00';
  const at = function (iso) { return new Date(iso); };
  const base = { replied: false, remindedAt: '', createdAt: created };
  const cases = [
    ['9일째(11/10) → 아직', base, at('2026-11-10T23:00:00+09:00'), 10, false],
    ['10일째(11/11 00:01) → 보냄', base, at('2026-11-11T00:01:00+09:00'), 10, true],
    ['12일째 → 보냄 (그동안 못 보낸 경우)', base, at('2026-11-13T10:00:00+09:00'), 10, true],
    ['답장 받음 → 안 보냄', Object.assign({}, base, { replied: true }), at('2026-11-11T10:00:00+09:00'), 10, false],
    ['이미 리마인드 보냄 → 안 보냄', Object.assign({}, base, { remindedAt: '2026-11-11T10:02:00+09:00' }), at('2026-11-12T10:00:00+09:00'), 10, false],
    ['reminderDays 0 → 안 보냄', base, at('2026-12-01T10:00:00+09:00'), 0, false],
    ['보낸일시를 못 읽음 → 안 보냄', Object.assign({}, base, { createdAt: '날짜아님' }), at('2026-12-01T10:00:00+09:00'), 10, false],
  ];
  let failed = 0;
  cases.forEach(function (c) {
    const got = isReminderDue_(c[1], c[2], c[3]);
    failed += testCheck_(`리마인드 날짜 - ${c[0]}`, got === c[4], `기대 ${c[4]} / 실제 ${got}`);
  });
  console.log(failed === 0 ? '모두 통과했습니다.' : `${failed}개 실패했습니다.`);
}

/** 7) (Step 5-1) 리마인드 메일·학생 사본 메일 내용 확인 (메일 안 보냄) */
function testMailTemplates() {
  const settings = getSettings_();
  const mentor = { name: '테스트멘토', email: 'mentor@example.com' };
  const inquiry = {
    inquiryId: 'q20261108-0001',
    studentName: '테스트학생',
    title: '테스트 제목',
    body: '학생 문의 내용',
    sentAt: new Date(),
  };
  const reminderPrefix = requireSetting_(settings, SETTING_KEYS.MENTOR_REMINDER_SUBJECT_PREFIX);
  const reminderIntro = requireSetting_(settings, SETTING_KEYS.MENTOR_REMINDER_INTRO);
  const reminder = buildMentorInquiryMail_(settings, mentor, inquiry, true);
  const normal = buildMentorInquiryMail_(settings, mentor, inquiry);
  const copy = buildStudentCopyMail_(settings, mentor.name, inquiry);
  const idLine = buildInquiryIdLine_(inquiry.inquiryId);

  let failed = 0;
  failed += testCheck_('리마인드 제목 = 리마인드 말머리 + 제목', reminder.subject === `${reminderPrefix} ${inquiry.title}`, reminder.subject);
  failed += testCheck_('리마인드 본문 맨 위 = 리마인드 문구', reminder.textBody.split('\n')[0] === reminderIntro);
  failed += testCheck_('리마인드 본문에 문의번호 줄 있음 (답장 매칭용)', reminder.textBody.indexOf(idLine) >= 0);
  failed += testCheck_('일반 문의 메일에는 리마인드 문구 없음', normal.textBody.indexOf(reminderIntro) < 0 && normal.htmlBody.indexOf(escapeHtml_(reminderIntro)) < 0);
  failed += testCheck_('학생 사본에 멘토 이름·내용 있음', copy.textBody.indexOf(mentor.name) >= 0 && copy.textBody.indexOf(inquiry.body) >= 0);
  failed += testCheck_('학생 사본에 문의번호 없음', (copy.textBody + copy.htmlBody).indexOf(INQUIRY_ID_LINE_LABEL) < 0);
  failed += testCheck_('학생 사본에 멘토 이메일 없음', (copy.textBody + copy.htmlBody).indexOf('@') < 0);
  console.log(failed === 0 ? '모두 통과했습니다.' : `${failed}개 실패했습니다.`);
}

/**
 * 8) (Step 5-1) 리마인드 메일 실제로 1통 보내기 (열흘을 기다리지 않고 확인용. 메일 1통 사용)
 * - "문의" 탭에서 가장 최근의, 답장 전·리마인드 전·활성 멘토 문의 1건에 리마인드를 보내고 리마인드일시를 기록합니다.
 * - 그 문의는 리마인드를 이미 보낸 것으로 기록되어, 나중에 자동 리마인드가 다시 나가지 않습니다.
 */
function testSendReminder() {
  const settings = getSettings_();
  const data = readInquiryRows_();
  const mentorsById = {};
  readAllMentors_().forEach(function (m) { mentorsById[m.mentorId] = m; });
  const target = data.rows.slice().reverse().find(function (r) {
    const m = mentorsById[r.mentorId];
    return !r.replied && !String(r.remindedAt).trim() && m && m.active;
  });
  if (!target) {
    throw new Error('리마인드를 보낼 문의가 없습니다. testSubmitInquiry로 문의를 먼저 1건 만드세요.');
  }
  sendReminderForRow_(data.sheet, data.col, target, mentorsById[target.mentorId], settings, new Date());
  console.log(
    `✅ ${target.inquiryId} 리마인드를 ${target.mentorId} 멘토에게 보냈습니다. ` +
      '멘토 메일함에서 제목·맨 위 문구를 확인하고, "답장"하면 학생에게 전달되는지 확인하세요.'
  );
}
