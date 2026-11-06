// 멘토에게 연락하기 팝업(모달).
// 학생이 쓴 내용은 꾸로록 backend(/contact-requests)로 가고, 꾸로록이 선배에게 이메일로 전달한다.
// (지금은 실제 메일을 보내지 않고 서버 로그에만 남긴다)
// 상태: 입력 중 → 보내는 중 → 완료 / 오류
"use client";

import { useEffect, useState } from "react";
import { sendContactRequest, type Mentor } from "@/lib/api";

type Props = {
  mentor: Mentor;
  initialMessage?: string; // 채팅에서 열었을 때 미리 채울 학생 질문
  onClose: () => void;
};

type Status = "editing" | "sending" | "done" | "error";

const inputClass =
  "w-full rounded-lg border border-gray-300 p-2 text-base focus:border-indigo-500 focus:outline-none";

export default function ContactModal({ mentor, initialMessage = "", onClose }: Props) {
  const [senderName, setSenderName] = useState("");
  const [replyEmail, setReplyEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState(initialMessage);
  const [status, setStatus] = useState<Status>("editing");
  const [resultText, setResultText] = useState(""); // 완료/오류 때 보여줄 문구

  // Esc 키로 닫기
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await sendContactRequest({
        mentor_id: mentor.id,
        sender_name: senderName,
        reply_email: replyEmail,
        subject,
        message,
      });
      setResultText(res.message);
      setStatus("done");
    } catch (err) {
      setResultText(err instanceof Error ? err.message : "보내지 못했어요. 잠시 후 다시 시도해 주세요.");
      setStatus("error");
    }
  }

  return (
    // 바깥 어두운 배경. 배경을 누르면 닫힌다
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()} // 팝업 안쪽을 눌렀을 때는 닫히지 않게
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="contact-title" className="text-lg font-bold text-gray-900">
            {mentor.name} 선배에게 연락하기
          </h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-gray-400 hover:text-gray-700">
            ✕
          </button>
        </div>

        {status === "done" ? (
          <div className="mt-6 flex flex-col gap-4">
            <p className="rounded-lg bg-green-50 p-4 text-green-800">
              ✅ {resultText}
              <br />
              <span className="text-sm">선배가 답장하면 입력한 이메일로 바로 받을 수 있어요.</span>
            </p>
            <p className="text-xs text-gray-400">(demo: 실제 메일은 보내지 않고 서버 로그에만 남겼어요)</p>
            <button
              type="button"
              onClick={onClose}
              className="self-end rounded-lg bg-indigo-600 px-5 py-2 font-medium text-white hover:bg-indigo-700"
            >
              닫기
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
            <p className="rounded-lg bg-indigo-50 p-3 text-sm leading-relaxed text-indigo-900">
              작성한 내용은 꾸로록을 통해 <b>{mentor.name}</b> 선배에게 이메일로 바로 전달돼요. 선배의 이메일
              주소는 공개되지 않으며, 이후 연락은 선배가 답장으로 이어가요.
            </p>

            <label className="flex flex-col gap-1 text-sm text-gray-700">
              내 이름 (또는 별명)
              <input
                required
                maxLength={30}
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-gray-700">
              답장 받을 이메일
              <input
                required
                type="email"
                maxLength={254}
                value={replyEmail}
                onChange={(e) => setReplyEmail(e.target.value)}
                placeholder="me@example.com"
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-gray-700">
              메일 제목
              <input
                required
                maxLength={100}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="예: 창업 먼저 하신 이유가 궁금해요"
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-gray-700">
              질문 내용 <span className="text-xs text-gray-400">(10자 이상, {message.length}/2000)</span>
              <textarea
                required
                minLength={10}
                maxLength={2000}
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className={`${inputClass} resize-none`}
              />
            </label>

            {status === "error" && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{resultText}</p>}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-gray-600 hover:bg-gray-100"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={status === "sending"}
                className="rounded-lg bg-indigo-600 px-5 py-2 font-medium text-white hover:bg-indigo-700 disabled:bg-gray-300"
              >
                {status === "sending" ? "보내는 중..." : "보내기"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
