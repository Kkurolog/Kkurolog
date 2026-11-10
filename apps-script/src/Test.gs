/**
 * Test.gs — 편집기에서 직접 실행하는 테스트
 *
 * 사용법: 편집기 위쪽 함수 선택 칸에서 함수를 고르고 ▷ 실행 → 아래 "실행 로그"를 봅니다.
 * - 반드시 중계 계정으로 로그인한 상태에서 실행합니다.
 * - 웹앱 배포 없이도 동작을 확인할 수 있습니다. (doPost 안쪽 함수를 직접 부름)
 * - 테스트용 학생 메일은 코드에 적지 않고 Script Properties의 TEST_STUDENT_EMAIL에서 읽습니다.
 */

/** 1) 활성 멘토 목록 확인 (메일 안 보냄) */
function testGetMentors() {
  const res = handleRequest_(
    JSON.stringify({ apiKey: getSecret_(PROPERTY_KEYS.API_KEY), action: 'getMentors' })
  );
  console.log(JSON.stringify(res, null, 2));
  const leaked = JSON.stringify(res).indexOf('@') >= 0;
  console.log(leaked ? '❌ 응답에 이메일이 들어 있습니다!' : '✅ 응답에 이메일 없음');
}

/** 2) 검증 오류가 제대로 나는지 확인 (메일 안 보냄) */
function testValidationErrors() {
  const apiKey = getSecret_(PROPERTY_KEYS.API_KEY);
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
  const studentEmail = getSecret_(PROPERTY_KEYS.TEST_STUDENT_EMAIL);
  const mentor = readActiveMentors_()[0];
  if (!mentor) throw new Error('"멘토" 탭에 활성 멘토가 없습니다.');
  const res = handleRequest_(
    JSON.stringify({
      apiKey: getSecret_(PROPERTY_KEYS.API_KEY),
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
