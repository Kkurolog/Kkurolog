/**
 * Mailer.gs — 메일 발송 모듈 (교체 가능한 부분)
 *
 * 이 파일이 하는 일
 * - 실제로 메일을 보내는 일만 합니다. 지금은 Gmail(GmailApp)을 씁니다.
 * - 나중에 기관 도메인 + 메일 발송 전문 서비스로 바꿀 때는 이 파일 안쪽만 바꾸면 됩니다.
 *   (다른 파일은 Mailer.send(...) 와 Mailer.remainingDailyQuota() 만 부릅니다)
 */
const Mailer = {
  /**
   * 오늘 더 보낼 수 있는 메일 수 (Gmail 일일 한도)
   * @return {number}
   */
  remainingDailyQuota: function () {
    return MailApp.getRemainingDailyQuota();
  },

  /**
   * 메일 한 통을 보냅니다. 실패하면 오류를 던집니다.
   * @param {{to: string, replyTo: string, fromName: string, subject: string,
   *          textBody: string, htmlBody: string}} message
   */
  send: function (message) {
    GmailApp.sendEmail(message.to, message.subject, message.textBody, {
      htmlBody: message.htmlBody,
      name: message.fromName,
      replyTo: message.replyTo,
    });
  },
};
