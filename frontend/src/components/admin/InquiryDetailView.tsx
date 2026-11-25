// 문의 상세 (와이어프레임 04-3 옆 패널 / 04-3-1 전체 화면)
// 학생 이름·메일, 멘토 이름, 보낸 일시, 멘토 답변 일시, 메일 제목·내용 + 답장 내역(오래된 것부터).
// 학생(미성년자) 개인정보가 보이는 곳이라 필요한 칸만 보여주고, 어디에도 로그로 남기지 않는다.
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminApiError, fetchInquiry, formatDateTime, reasonLabel, REPLY_STATUS_LABEL, type InquiryDetail } from "@/lib/adminApi";
import { CloseIcon, CollapseIcon, ExpandIcon } from "../icons";
import { ErrorNotice, StatusPill } from "./ui";

type Props = {
  id: string;
  mode: "panel" | "page";
  onClose?: () => void; // panel 에서 X
};

export default function InquiryDetailView({ id, mode, onClose }: Props) {
  // 어떤 문의의 결과인지 같이 기억해서, 다른 줄을 누르면 이전 내용 대신 '불러오는 중'을 보여준다
  const [result, setResult] = useState<{ id: string; data?: InquiryDetail; error?: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchInquiry(id)
      .then((data) => alive && setResult({ id, data }))
      .catch((err) => alive && setResult({ id, error: err instanceof AdminApiError ? err.message : "문의를 불러오지 못했어요." }));
    return () => {
      alive = false;
    };
  }, [id]);

  const current = result?.id === id ? result : null;
  const detail = current?.data;
  const iconButton = "flex size-9 items-center justify-center rounded-xl text-body hover:bg-sky hover:text-brand";

  return (
    <div className="flex flex-col">
      {/* 맨 위 막대 */}
      {mode === "panel" ? (
        <div className="flex items-center justify-between">
          <Link href={`/admin/inquiries/${encodeURIComponent(id)}`} aria-label="전체 화면으로 보기" title="전체 화면으로 보기" className={iconButton}>
            <ExpandIcon className="size-5" />
          </Link>
          <button type="button" onClick={onClose} aria-label="닫기" className={iconButton}>
            <CloseIcon className="size-5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Link href={`/admin/inquiries?open=${encodeURIComponent(id)}`} aria-label="옆 패널로 보기" title="옆 패널로 보기" className={iconButton}>
            <CollapseIcon className="size-5" />
          </Link>
          <nav aria-label="위치" className="flex items-center gap-1.5 text-[13px] text-muted">
            <Link href="/admin/inquiries" className="font-medium text-brand underline-offset-4 hover:underline">
              문의 목록
            </Link>
            <span aria-hidden="true">/</span>
            <span>{id}</span>
          </nav>
        </div>
      )}

      {/* 제목 */}
      <div className={`flex flex-col gap-1 ${mode === "page" ? "mt-5" : "mt-4"}`}>
        <h2 className={`font-bold text-ink ${mode === "page" ? "text-[26px] leading-[34px]" : "text-[20px] leading-7"}`}>문의 상세</h2>
        <p className="text-[13px] text-muted">{id}</p>
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
