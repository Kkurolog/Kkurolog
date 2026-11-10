/**
 * Menu.gs — 시트 위쪽 메뉴
 *
 * 이 파일이 하는 일
 * - 시트를 열면 "○○ 메일 자동화" 메뉴를 만듭니다. (onOpen은 구글이 자동으로 부르는 함수)
 * - 기관 담당자가 Apps Script 편집기를 열지 않고도 설치·점검·트리거 켜기/끄기를 할 수 있습니다.
 * - 메뉴를 처음 누르면 권한 승인 창이 뜹니다. 반드시 중계 계정으로 로그인한 상태에서 누르세요.
 *   (메뉴를 누른 사람의 계정으로 트리거가 만들어지고 메일이 나갑니다)
 */

/** 시트를 열 때 메뉴를 만듭니다. */
function onOpen() {
  let title = '메일 자동화';
  try {
    const serviceName = getSettings_()[SETTING_KEYS.SERVICE_NAME];
    if (serviceName) title = `${serviceName} 메일 자동화`;
  } catch (err) {
    // 설정 탭이 아직 없으면 기본 이름을 씁니다.
  }
  SpreadsheetApp.getUi()
    .createMenu(title)
    .addItem('① 설치·점검 (setup)', 'menuSetup')
    .addItem('상태 보기', 'menuShowStatus')
    .addSeparator()
    .addItem('답장 지금 확인', 'menuCheckReplies')
    .addItem('답장 자동 확인 켜기 (5분마다)', 'menuInstallTrigger')
    .addItem('답장 자동 확인 끄기', 'menuRemoveTrigger')
    .addSeparator()
    .addItem('템플릿용으로 데이터 비우기 (사본에서만)', 'clearForTemplate')
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

/** 오류도 창으로 보여 줍니다. (내부 설명까지 보여 줌: 메뉴는 시트 편집자만 씀) */
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
function menuInstallTrigger() { runFromMenu_('답장 자동 확인 켜기', installReplyTrigger); }
function menuRemoveTrigger() { runFromMenu_('답장 자동 확인 끄기', removeReplyTrigger); }
function menuShowStatus() { runFromMenu_('상태', getStatusLines_); }

/**
 * 지금 상태 요약
 * @return {string[]}
 */
function getStatusLines_() {
  const props = PropertiesService.getScriptProperties();
  const lines = [];
  lines.push(`실행 계정(중계 메일): ${getRelayAddress_()}`);
  lines.push(`setup 실행 계정: ${props.getProperty(PROPERTY_KEYS.SETUP_OWNER) || '(아직 setup 안 함)'}`);
  lines.push(`API_KEY: ${props.getProperty(PROPERTY_KEYS.API_KEY) ? '있음' : '없음 → setup 실행'}`);
  lines.push(`ADMIN_TOKEN: ${props.getProperty(PROPERTY_KEYS.ADMIN_TOKEN) ? '있음' : '없음 → setup 실행'}`);
  const triggers = countReplyTriggers_();
  lines.push(`답장 자동 확인 트리거: ${triggers}개${triggers === 1 ? '' : ' (1개여야 정상 → "켜기"를 누르세요)'}`);
  const lastChecked = Number(props.getProperty(PROPERTY_KEYS.REPLY_LAST_CHECKED_AT)) || 0;
  lines.push(`마지막 답장 확인: ${lastChecked ? toIsoKst_(new Date(lastChecked)) : '(아직 없음)'}`);

  const mentors = readAllMentors_();
  lines.push(`멘토: 전체 ${mentors.length}명, 활성 ${mentors.filter(function (m) { return m.active; }).length}명`);
  const table = readTable_(SHEET_NAMES.INQUIRIES);
  const col = columnIndexes_(table.headers, INQUIRY_HEADERS, SHEET_NAMES.INQUIRIES);
  const total = table.values.filter(function (row, i) { return table.displayValues[i][col.ID]; }).length;
  const replied = table.values.filter(function (row) { return isTruthyCell_(row[col.REPLIED]); }).length;
  lines.push(`문의: 전체 ${total}건, 답장 받음 ${replied}건, 답장 전 ${total - replied}건`);
  lines.push(`오늘 남은 Gmail 발송 수: ${Mailer.remainingDailyQuota()}통`);
  return lines;
}
