/**
 * Receiver.gs — 받은 메일 읽기 모듈 (교체 가능한 부분)
 *
 * 이 파일이 하는 일
 * - 중계 Gmail에서 최근 메일을 찾아, 다른 파일이 쓰기 쉬운 모양으로 바꿔 줍니다.
 * - 메일 스레드에 라벨을 붙입니다. (사람이 메일함에서 처리 상태를 보기 위한 것)
 * - 나중에 메일 발송 전문 서비스(수신 웹훅 등)로 바꿀 때는 이 파일 안쪽만 바꾸면 됩니다.
 *   (Replies.gs는 Receiver.findMessagesSince(...), Receiver.addLabel(...), Receiver.removeLabel(...) 만 부릅니다)
 */
const Receiver = {
  /**
   * since 이후에 받은 메일을 오래된 순서로 돌려줍니다. (보낸편지함·임시보관함·스팸·휴지통 제외)
   * @param {Date} since
   * @return {{id: string, date: Date, fromAddress: string, recipients: string[],
   *           plainBody: string, raw: GoogleAppsScript.Gmail.GmailMessage}[]}
   */
  findMessagesSince: function (since) {
    const query = `after:${Math.floor(since.getTime() / 1000)} -in:sent -in:drafts`;
    const threads = GmailApp.search(query, 0, 100);
    const messages = [];
    threads.forEach(function (thread) {
      thread.getMessages().forEach(function (m) {
        if (m.getDate() < since || m.isDraft() || m.isInTrash()) return;
        messages.push({
          id: m.getId(),
          date: m.getDate(),
          fromAddress: extractAddress_(m.getFrom()),
          recipients: [
            m.getTo(),
            m.getCc(),
            Receiver.header_(m, 'Delivered-To'),
            Receiver.header_(m, 'X-Original-To'),
          ].filter(Boolean),
          plainBody: m.getPlainBody() || '',
          raw: m,
        });
      });
    });
    messages.sort(function (a, b) { return a.date - b.date; });
    return messages;
  },

  /**
   * 메일이 들어 있는 스레드에 라벨을 붙입니다. 라벨이 없으면 만듭니다.
   * @param {{raw: GoogleAppsScript.Gmail.GmailMessage}} message
   * @param {string} labelName GMAIL_LABELS 중 하나
   */
  addLabel: function (message, labelName) {
    try {
      const label = GmailApp.getUserLabelByName(labelName) || GmailApp.createLabel(labelName);
      message.raw.getThread().addLabel(label);
    } catch (err) {
      console.warn(`라벨을 붙이지 못했습니다 (${labelName}): ${err}`);
    }
  },

  /**
   * 메일이 들어 있는 스레드에서 라벨을 뗍니다. 라벨이 없으면 아무것도 하지 않습니다.
   * @param {{raw: GoogleAppsScript.Gmail.GmailMessage}} message
   * @param {string} labelName GMAIL_LABELS 중 하나
   */
  removeLabel: function (message, labelName) {
    try {
      const label = GmailApp.getUserLabelByName(labelName);
      if (label) message.raw.getThread().removeLabel(label);
    } catch (err) {
      console.warn(`라벨을 떼지 못했습니다 (${labelName}): ${err}`);
    }
  },

  /** 메일 헤더 하나를 읽습니다. 못 읽으면 빈 글자. */
  header_: function (gmailMessage, name) {
    try {
      return gmailMessage.getHeader(name) || '';
    } catch (err) {
      return '';
    }
  },
};
