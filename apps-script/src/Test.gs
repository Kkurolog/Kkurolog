/**
 * Test.gs — 편집기에서 직접 실행하는 테스트
 *
 * 사용법: 편집기 위쪽 함수 선택 칸에서 함수를 고르고 ▷ 실행 → 아래 "실행 로그"를 봅니다.
 * - 반드시 중계 계정으로 로그인한 상태에서 실행합니다.
 * - 웹앱 배포 없이도 동작을 확인할 수 있습니다. (doPost 안쪽 함수를 직접 부름)
 * - 테스트용 학생 메일은 코드에 적지 않고 Script Properties의 TEST_STUDENT_EMAIL에서 읽습니다.
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
          : '편집기에서 initSecrets()를 실행하면 만들어집니다.')
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

/** 3) 실제로 문의 1건 저장 + 첫 번째 활성 멘토에게 메일 발송 (메일 1통 사용) */
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
      ? `✅ "문의" 탭에 ${res.data.inquiryId} 줄이 생겼는지, ${mentor.mentorId} 멘토 메일함에 메일이 왔는지 확인하세요.`
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
