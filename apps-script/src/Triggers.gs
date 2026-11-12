/**
 * Triggers.gs — 시간 트리거 켜기/끄기
 *
 * 이 파일이 하는 일
 * - checkReplies를 5분마다 자동 실행하는 시간 트리거를 만들거나 지웁니다.
 * - 트리거는 "만든 사람의 계정"으로 돌아갑니다. 반드시 중계 계정으로 실행하세요.
 * - setup()이 installReplyTrigger를 대신 불러 줍니다.
 */

/**
 * [편집기 또는 시트 메뉴에서 실행] 답장 확인 트리거를 켭니다. 이미 있으면 지우고 새로 하나만 만듭니다.
 * @return {string} 결과 안내 문구
 */
function installReplyTrigger() {
  removeReplyTrigger();
  ScriptApp.newTrigger(REPLY_CONFIG.TRIGGER_FUNCTION)
    .timeBased()
    .everyMinutes(REPLY_CONFIG.TRIGGER_EVERY_MINUTES)
    .create();
  const message =
    `${REPLY_CONFIG.TRIGGER_EVERY_MINUTES}분마다 ${REPLY_CONFIG.TRIGGER_FUNCTION}를 실행하는 트리거를 만들었습니다. ` +
    `실행 계정: ${getRelayAddress_()}`;
  console.log(message);
  return message;
}

/**
 * [편집기 또는 시트 메뉴에서 실행] 답장 확인 트리거를 끕니다.
 * @return {string} 결과 안내 문구
 */
function removeReplyTrigger() {
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === REPLY_CONFIG.TRIGGER_FUNCTION) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });
  const message = `기존 답장 확인 트리거 ${removed}개를 지웠습니다.`;
  console.log(message);
  return message;
}

/**
 * 지금 켜져 있는 답장 확인 트리거 개수
 * @return {number}
 */
function countReplyTriggers_() {
  return ScriptApp.getProjectTriggers().filter(function (trigger) {
    return trigger.getHandlerFunction() === REPLY_CONFIG.TRIGGER_FUNCTION;
  }).length;
}
