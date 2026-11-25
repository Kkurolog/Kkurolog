// 출처 패널: 답변 아래 '출처 · …'를 누르면 화면 오른쪽에 열린다. (와이어프레임 02-2 주석)
// 어느 졸업생의 어떤 인터뷰 구간인지와 인용문을 보여준다.
// 공개 등급 L1(원문 비공개)이면 excerpt 가 null 이라 안내 문구만 보인다.
// 넓은 화면(lg)에서는 본문 옆에 붙고, 중간 화면에서는 오른쪽에서 겹쳐 뜨고,
// 휴대폰(sm 미만)에서는 아래에서 올라오는 시트로 뜬다 (뒤 어두운 배경을 누르면 닫힘).
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
    <>
      {/* 휴대폰 시트 뒤 어두운 배경 */}
      <div className="fixed inset-0 z-30 bg-ink/40 motion-safe:animate-fade-in sm:hidden" onClick={onClose} aria-hidden="true" />
      <aside
        aria-label="출처"
        className="fixed inset-x-0 bottom-0 z-40 flex max-h-[80dvh] flex-col gap-5 overflow-y-auto rounded-t-3xl border-t-2 border-brand bg-canvas px-5 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] motion-safe:animate-slide-up sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:max-h-none sm:w-full sm:max-w-[400px] sm:rounded-none sm:border-t-0 sm:border-l-2 sm:px-7 sm:py-6 sm:motion-safe:animate-slide-right lg:sticky lg:top-0 lg:z-10 lg:h-screen lg:shrink-0"
      >
        {/* 휴대폰 시트 손잡이 */}
        <span aria-hidden="true" className="-mt-2 mb-[-8px] h-1.5 w-10 self-center rounded-full bg-line sm:hidden" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[13px] font-bold text-brand">출처</p>
          <h2 className="mt-1 text-xl font-bold text-ink">{source.alumni}</h2>
          {/* 글 제목은 공개 등급 L3 글에만 온다 */}
          {source.title && <p className="mt-1 text-[15px] font-bold text-ink">「{source.title}」</p>}
          <p className="mt-1 text-sm text-muted">
            {source.interview_id}
            {source.date && ` · ${source.date}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="출처 닫기"
          className="-mt-1 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-brand hover:bg-sky"
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
    </>
  );
}
