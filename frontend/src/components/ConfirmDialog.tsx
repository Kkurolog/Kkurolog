// 확인 창 (예: "새 채팅을 시작할까요?", "작성을 그만둘까요?")
// 왼쪽 버튼(cancelLabel)은 창만 닫고, 오른쪽 버튼(confirmLabel)은 실제 동작을 한다.
// Esc 키나 바깥 어두운 배경을 누르면 cancel 과 같다.
// tone="danger": 되돌릴 수 없는 동작(대화 지우기 등)용. 토마토색 경고 아이콘·테두리·버튼으로 크게 강조하고,
//                warning 문구를 굵은 경고 상자로 한 번 더 보여준다.
"use client";

import { useEffect, useRef } from "react";

type Props = {
  title: string;
  body: string;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  tone?: "default" | "danger";
  warning?: string; // danger 일 때 경고 상자에 넣을 문구
  detail?: string; // 무엇을 지우는지 (예: 대화 제목). 따옴표로 보여준다
};

export default function ConfirmDialog({
  title,
  body,
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
        className={`flex w-full max-w-[440px] flex-col gap-3 rounded-3xl border-2 bg-canvas px-8 pt-8 pb-7 motion-safe:animate-pop-in ${
          danger ? "border-danger" : "border-brand"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {danger && (
          // 경고 아이콘: 토마토색 동그라미 안에 느낌표
          <span
            aria-hidden="true"
            className="mb-1 inline-flex size-12 items-center justify-center rounded-full bg-danger/15 text-danger motion-safe:animate-pop-in"
          >
            <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M12 3.5 22 20.5H2z" strokeLinejoin="round" />
              <path d="M12 10v4.5" />
              <circle cx="12" cy="17.5" r="0.6" fill="currentColor" />
            </svg>
          </span>
        )}
        <h2 id="confirm-title" className="text-xl font-bold text-ink">
          {title}
        </h2>
        <div id="confirm-body" className="flex flex-col gap-3">
          {detail && (
            <p className="truncate rounded-xl bg-surface px-3 py-2 text-[15px] font-medium text-ink">“{detail}”</p>
          )}
          <p className="text-[15px] text-muted">{body}</p>
          {danger && warning && (
            <p className="rounded-xl border-l-4 border-danger bg-danger/10 px-3 py-2.5 text-[15px] font-bold text-ink">
              {warning}
            </p>
          )}
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
