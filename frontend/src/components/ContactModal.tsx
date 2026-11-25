// 멘토에게 메일 쓰기 창(모달). (와이어프레임 03-2 ~ 03-4)
// 학생이 쓴 내용은 꾸로록 backend(/contact-requests)로 가고, 꾸로록이 선배에게 이메일로 전달한다.
// (지금은 실제 메일을 보내지 않고 서버 로그에만 남긴다)
// 상태: 작성 중(editing) → 전송 중(sending) → 완료(done)  /  실패하면 작성 중으로 돌아와 오류 문구를 보여준다
// - 이름·메일 주소·제목·내용 중 하나라도 비어 있으면 '보내기'가 흐리고 누를 수 없다. (03-2-2, 03-2-3)
// - 작성 중인 내용이 있을 때 X·바깥 배경·Esc 를 누르면 확인 창을 먼저 띄운다. (03-2-1)
"use client";

import { useEffect, useState } from "react";
import { sendContactRequest, type Mentor } from "@/lib/api";
import ConfirmDialog from "./ConfirmDialog";
import { MentorPhoto } from "./MentorCard";
import { CloseIcon, PlaneIcon } from "./icons";

type Props = {
  mentor: Mentor;
  initialMessage?: string; // 채팅에서 열었을 때 미리 채울 학생 질문
  onClose: () => void;
};

type Status = "editing" | "sending" | "done";

const fieldClass =
  "w-full bg-transparent px-5 py-4 text-base text-ink placeholder:text-placeholder focus:bg-sky/40 focus:outline-none sm:px-8 sm:py-5";

export default function ContactModal({ mentor, initialMessage = "", onClose }: Props) {
  const [senderName, setSenderName] = useState("");
  const [replyEmail, setReplyEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState(initialMessage);
  const [status, setStatus] = useState<Status>("editing");
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const filled = [senderName, replyEmail, subject, message].every((v) => v.trim() !== "");
  const dirty = senderName !== "" || replyEmail !== "" || subject !== "" || message !== initialMessage;

  // 닫기 요청: 작성 중인 내용이 있으면 확인 창, 없으면 바로 닫기. 전송 중에는 닫지 않는다.
  function requestClose() {
    if (status === "sending") return;
    if (status === "editing" && dirty) setConfirmClose(true);
    else onClose();
  }

  // Esc 키로 닫기 (확인 창이 떠 있으면 확인 창이 먼저 처리한다)
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !confirmClose) requestClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!filled) return;
    setStatus("sending");
    setError(null);
    try {
      await sendContactRequest({
        mentor_id: mentor.id,
        sender_name: senderName.trim(),
        reply_email: replyEmail.trim(),
        subject: subject.trim(),
        message: message.trim(),
      });
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "보내지 못했어요. 잠시 후 다시 시도해 주세요.");
      setStatus("editing");
    }
  }

  const closeButton = (
    <button
      type="button"
      onClick={requestClose}
      aria-label="닫기"
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-brand hover:bg-sky"
    >
      <CloseIcon className="size-6" />
    </button>
  );

  return (
    // 바깥 어두운 배경. 누르면 닫기 요청
    // 휴대폰(sm 미만)에서는 아래에서 올라오는 시트, 넓은 화면에서는 가운데 창
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 motion-safe:animate-fade-in sm:items-center sm:p-4"
      onClick={requestClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-title"
        className="relative flex h-[92dvh] w-full max-w-[720px] flex-col overflow-hidden rounded-t-3xl border-2 border-b-0 border-brand bg-canvas motion-safe:animate-slide-up sm:h-[720px] sm:max-h-[calc(100dvh-32px)] sm:rounded-3xl sm:border-b-2 sm:motion-safe:animate-pop-in"
        onClick={(e) => e.stopPropagation()} // 창 안쪽을 눌렀을 때는 닫히지 않게
      >
        {status === "sending" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 px-5 sm:px-8" role="status">
            {/* 노란 동그라미는 가만히 있고, 그 안에서 종이비행기만 계속 날아간다 */}
            <span className="inline-flex size-24 items-center justify-center overflow-hidden rounded-full bg-accent">
              <PlaneIcon className="size-14 text-brand motion-safe:animate-fly" />
            </span>
            <p id="contact-title" className="text-2xl font-bold text-ink">
              메일을 보내는 중이에요...
            </p>
          </div>
        )}

        {status === "done" && (
          <>
            <div className="absolute top-4 right-4 sm:top-10 sm:right-7">{closeButton}</div>
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 text-center sm:px-8" role="status">
              <span className="mb-6 inline-flex size-24 items-center justify-center overflow-hidden rounded-full bg-accent motion-safe:animate-pop-in">
                <PlaneIcon className="size-14 text-brand motion-safe:animate-fly-away" />
              </span>
              <p id="contact-title" className="text-2xl font-bold text-ink motion-safe:animate-rise-in">
                메일 전송이 완료되었어요!
              </p>
              <p className="text-base text-muted">작성하신 메일 사본을 적어주신 메일로도 보내드렸어요.</p>
              <p className="pt-2 text-xs text-muted">(demo: 실제 메일은 보내지 않고 서버 로그에만 남겨요)</p>
            </div>
          </>
        )}

        {status === "editing" && (
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-4 sm:gap-4 sm:px-8 sm:pt-7 sm:pb-6">
              <div className="flex min-w-0 items-center gap-3">
                <MentorPhoto name={mentor.name} avatarId={mentor.avatar_id} size="md" />
                <h2 id="contact-title" className="shrink-0 text-lg font-bold text-ink sm:text-xl">
                  {mentor.name}
                </h2>
                <p className="truncate text-[15px] text-muted">{mentor.path_summary}</p>
              </div>
              {closeButton}
            </div>

            <div className="flex min-h-0 flex-1 flex-col divide-y divide-brand/15 border-t border-brand/15">
              <input
                  aria-label="이름"
                  maxLength={30}
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder="이름"
                  autoComplete="name"
                  className={fieldClass}
                />
              <input
                  aria-label="본인 메일 주소"
                  type="email"
                  maxLength={254}
                  value={replyEmail}
                  onChange={(e) => setReplyEmail(e.target.value)}
                  placeholder="본인 메일 주소"
                  autoComplete="email"
                  className={fieldClass}
                />
              <input
                  aria-label="메일 제목"
                  maxLength={100}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="메일 제목"
                  className={fieldClass}
                />
              <textarea
                  aria-label="메일 내용"
                  maxLength={2000}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="멘토에게 궁금한 것을 질문해 보세요"
                  className={`${fieldClass} min-h-24 flex-1 resize-none leading-relaxed`}
                />
            </div>

            <div className="flex items-center justify-end gap-4 px-5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-8 sm:pt-4 sm:pb-7">
              {error && (
                <p role="alert" className="mr-auto border-l-4 border-danger pl-3 text-sm text-ink">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={!filled}
                className="min-h-[45px] shrink-0 rounded-[22px] bg-brand px-7 text-[15px] font-bold text-white hover:bg-brand-dark disabled:border-[1.5px] disabled:border-brand disabled:bg-transparent disabled:text-brand disabled:opacity-30"
              >
                보내기
              </button>
            </div>
          </form>
        )}
      </div>

      {confirmClose && (
        <div onClick={(e) => e.stopPropagation()}>
          <ConfirmDialog
            title="작성을 그만둘까요?"
            body="작성 중인 내용이 사라져요."
            cancelLabel="계속 작성"
            confirmLabel="나가기"
            onCancel={() => setConfirmClose(false)}
            onConfirm={onClose}
          />
        </div>
      )}
    </div>
  );
}
