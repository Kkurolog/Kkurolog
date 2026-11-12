/**
 * Triggers.gs — 시간 트리거 켜기/끄기
 *
 * 이 파일이 하는 일
 * - checkReplies(답장 확인)를 5분마다, sendReminders(멘토 리마인드)를 매일 오전 10시~11시에
 *   자동 실행하는 시간 트리거를 만들거나 지웁니다.
 * - 트리거는 "만든 사람의 계정"으로 돌아갑니다. 반드시 중계 계정으로 실행하세요.
 * - setup()과 시트 메뉴 "자동 실행 켜기"는 installAutoTriggers를 불러 둘 다 켭니다.
 * - 함수마다 트리거는 항상 1개만 남깁니다. (켜기를 여러 번 눌러도 겹치지 않음)
 */

/**
 * 이름이 handlerName인 함수의 트리거를 모두 지웁니다.
 * @param {string} handlerName
 * @return {number} 지운 개수
 */
function removeTriggersFor_(handlerName) {
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === handlerName) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });
  return removed;
}

/**
 * 이름이 handlerName인 함수의 트리거 개수
 * @param {string} handlerName
 * @return {number}
 */
function countTriggersFor_(handlerName) {
  return ScriptApp.getProjectTriggers().filter(function (trigger) {
    return trigger.getHandlerFunction() === handlerName;
  }).length;
}

/**
 * [편집기에서 실행 가능] 답장 확인 트리거를 켭니다. 이미 있으면 지우고 새로 하나만 만듭니다.
 * @return {string} 결과 안내 문구
 */
function installReplyTrigger() {
  removeTriggersFor_(REPLY_CONFIG.TRIGGER_FUNCTION);
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
 * [편집기에서 실행 가능] 답장 확인 트리거를 끕니다.
 * @return {string} 결과 안내 문구
 */
function removeReplyTrigger() {
  const message = `기존 답장 확인 트리거 ${removeTriggersFor_(REPLY_CONFIG.TRIGGER_FUNCTION)}개를 지웠습니다.`;
  console.log(message);
  return message;
}

/**
 * [편집기에서 실행 가능] 리마인드 트리거를 켭니다. 매일 TRIGGER_HOUR시~(TRIGGER_HOUR+1)시 사이에 한 번 실행됩니다.
 * @return {string} 결과 안내 문구
 */
function installReminderTrigger() {
  removeTriggersFor_(REMINDER_CONFIG.TRIGGER_FUNCTION);
  ScriptApp.newTrigger(REMINDER_CONFIG.TRIGGER_FUNCTION)
    .timeBased()
    .everyDays(1)
    .atHour(REMINDER_CONFIG.TRIGGER_HOUR)
    .inTimezone(Session.getScriptTimeZone())
    .create();
  const message =
    `매일 ${REMINDER_CONFIG.TRIGGER_HOUR}시~${REMINDER_CONFIG.TRIGGER_HOUR + 1}시 사이에 ` +
    `${REMINDER_CONFIG.TRIGGER_FUNCTION}를 실행하는 트리거를 만들었습니다.`;
  console.log(message);
  return message;
}

/**
 * [편집기에서 실행 가능] 리마인드 트리거를 끕니다.
 * @return {string} 결과 안내 문구
 */
function removeReminderTrigger() {
  const message = `기존 리마인드 트리거 ${removeTriggersFor_(REMINDER_CONFIG.TRIGGER_FUNCTION)}개를 지웠습니다.`;
  console.log(message);
  return message;
}

/**
 * [시트 메뉴 "자동 실행 켜기"] 답장 확인 + 리마인드 트리거를 둘 다 켭니다.
 * @return {string[]} 결과 안내 문구
 */
function installAutoTriggers() {
  return [installReplyTrigger(), installReminderTrigger()];
}

/**
 * [시트 메뉴 "자동 실행 끄기"] 답장 확인 + 리마인드 트리거를 둘 다 끕니다.
 * @return {string[]} 결과 안내 문구
 */
function removeAutoTriggers() {
  return [removeReplyTrigger(), removeReminderTrigger()];
}

/** 지금 켜져 있는 답장 확인 트리거 개수 */
function countReplyTriggers_() {
  return countTriggersFor_(REPLY_CONFIG.TRIGGER_FUNCTION);
}

/** 지금 켜져 있는 리마인드 트리거 개수 */
function countReminderTriggers_() {
  return countTriggersFor_(REMINDER_CONFIG.TRIGGER_FUNCTION);
}
