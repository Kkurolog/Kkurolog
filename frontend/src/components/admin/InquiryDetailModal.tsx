// 문의 상세 창(모달). 문의 목록·확인 필요 표에서 줄을 누르면 뜬다.
// 모양은 학생 화면의 '메일 쓰기 창'(ContactModal)과 같은 톤: 720px (바탕은 흰색) + 파란 테두리 + 칸마다 옅은 파란 구분선.
// 휴대폰(sm 미만)에서는 아래에서 올라오는 시트. X·바깥 배경·Esc 로 닫는다.
// 내용: 메일 제목·문의번호·답장 여부 → 학생 이름·메일, 멘토 이름, 보낸 일시, 멘토 답변 일시 → 메일 내용 → 답장 내역(오래된 것부터).
// 학생(미성년자) 개인정보가 보이는 곳이라 필요한 칸만 보여주고, 어디에도 로그로 남기지 않는다.
"use client";

import { useEffect, useRef, useState } from "react";
import { AdminApiError, fetchInquiry, formatDateTime, reasonLabel, REPLY_STATUS_LABEL, type InquiryDetail } from "@/lib/adminApi";
import { CloseIcon } from "../icons";
import { ErrorNotice, StatusPill } from "./ui";

type Props = {
  id: string;
  onClose: () => void;
};

const rowPad = "px-5 py-4 sm:px-8 sm:py-5";

export default function InquiryDetailModal({ id, onClose }: Props) {
  // 어떤 문의의 결과인지 같이 기억해서, 다른 문의를 열면 이전 내용 대신 '불러오는 중'을 보여준다
  const [result, setResult] = useState<{ id: string; data?: InquiryDetail; error?: string } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetchInquiry(id)
      .then((data) => alive && setResult({ id, data }))
      .catch((err) => alive && setResult({ id, error: err instanceof AdminApiError ? err.message : "문의를 불러오지 못했어요." }));
    return () => {
      alive = false;
    };
  }, [id]);

  // 열리면 창 자체에 초점 (화면 읽기 프로그램이 창을 읽고, Tab 으로 닫기 버튼부터 갈 수 있게)
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // Esc 로 닫기 + 창이 열려 있는 동안 뒤 화면은 스크롤되지 않게
  useEffect(() => {
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
    // 바깥 어두운 배경. 누르면 닫기
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 motion-safe:animate-fade-in sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="inquiry-title"
        className="relative flex h-[92dvh] w-full max-w-[720px] flex-col overflow-hidden rounded-t-3xl border-2 border-b-0 border-brand bg-surface motion-safe:animate-slide-up sm:h-[720px] sm:max-h-[calc(100dvh-32px)] sm:rounded-3xl sm:border-b-2 sm:motion-safe:animate-pop-in focus:outline-none"
        onClick={(e) => e.stopPropagation()} // 창 안쪽을 눌렀을 때는 닫히지 않게
      >
        {/* 머리: 답장 여부·문의번호 + 메일 제목, 오른쪽 X */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 sm:gap-4 sm:px-8 sm:pt-7 sm:pb-6">
          <div className="flex min-w-0 flex-col gap-2 pt-1">
            <div className="flex items-center gap-2">
              {detail && <StatusPill replied={detail.item.replied} />}
              <span className="text-[13px] text-muted">{id}</span>
            </div>
            <h2 id="inquiry-title" className="text-lg font-bold break-words text-ink sm:text-xl">
              {detail ? detail.item.title : "문의 상세"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-brand hover:bg-sky"
          >
            <CloseIcon className="size-6" />
          </button>
        </div>

        {/* 본문 (길면 이 안에서만 스크롤) */}
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-brand/15 pb-[env(safe-area-inset-bottom)]">
          {!current && <p className={`${rowPad} text-[15px] text-muted`}>불러오는 중…</p>}
          {current?.error && (
            <div className={rowPad}>
              <ErrorNotice message={current.error} />
            </div>
          )}

          {detail && (
            <>
              <dl className="divide-y divide-brand/15">
                <InfoRow label="학생" value={`${detail.item.student_name} · ${detail.item.student_email}`} />
                <InfoRow label="멘토" value={detail.item.mentor_name ?? `${detail.item.mentor_id} (지워진 멘토)`} />
                <InfoRow label="보낸 일시" value={formatDateTime(detail.item.created_at)} />
                <InfoRow label="멘토 답변 일시" value={formatDateTime(detail.item.replied_at)} />
                {detail.item.reminded_at && <InfoRow label="리마인드" value={formatDateTime(detail.item.reminded_at)} />}
              </dl>

              <section aria-label="메일 내용" className={`border-t border-brand/15 ${rowPad}`}>
                <p className="text-base leading-relaxed whitespace-pre-wrap text-ink">{detail.item.body}</p>
              </section>

              <section className={`flex flex-col gap-3 border-t border-brand/15 ${rowPad}`}>
                <h3 className="text-[15px] font-bold text-ink">답장 내역</h3>
                {detail.replies.length === 0 ? (
                  <p className="text-[14px] text-muted">아직 받은 답장이 없어요.</p>
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
    </div>
  );
}

// 메일 쓰기 창의 입력 칸처럼 한 줄씩 (왼쪽 이름표 + 값)
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={`flex gap-4 ${rowPad}`}>
      <dt className="w-[96px] shrink-0 text-[15px] text-muted sm:w-[110px]">{label}</dt>
      <dd className="min-w-0 text-[15px] break-all text-ink">{value}</dd>
    </div>
  );
}
