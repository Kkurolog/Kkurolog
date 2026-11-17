/**
 * Test.gs — 편집기에서 직접 실행하는 테스트 (B 방식: 메일 전용)
 *
 * 사용법: 편집기 위쪽 함수 선택 칸에서 함수를 고르고 ▷ 실행 → 아래 "실행 로그"를 봅니다.
 * - 반드시 중계 계정으로 로그인한 상태에서 실행합니다.
 * - 테스트 메일 주소는 코드에 적지 않고 Script Properties의 TEST_STUDENT_EMAIL에서 읽습니다.
 *
 * 메일을 보내지 않는 테스트: testSendMailValidation, testInboundFilter
 * 백엔드를 부르는 테스트:    testBackendConnection (메일 안 보냄)
 * 메일을 보내는 테스트:      testSendMail (1통)
 */

/**
 * 테스트용으로 Script Properties 값을 읽습니다. 없으면 무엇이 빠졌는지 로그에 그대로 보여 줍니다.
 * @param {string} key
 * @return {string}
 */
function testProperty_(key) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) {
    throw new Error(
      `Script Properties에 "${key}" 값이 없습니다. ⚙ 프로젝트 설정 → 스크립트 속성에서 이름과 값을 확인하세요. ` +
        (key === PROPERTY_KEYS.TEST_STUDENT_EMAIL || key === PROPERTY_KEYS.BACKEND_URL
          ? '이 값은 직접 추가해야 합니다.'
          : '메뉴의 ① 설치·점검 (setup)을 실행하면 만들어집니다.')
    );
  }
  return value;
}

/** 테스트 결과 한 줄을 찍고, 실패면 1을 돌려줍니다. */
function testCheck_(name, pass, detail) {
  console.log(`${pass ? '✅' : '❌'} ${name}${pass || !detail ? '' : ' / ' + detail}`);
  return pass ? 0 : 1;
}

/** 1) sendMail 입력 검사 (메일 안 보냄) */
function testSendMailValidation() {
  const apiKey = testProperty_(PROPERTY_KEYS.API_KEY);
  const valid = {
    apiKey: apiKey,
    action: 'sendMail',
    to: 'student@example.com',
    fromName: '꾸로록',
    subject: '테스트 제목',
    textBody: '테스트 본문',
  };
  const cases = [
    ['apiKey 틀림', Object.assign({}, valid, { apiKey: 'WRONG_KEY' }), 'UNAUTHORIZED'],
    ['없는 action', Object.assign({}, valid, { action: 'submitInquiry' }), 'INVALID_ACTION'],
    ['받는 사람 형식 오류', Object.assign({}, valid, { to: 'not-an-email' }), 'INVALID_EMAIL'],
    ['받는 사람 없음', Object.assign({}, valid, { to: undefined }), 'INVALID_EMAIL'],
    ['제목 비어 있음', Object.assign({}, valid, { subject: '' }), 'INVALID_INPUT'],
    ['제목 201자', Object.assign({}, valid, { subject: '가'.repeat(201) }), 'INVALID_INPUT'],
    ['본문 없음', Object.assign({}, valid, { textBody: undefined }), 'INVALID_INPUT'],
    ['보낸 사람 이름 없음', Object.assign({}, valid, { fromName: '' }), 'INVALID_INPUT'],
    ['문의번호 형식 오류', Object.assign({}, valid, { replyToInquiryId: 'abc' }), 'INVALID_INPUT'],
    ['htmlBody가 글자가 아님', Object.assign({}, valid, { htmlBody: 123 }), 'INVALID_INPUT'],
  ];
  let failed = 0;
  cases.forEach(function (c) {
    const res = handleRequest_(JSON.stringify(c[1]));
    const code = res.ok ? 'OK' : res.error.code;
    failed += testCheck_(`${c[0]}: 기대 ${c[2]} / 실제 ${code}`, code === c[2]);
  });
  let ok = true;
  try {
    validateSendMailRequest_(Object.assign({}, valid, { replyToInquiryId: 'q20261117-0001', htmlBody: '<p>본문</p>' }));
  } catch (err) {
    ok = false;
  }
  failed += testCheck_('올바른 요청(문의번호·HTML 포함)은 검사 통과', ok);
  const quota = handleRequest_(JSON.stringify({ apiKey: apiKey, action: 'getQuota' }));
  failed += testCheck_('getQuota: 남은 발송 수가 숫자', quota.ok && typeof quota.data.remaining === 'number', JSON.stringify(quota));
  console.log(failed === 0 ? '모두 통과했습니다.' : `${failed}개 실패했습니다.`);
}

