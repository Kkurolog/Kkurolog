// 문의 상세 팝업 (문의 목록·확인필요 목록에서 줄을 누르면 화면 가운데에 뜬다)
// 학생 이름·메일, 멘토 이름, 보낸 일시, 멘토 답변 일시, 메일 제목·내용 + 답장 내역(오래된 것부터).
// 학생(미성년자) 개인정보가 보이는 곳이라 필요한 칸만 보여주고, 어디에도 로그로 남기지 않는다.
// 예전에는 '목록 → 옆 패널 → 전체 화면' 세 단계였는데, 한 단계(팝업)로 줄였다 (2026-11-27).
// 닫기: X 버튼, 바깥 배경, Esc. 휴대폰에서는 아래에서 올라오는 시트로 뜬다.
"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AdminApiError, fetchInquiry, formatDateTime, reasonLabel, REPLY_STATUS_LABEL, type InquiryDetail } from "@/lib/adminApi";
import { CloseIcon } from "../icons";
import { ErrorNotice, StatusPill } from "./ui";

type Props = {
  id: string;
  onClose: () => void;
};

export default function InquiryDetailModal({ id, onClose }: Props) {
  // 어떤 문의의 결과인지 같이 기억해서, 다른 문의를 열면 이전 내용 대신 '불러오는 중'을 보여준다
  const [result, setResult] = useState<{ id: string; data?: InquiryDetail; error?: string } | null>(null);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    fetchInquiry(id)
      .then((data) => alive && setResult({ id, data }))
      .catch((err) => alive && setResult({ id, error: err instanceof AdminApiError ? err.message : "문의를 불러오지 못했어요." }));
    return () => {
      alive = false;
    };
  }, [id]);

  // 열리면 닫기 버튼에 초점 (키보드로 바로 닫을 수 있게), Esc 로 닫기, 뒤 화면 스크롤 막기
  useEffect(() => {
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const current = result?.id === id ? result : null;
  const detail = current?.data;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 motion-safe:animate-fade-in sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-[680px] flex-col overflow-y-auto rounded-t-3xl bg-surface px-6 pt-5 pb-[calc(2rem+env(safe-area-inset-bottom))] motion-safe:animate-slide-up sm:max-h-[88dvh] sm:rounded-3xl sm:border-2 sm:border-brand sm:px-10 sm:pt-8 sm:pb-10 sm:motion-safe:animate-pop-in"
      >
        {/* 제목 + 닫기 */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 id={titleId} className="text-[20px] leading-7 font-bold text-ink">
              문의 상세
            </h2>
            <p className="text-[13px] text-muted">{id}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="-mt-1 -mr-2 flex size-10 shrink-0 items-center justify-center rounded-xl text-body hover:bg-sky hover:text-brand"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>

        {!current && <p className="mt-8 text-[14px] text-muted">불러오는 중…</p>}
        {current?.error && (
          <div className="mt-6">
            <ErrorNotice message={current.error} />
          </div>
        )}

        {detail && (
          <>
            <div className="mt-4">
              <StatusPill replied={detail.item.replied} />
            </div>

            <dl className="mt-5 flex flex-col gap-2 text-[13px]">
              <InfoRow label="학생 이름" value={detail.item.student_name} />
              <InfoRow label="학생 메일" value={detail.item.student_email} />
              <InfoRow label="멘토 이름" value={detail.item.mentor_name ?? `${detail.item.mentor_id} (지워진 멘토)`} />
              <InfoRow label="보낸 일시" value={formatDateTime(detail.item.created_at)} />
              <InfoRow label="멘토 답변 일시" value={formatDateTime(detail.item.replied_at)} />
              {detail.item.reminded_at && <InfoRow label="리마인드 보낸 일시" value={formatDateTime(detail.item.reminded_at)} />}
            </dl>

            <hr className="my-5 border-line" />

            <section className="flex flex-col gap-1">
              <h3 className="text-[12px] text-muted">메일 제목</h3>
              <p className="text-[15px] font-bold text-ink">{detail.item.title}</p>
            </section>
            <section className="mt-5 flex flex-col gap-1">
              <h3 className="text-[12px] text-muted">메일 내용</h3>
              <p className="text-[14px] leading-6 whitespace-pre-wrap text-body">{detail.item.body}</p>
            </section>

            <hr className="my-5 border-line" />

            <section className="flex flex-col gap-3">
              <h3 className="text-[15px] font-bold text-ink">답장 내역</h3>
              {detail.replies.length === 0 ? (
                <p className="text-[13px] text-muted">아직 받은 답장이 없어요.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {[...detail.replies]
                    .sort((a, b) => Date.parse(a.received_at) - Date.parse(b.received_at))
                    .map((reply) => (
                      <li
                        key={reply.message_id}
                        className={`flex flex-col gap-2 rounded-2xl px-4 py-4 ${reply.status === "forwarded" ? "bg-sky" : "border border-line bg-butter/60"}`}
                      >
                        <p className="text-[12px] text-muted">
                          {formatDateTime(reply.received_at)} · <span className="font-bold text-body">{REPLY_STATUS_LABEL[reply.status]}</span>
                          {reply.status !== "forwarded" && reply.reason && <> · {reasonLabel(reply.reason)}</>}
                        </p>
                        {reply.status !== "forwarded" && <p className="text-[12px] text-muted">보낸 주소: {reply.from_email}</p>}
                        <p className="text-[14px] leading-6 whitespace-pre-wrap text-ink">
                          {reply.reply_text || <span className="text-muted">전달한 본문이 없어요.</span>}
                        </p>
                      </li>
                    ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-[110px] shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 break-all text-ink">{value}</dd>
    </div>
  );
}
