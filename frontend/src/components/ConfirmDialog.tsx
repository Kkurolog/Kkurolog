// 확인 창 (예: "새 채팅을 시작할까요?", "작성을 그만둘까요?")
// 왼쪽 버튼(cancelLabel)은 창만 닫고, 오른쪽 버튼(confirmLabel)은 실제 동작을 한다.
// Esc 키나 바깥 어두운 배경을 누르면 cancel 과 같다.
// tone="danger": 되돌릴 수 없는 동작(대화 지우기 등)용. 실행 버튼만 토마토색으로 하고,
//                warning 문구(되돌릴 수 없다는 한 줄)를 굵게 보여준다. 강조는 이 두 가지로만 한다.
"use client";

import { useEffect, useRef } from "react";

type Props = {
  title: string;
  body?: string;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  tone?: "default" | "danger";
  warning?: string; // 굵게 보여줄 경고 한 줄 (예: "지운 대화는 다시 볼 수 없어요.")
  detail?: string; // 무엇을 지우는지 (예: 대화 제목). 따옴표로 보여준다
};

export default function ConfirmDialog({
  title,
  body = "",
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  tone = "default",
  warning,
  detail,
}: Props) {
  const danger = tone === "danger";
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus(); // 실수로 지우지 않게 '취소' 쪽에 먼저 초점을 둔다
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    }
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4 motion-safe:animate-fade-in" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        className="flex w-full max-w-[440px] flex-col gap-3 rounded-3xl border-2 border-brand bg-canvas px-8 pt-8 pb-7 motion-safe:animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title" className="text-xl font-bold text-ink">
          {title}
        </h2>
        <div id="confirm-body" className="flex flex-col gap-2">
          {detail && <p className="truncate text-[15px] text-body">“{detail}”</p>}
          {body && <p className="text-[15px] text-muted">{body}</p>}
          {warning && <p className="text-[15px] font-bold text-ink">{warning}</p>}
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="min-h-10 rounded-[20px] px-6 text-[15px] font-bold text-brand hover:bg-sky"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`min-h-10 rounded-[20px] px-6 text-[15px] font-bold text-white ${
              danger ? "bg-danger-dark hover:brightness-110" : "bg-brand hover:bg-brand-dark"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
