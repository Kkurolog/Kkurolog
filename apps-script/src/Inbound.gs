/**
 * Inbound.gs — 멘토 답장 후보를 백엔드로 넘기기 (5분 트리거)
 *
 * checkReplies가 5분마다 실행됩니다.
 * 1. 지난번 확인 이후 중계 Gmail에 들어온 메일을 가져옵니다. (Receiver.gs)
 * 2. "문의에 대한 답장일 수 있는 메일"만 고릅니다. (받는 주소에 +문의번호가 있거나, 본문에 "문의번호: q…" 줄이 있음)
 *    → 꾸로록과 상관없는 메일(광고, 개인 메일 등)은 백엔드로 보내지 않습니다. (개인정보 보호)
 * 3. 고른 메일을 5통씩 백엔드 POST /internal/mail/inbound 로 넘깁니다.
 *    백엔드가 문의번호 확인·보낸 사람 확인·인용문 정리·학생에게 전달(sendMail)·Supabase 기록을 하고,
 *    메일마다 결과를 돌려줍니다: forwarded / needs_review / ignored / retry
 * 4. 결과대로 라벨을 붙이고, retry가 아닌 메일은 "처리 완료"로 기억합니다.
 *    백엔드가 응답하지 않으면 아무것도 기억하지 않고 다음 차례에 다시 보냅니다.
 *    (같은 메일이 두 번 가도 백엔드가 Supabase mail_replies.message_id 로 한 번만 처리합니다)
 */

/**
 * [시간 트리거가 부르는 함수] 메뉴에서 직접 실행해도 됩니다.
 * 이름을 바꾸면 이미 만들어진 트리거가 이 함수를 못 찾으니 바꾸지 않습니다.
 * @return {string} 결과 요약
 */
function checkReplies() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    const busy = '이전 확인이 아직 진행 중이라 이번 차례는 건너뜁니다.';
    console.log(busy);
    return busy;
  }
  try {
    return processInbound_();
  } catch (err) {
    console.error(`답장 확인 중 오류: ${err && err.detail ? err.detail : ''} ${err && err.stack ? err.stack : err}`);
    throw err; // 트리거 실패 알림 메일이 중계 계정으로 갑니다
  } finally {
    lock.releaseLock();
  }
}

/**
 * 문의에 대한 답장일 수 있는 메일인지 봅니다. (최종 판단은 백엔드가 합니다)
 * @param {{recipients: string[], plainBody: string}} message
 * @param {string} relayAddress 중계 메일 주소
 * @return {boolean}
 */
function looksLikeInquiryReply_(message, relayAddress) {
  const parts = splitAddress_(relayAddress);
  const plusPattern = new RegExp(
    `${escapeRegExp_(parts.local)}\\+${INQUIRY_ID_PATTERN}@${escapeRegExp_(parts.domain)}`,
    'i'
  );
  if (message.recipients.some(function (r) { return plusPattern.test(String(r)); })) return true;
  const linePattern = new RegExp(`${escapeRegExp_(INQUIRY_ID_LINE_LABEL)}\\s*:\\s*${INQUIRY_ID_PATTERN}`, 'i');
  return linePattern.test(String(message.plainBody));
}

/**
 * 백엔드로 넘길 모양으로 바꿉니다. 본문은 너무 길면 자릅니다.
 * @param {Object} message Receiver가 만든 메일
 * @return {Object}
 */
function toInboundPayloadItem_(message) {
  return {
    messageId: message.id,
    receivedAt: toIsoKst_(message.date),
    from: message.fromAddress,
    recipients: message.recipients.map(String),
    subject: message.subject || '',
    plainBody: String(message.plainBody).slice(0, REPLY_CONFIG.BODY_MAX_CHARS),
  };
}

/** 기억해 둔 상태(마지막 확인 시각, 처리한 메일 ID)를 읽습니다. */
function loadInboundState_(props) {
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
 * 백엔드가 돌려준 결과 하나를 메일에 적용합니다.
 * @return {boolean} 처리 완료로 기억해도 되면 true (retry면 false)
 */
function applyInboundResult_(message, result) {
  if (result === 'forwarded') {
    Receiver.removeLabel(message, GMAIL_LABELS.NEEDS_REVIEW);
    Receiver.addLabel(message, GMAIL_LABELS.FORWARDED);
    return true;
  }
  if (result === 'needs_review') {
    Receiver.addLabel(message, GMAIL_LABELS.NEEDS_REVIEW);
    return true;
  }
  if (result === 'ignored') return true;
  return false; // retry 또는 알 수 없는 값 → 다음 차례에 다시
}

/**
 * 답장 확인 한 번
 * @return {string} 결과 요약
 */
function processInbound_() {
  const startedAt = Date.now();
  const props = PropertiesService.getScriptProperties();
  const state = loadInboundState_(props);
  const since = state.lastCheckedAt
    ? new Date(state.lastCheckedAt - REPLY_CONFIG.OVERLAP_MS)
    : new Date(startedAt - REPLY_CONFIG.FIRST_LOOKBACK_MS);
  const relay = getRelayAddress_().toLowerCase();

  const candidates = Receiver.findMessagesSince(since).filter(function (m) {
    if (state.processedIds.indexOf(m.id) >= 0) return false; // 이미 넘김
    if (m.fromAddress === relay) return false; // 우리가 보낸 메일
    return looksLikeInquiryReply_(m, relay);
  });

  const counts = { forwarded: 0, needs_review: 0, ignored: 0, retry: 0, notSent: 0 };
  let canAdvance = true; // 못 끝낸 메일이 있으면 다음에 다시 보도록 확인 시각을 옮기지 않음
  const limit = Math.min(candidates.length, REPLY_CONFIG.MAX_MESSAGES_PER_RUN);
  if (candidates.length > limit) canAdvance = false;

  for (let start = 0; start < limit; start += REPLY_CONFIG.BATCH_SIZE) {
    if (Date.now() - startedAt > REPLY_CONFIG.RUN_BUDGET_MS) {
      canAdvance = false;
      counts.notSent += limit - start;
      break;
    }
    const batch = candidates.slice(start, Math.min(start + REPLY_CONFIG.BATCH_SIZE, limit));
    let response;
    try {
      response = callBackend_(BACKEND_PATHS.INBOUND, { messages: batch.map(toInboundPayloadItem_) });
    } catch (err) {
      console.warn(`백엔드에 넘기지 못했습니다. 다음 차례에 다시 시도합니다: ${err && err.detail ? err.detail : err}`);
      canAdvance = false;
      counts.notSent += limit - start;
      break;
    }
    const results = {};
    (response && Array.isArray(response.results) ? response.results : []).forEach(function (r) {
      if (r && typeof r.messageId === 'string') results[r.messageId] = r.result;
    });
    batch.forEach(function (message) {
      const result = results[message.id] || 'retry';
      if (applyInboundResult_(message, result)) {
        rememberProcessed_(props, state, message.id);
        counts[result]++;
      } else {
        counts.retry++;
        canAdvance = false;
      }
    });
  }

  if (canAdvance) props.setProperty(PROPERTY_KEYS.REPLY_LAST_CHECKED_AT, String(startedAt));
  const summary =
    `답장 확인 완료: 후보 ${candidates.length}, 전달 ${counts.forwarded}, 확인필요 ${counts.needs_review}, ` +
    `무시 ${counts.ignored}, 다시 시도 ${counts.retry + counts.notSent}`;
  console.log(summary);
  return summary;
}
