// 확인 창 (예: "새 채팅을 시작할까요?", "작성을 그만둘까요?")
// 왼쪽 버튼(cancelLabel)은 창만 닫고, 오른쪽 버튼(confirmLabel)은 실제 동작을 한다.
// Esc 키나 바깥 어두운 배경을 누르면 cancel 과 같다.
"use client";

import { useEffect, useRef } from "react";

type Props = {
  title: string;
  body: string;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ConfirmDialog({ title, body, cancelLabel, confirmLabel, onCancel, onConfirm }: Props) {
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
        <p id="confirm-body" className="text-[15px] text-muted">
          {body}
        </p>
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
            className="min-h-10 rounded-[20px] bg-brand px-6 text-[15px] font-bold text-white hover:bg-brand-dark"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
