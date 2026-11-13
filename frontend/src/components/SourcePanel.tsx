// 출처 패널: 답변 아래 '출처 · …'를 누르면 화면 오른쪽에 열린다. (와이어프레임 02-2 주석)
// 어느 졸업생의 어떤 인터뷰 구간인지와 인용문을 보여준다.
// 공개 등급 L1(원문 비공개)이면 excerpt 가 null 이라 안내 문구만 보인다.
// 넓은 화면에서는 본문 옆에 붙고, 좁은 화면에서는 화면 위에 겹쳐 뜬다.
// 나중에: 인터뷰의 해당 구간 앞뒤 맥락까지 보여주기.
"use client";

import { useEffect } from "react";
import type { Source } from "@/lib/api";
import { CloseIcon } from "./icons";

export default function SourcePanel({ source, onClose }: { source: Source; onClose: () => void }) {
  // Esc 키로 닫기
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <aside
      aria-label="출처"
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[400px] flex-col gap-5 overflow-y-auto border-l-2 border-brand bg-canvas px-7 py-6 lg:sticky lg:top-0 lg:z-10 lg:h-screen lg:shrink-0"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[13px] font-bold text-brand">출처</p>
          <h2 className="mt-1 text-xl font-bold text-ink">{source.alumni}</h2>
          <p className="mt-1 text-sm text-muted">
            {source.interview_id}
            {source.date && ` · ${source.date}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="출처 닫기"
          className="-mt-1 -mr-2 inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-brand hover:bg-sky"
        >
          <CloseIcon className="size-6" />
        </button>
      </div>

      {source.excerpt ? (
        <blockquote className="rounded-2xl border-l-4 border-accent bg-surface px-5 py-4 text-[15px] leading-[26px] text-ink">
          “{source.excerpt}”
        </blockquote>
      ) : (
        <p className="rounded-2xl bg-sky px-5 py-4 text-sm leading-relaxed text-body">
          이 인터뷰는 원문이 공개되지 않아요. 답변에는 내용만 참고했어요.
        </p>
      )}

      {source.url && (
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer"
          className="self-start rounded-[20px] border-2 border-brand px-5 py-2 text-sm font-bold text-brand hover:bg-sky"
        >
          원문 보기
        </a>
      )}
    </aside>
  );
}