/** 2) 실제로 메일 1통 보내기 (TEST_STUDENT_EMAIL로, 답장 주소에 테스트 문의번호) */
function testSendMail() {
  const to = testProperty_(PROPERTY_KEYS.TEST_STUDENT_EMAIL);
  const res = handleRequest_(
    JSON.stringify({
      apiKey: testProperty_(PROPERTY_KEYS.API_KEY),
      action: 'sendMail',
      to: to,
      replyToInquiryId: 'q20000101-0001',
      fromName: '꾸로록',
      subject: '[테스트] 메일 자동화 sendMail',
      textBody: 'sendMail 테스트 메일입니다.\n답장 버튼을 누르면 받는 사람이 중계계정+q20000101-0001@… 인지 확인하세요.',
      htmlBody: '<p>sendMail 테스트 메일입니다.</p><p>답장 버튼을 누르면 받는 사람이 <b>중계계정+q20000101-0001@…</b> 인지 확인하세요.</p>',
    })
  );
  console.log(JSON.stringify(res));
  console.log(res.ok ? '✅ TEST_STUDENT_EMAIL 메일함에서 확인하세요 (스팸함 포함).' : '❌ 실패했습니다. 위 error를 확인하세요.');
}

/** 3) 답장 후보 고르기 (메일 안 보냄, 메일함 안 읽음) */
function testInboundFilter() {
  const relay = getRelayAddress_();
  const id = 'q20261117-0001';
  const plus = toPlusAddress_(relay, id);
  const cases = [
    ['plus 주소로 온 답장', { recipients: [`꾸로록 <${plus}>`], plainBody: '' }, true],
    ['plus 주소 대문자', { recipients: [plus.toUpperCase()], plainBody: '' }, true],
    ['본문에 문의번호 줄 (인용)', { recipients: [relay], plainBody: `좋은 질문이에요.\n> ${INQUIRY_ID_LINE_LABEL}: ${id}` }, true],
    ['관계없는 메일', { recipients: [relay], plainBody: '광고 메일입니다.' }, false],
    ['다른 계정의 plus 주소', { recipients: [`someone+${id}@example.com`], plainBody: '' }, false],
  ];
  let failed = 0;
  cases.forEach(function (c) {
    const got = looksLikeInquiryReply_(c[1], relay);
    failed += testCheck_(`답장 후보 - ${c[0]}: 기대 ${c[2]} / 실제 ${got}`, got === c[2]);
  });
  console.log(failed === 0 ? '모두 통과했습니다.' : `${failed}개 실패했습니다.`);
}

/**
 * 4) 백엔드 연결 확인 (메일 안 보냄)
 * - GET /health 가 응답하는지
 * - POST /internal/mail/inbound 에 빈 목록을 보내 MAIL_WEBHOOK_SECRET 이 맞는지
 */
function testBackendConnection() {
  testProperty_(PROPERTY_KEYS.BACKEND_URL);
  testProperty_(PROPERTY_KEYS.MAIL_WEBHOOK_SECRET);
  console.log(pingBackend_());
  try {
    const res = callBackend_(BACKEND_PATHS.INBOUND, { messages: [] });
    testCheck_('비밀값 확인 (빈 목록 보내기)', Array.isArray(res.results), JSON.stringify(res));
  } catch (err) {
    testCheck_('비밀값 확인 (빈 목록 보내기)', false, err && err.detail ? err.detail : String(err));
  }
}
