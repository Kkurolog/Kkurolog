/**
 * Triggers.gs — 시간 트리거 켜기/끄기
 *
 * 이 파일이 하는 일
 * - checkReplies를 5분마다 자동 실행하는 시간 트리거를 만들거나 지웁니다.
 * - 트리거는 "만든 사람의 계정"으로 돌아갑니다. 반드시 중계 계정으로 실행하세요.
 * - (Step 6의 setup()이 이 함수를 대신 불러 줄 예정입니다)
 */

/** [편집기에서 직접 실행] 답장 확인 트리거를 켭니다. 이미 있으면 지우고 새로 하나만 만듭니다. */
function installReplyTrigger() {
  removeReplyTrigger();
  ScriptApp.newTrigger(REPLY_CONFIG.TRIGGER_FUNCTION)
    .timeBased()
    .everyMinutes(REPLY_CONFIG.TRIGGER_EVERY_MINUTES)
    .create();
  console.log(
    `${REPLY_CONFIG.TRIGGER_EVERY_MINUTES}분마다 ${REPLY_CONFIG.TRIGGER_FUNCTION}를 실행하는 트리거를 만들었습니다. ` +
      `실행 계정: ${getRelayAddress_()}`
  );
}

/** [편집기에서 직접 실행] 답장 확인 트리거를 끕니다. */
function removeReplyTrigger() {
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === REPLY_CONFIG.TRIGGER_FUNCTION) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });
  console.log(`기존 답장 확인 트리거 ${removed}개를 지웠습니다.`);
}
