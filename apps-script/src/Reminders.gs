/**
 * Reminders.gs — 리마인드 실행 요청 (매일 10~11시 트리거)
 *
 * 대상 찾기(답장 없음 + 보낸 날짜로부터 reminderDays일째 + 아직 리마인드 안 함 + 멘토 활성)와
 * 메일 문장 만들기, 보내기(sendMail), Supabase 기록은 모두 백엔드가 합니다.
 * 여기서는 정해진 시각에 백엔드 POST /internal/mail/reminders 를 부르기만 합니다.
 * (백엔드 서버에는 정해진 시각에 스스로 일을 하는 기능이 없어서, 알람 역할을 Apps Script가 맡습니다)
 */

/**
 * [시간 트리거가 부르는 함수] 메뉴에서 직접 실행해도 됩니다. (조건에 맞는 문의만 보냄)
 * 이름을 바꾸면 이미 만들어진 트리거가 이 함수를 못 찾으니 바꾸지 않습니다.
 * @return {string} 결과 요약
 */
function sendReminders() {
  try {
    const response = callBackend_(BACKEND_PATHS.REMINDERS, {});
    const summary = response && response.summary ? String(response.summary) : JSON.stringify(response);
    console.log(`리마인드 요청 완료: ${summary}`);
    return `리마인드 요청 완료: ${summary}`;
  } catch (err) {
    console.error(`리마인드 요청 실패: ${err && err.detail ? err.detail : err}`);
    throw err; // 트리거 실패 알림 메일이 중계 계정으로 갑니다. 다음 날 다시 시도됩니다.
  }
}
