/**
 * Menu.gs — 시트 위쪽 메뉴 (이 프로젝트가 시트에 붙어 있을 때만 보입니다)
 *
 * - 편집기를 열지 않고도 설치·점검·자동 실행 켜기/끄기를 할 수 있습니다.
 * - 메뉴를 누른 사람의 계정으로 트리거가 만들어지고 메일이 나갑니다. 반드시 중계 계정으로 누르세요.
 * - 시트에는 더 이상 데이터를 저장하지 않습니다. (멘토·문의·설정은 Supabase, 관리자 페이지에서 관리)
 */

/** 시트를 열 때 메뉴를 만듭니다. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('메일 자동화')
    .addItem('① 설치·점검 (setup)', 'menuSetup')
    .addItem('상태 보기', 'menuShowStatus')
    .addSeparator()
    .addItem('답장 지금 확인', 'menuCheckReplies')
    .addItem('리마인드 지금 요청', 'menuSendReminders')
    .addSeparator()
    .addItem('자동 실행 켜기 (답장 확인 5분마다 · 리마인드 매일)', 'menuInstallTrigger')
    .addItem('자동 실행 끄기', 'menuRemoveTrigger')
    .addToUi();
}

/** 메뉴에서 실행할 때만 화면 창을 쓸 수 있습니다. 편집기에서 실행하면 null. */
function getUiOrNull_() {
  try {
    return SpreadsheetApp.getUi();
  } catch (err) {
    return null;
  }
}

/** 결과를 창으로 보여 줍니다. (편집기에서 실행했으면 로그만) */
function showResult_(title, lines) {
  const text = Array.isArray(lines) ? lines.join('\n') : String(lines);
  console.log(text);
  const ui = getUiOrNull_();
  if (ui) ui.alert(title, text, ui.ButtonSet.OK);
}

/** 오류도 창으로 보여 줍니다. (내부 설명까지 보여 줌: 메뉴는 편집 권한이 있는 사람만 씀) */
function runFromMenu_(title, fn) {
  try {
    showResult_(title, fn());
  } catch (err) {
    const detail = err && err.detail ? `\n${err.detail}` : '';
    showResult_(`${title} - 오류`, `${err && err.message ? err.message : err}${detail}`);
  }
}

function menuSetup() { runFromMenu_('설치·점검 결과', setup); }
function menuCheckReplies() { runFromMenu_('답장 확인', checkReplies); }
function menuSendReminders() { runFromMenu_('리마인드', sendReminders); }
function menuInstallTrigger() { runFromMenu_('자동 실행 켜기', installAutoTriggers); }
function menuRemoveTrigger() { runFromMenu_('자동 실행 끄기', removeAutoTriggers); }
function menuShowStatus() { runFromMenu_('상태', getStatusLines_); }

/**
 * 지금 상태 요약
 * @return {string[]}
 */
function getStatusLines_() {
  const props = PropertiesService.getScriptProperties();
  const has = function (key) { return props.getProperty(key) ? '있음' : '없음 → setup 실행'; };
  const lines = [];
  lines.push(`실행 계정(중계 메일): ${getRelayAddress_()}`);
  lines.push(`setup 실행 계정: ${props.getProperty(PROPERTY_KEYS.SETUP_OWNER) || '(아직 setup 안 함)'}`);
  lines.push(`API_KEY: ${has(PROPERTY_KEYS.API_KEY)}`);
  lines.push(`MAIL_WEBHOOK_SECRET: ${has(PROPERTY_KEYS.MAIL_WEBHOOK_SECRET)}`);
  lines.push(`BACKEND_URL: ${props.getProperty(PROPERTY_KEYS.BACKEND_URL) ? '있음' : '없음 → 스크립트 속성에 추가'}`);
  const replyTriggers = countReplyTriggers_();
  const reminderTriggers = countReminderTriggers_();
  lines.push(`답장 확인 트리거: ${replyTriggers}개${replyTriggers === 1 ? '' : ' (1개여야 정상 → "자동 실행 켜기")'}`);
  lines.push(`리마인드 트리거: ${reminderTriggers}개${reminderTriggers === 1 ? '' : ' (1개여야 정상 → "자동 실행 켜기")'}`);
  const lastChecked = Number(props.getProperty(PROPERTY_KEYS.REPLY_LAST_CHECKED_AT)) || 0;
  lines.push(`마지막 답장 확인: ${lastChecked ? toIsoKst_(new Date(lastChecked)) : '(아직 없음)'}`);
  lines.push(`오늘 남은 Gmail 발송 수: ${Mailer.remainingDailyQuota()}통`);
  lines.push(pingBackend_());
  return lines;
}
