// 선배별 답변: 선배 한 명당 묶음 하나. (backend 응답의 structured 를 그린다)
//   headline  — 맨 위, 큰 글씨 (질문에 대한 한 문장 답)
//   compare   — 그 아래 회색 한 줄 (선배들이 무엇에서 갈리는지)
//   선배 묶음  — 바탕·상자 없이 글로. 묶음 사이는 구분선 하나 + 선배 아바타로 구분한다
//               (구분선은 노트 바탕의 줄 하나를 굵게 만든 것처럼, 바탕 줄과 같은 자리에 놓인다 → RuledDivider)
//   closing   — 맨 아래 (다음에 해 볼 것)
// 흰 상자나 색 바탕을 두지 않는다. 다른 답변처럼 노트 줄 바탕 위에 글만 올린다 (디자인 통일).
// 출처는 카드마다 그 카드 아래쪽에만 둔다. 답변 맨 아래에 따로 모으지 않는다 (같은 정보가 두 번 나오지 않게).
"use client";

import { useLayoutEffect, useRef } from "react";
import type { AnswerCard, Source, StructuredAnswer } from "@/lib/api";
import { avatarSrc } from "@/lib/avatar";

type Props = {
  answer: StructuredAnswer;
  onOpenSource: (source: Source) => void; // 카드의 출처를 눌렀을 때 (오른쪽 출처 패널이 열린다)
};

// 글 날짜를 읽기 쉽게. "2024-07-31" → "2024년 7월", "2021" → "2021년". 모양이 다르면 그대로 둔다.
export function formatSourceDate(date: string) {
  const match = /^(\d{4})(?:-(\d{1,2}))?/.exec(date);
  if (!match) return date;
  return match[2] ? `${match[1]}년 ${Number(match[2])}월` : `${match[1]}년`;
}

// 카드 아래쪽 출처 문구. 예: "#2024년 4월 글", 제목이 있으면 "#2024년 4월 글 · “글 제목”"
// 글 제목과 원문 주소는 backend 가 공개 등급 L3 글에만 보낸다 (제목과 원문에 졸업생 이름이 있어서, 익명 글에는 오지 않는다).
function cardSourceLabel(source: Source) {
  const when = source.date ? `#${formatSourceDate(source.date)} 글` : "#선배 글"; // 앞의 # 는 출처 표시
  return source.title ? `${when} · “${source.title}”` : when;
}

// 선배 아바타. card.avatar_id("avatar-1"~"avatar-7")에 맞는 그림(public/avatars)을 48px 동그라미로 보여준다.
// 같은 선배는 어느 답변에서든 같은 그림이다 (번호는 backend 가 정한다).
// 번호를 모르면(그림이 없으면) 예전처럼 카드 순번을 동그란 배지로 보여준다.
// 바로 옆 제목에 내용이 있으니 화면 읽기 프로그램에는 읽히지 않게 한다 (alt="", aria-hidden).
function CardAvatar({ card, order }: { card: AnswerCard; order: number }) {
  const src = avatarSrc(card.avatar_id);
  if (src) {
    // 작은 SVG 파일이라 next/image 의 최적화가 필요 없다 → 일반 img 를 쓴다
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" aria-hidden="true" width={48} height={48} className="size-12 shrink-0 rounded-full" />;
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-brand bg-sky font-display text-lg text-brand"
    >
      {order}
    </span>
  );
}

// 노트 줄 바탕(globals.css 의 paper-lines)은 64px 마다 1px 줄을 긋는다: 각 칸의 63~64px 자리.
const RULE_GAP = 64;
const DIVIDER_HEIGHT = 3; // 구분선 굵기. 바탕 줄(1px)을 가운데에 두고 위아래로 1px 씩 더 굵다
const DIVIDER_OFFSET = RULE_GAP - 1 - (DIVIDER_HEIGHT - 1) / 2; // 구분선의 윗변이 놓일 자리 (칸 안에서 62px)

// 선배와 선배 사이의 구분선. 새 줄을 따로 긋는 게 아니라, **노트 바탕의 줄 하나를 굵게 만든 것처럼** 보이게 한다.
// 글의 높이는 64px 단위로 떨어지지 않아서 CSS 만으로는 줄 위치를 맞출 수 없다.
// 그래서 화면에 그려진 뒤 자기 위치를 재고, 바로 아래에 있는 바탕 줄까지 위쪽 여백을 늘려 내려앉는다.
// 창 크기가 바뀌거나 글이 다시 줄바꿈되면(ResizeObserver) 다시 맞춘다. 노트 바탕 밖에서는 그냥 보통 구분선이다.
function RuledDivider() {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const paper = el?.closest<HTMLElement>(".paper-lines");
    if (!el || !paper) return;

    const snap = () => {
      el.style.marginTop = "0px";
      const y = el.getBoundingClientRect().top - paper.getBoundingClientRect().top; // 노트 바탕 맨 위에서부터의 거리
      const target = Math.ceil((y - DIVIDER_OFFSET) / RULE_GAP) * RULE_GAP + DIVIDER_OFFSET;
      el.style.marginTop = `${target - y}px`;
    };
    snap();
    // 위쪽 구분선이 먼저 등록되므로, 다시 맞출 때도 위에서 아래 순서로 맞춰진다
    const observer = new ResizeObserver(snap);
    observer.observe(paper);
    // 새 답변은 아래에서 살짝 올라오는 움직임(rise-in)과 함께 나타난다. 움직이는 동안 잰 위치는 몇 px 어긋나므로
    // 움직임이 끝나면 한 번 더 맞춘다
    paper.addEventListener("animationend", snap);
    return () => {
      observer.disconnect();
      paper.removeEventListener("animationend", snap);
    };
  }, []);

  return <div ref={ref} aria-hidden="true" className="bg-line" style={{ height: DIVIDER_HEIGHT }} />;
}

function Card({ card, order, onOpenSource }: { card: AnswerCard; order: number; onOpenSource: Props["onOpenSource"] }) {
  // 별명은 공개 등급 L3 인 선배만 온다. 없으면 그 선배가 택한 길(label)을 제목 자리에 올린다.
  const title = card.nickname ? `${card.nickname} 선배` : card.label;

  return (
    // 바탕·상자 없이 그린다 (흰 상자는 노트 줄 바탕을 가려서 다른 답변과 어울리지 않는다).
    // 선배와 선배 사이에만 구분선을 둔다 (첫 번째 선배 위에는 두지 않는다).
    <li className="flex flex-col gap-5">
      {order > 1 && <RuledDivider />}
      <article>
        <header className="flex items-center gap-3.5">
          <CardAvatar card={card} order={order} />
          <div className="min-w-0">
            <h3 className="text-lg leading-7 font-bold break-keep text-ink">{title}</h3>
            {card.nickname && <p className="text-[15px] leading-6 break-keep text-body">{card.label}</p>}
            {/* 지금 무엇을 하는지 한 줄. 글에 없으면(null) 줄 자체를 그리지 않는다 */}
            {card.one_liner && <p className="text-sm leading-6 break-keep text-muted">{card.one_liner}</p>}
          </div>
        </header>

        {/* 본문 조각마다 문단 하나 (조각 사이 12px). 두 줄짜리 문장이라 점(·) 목록으로 그리지 않는다 */}
        <div className="mt-4 flex flex-col gap-3 text-[15px] leading-[1.7] break-keep text-ink">
          {card.body.map((piece, i) => (
            <p key={i}>{piece}</p>
          ))}
        </div>

        <footer className="mt-3 flex flex-col gap-1 text-xs leading-5 text-muted">
          {card.sources.map((source) => (
            <div key={source.interview_id}>
              {source.visibility === "L3" && source.url ? (
                // 원문 주소가 있으면(공개 등급 L3): 누르면 원문 글이 새 탭으로 열린다
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="break-keep text-brand underline-offset-4 hover:underline focus-visible:underline"
                >
                  {cardSourceLabel(source)}
                </a>
              ) : (
                // 원문 주소가 없으면(익명 글): 예전처럼 오른쪽 출처 패널을 연다 ("원문이 공개되지 않아요" 안내)
                <button
                  type="button"
                  onClick={() => onOpenSource(source)}
                  className="text-left underline-offset-4 hover:underline focus-visible:underline"
                >
                  {cardSourceLabel(source)}
                </button>
              )}
            </div>
          ))}
        </footer>
      </article>
    </li>
  );
}

export default function AnswerCards({ answer, onOpenSource }: Props) {
  return (
    <section className="flex flex-col text-ink">
      {answer.headline && <h2 className="mb-1 text-[22px] leading-8 font-bold">{answer.headline}</h2>}
      {answer.compare && <p className="text-[15px] leading-6 text-muted">{answer.compare}</p>}

      <ul className="mt-5 flex flex-col gap-5">
        {answer.cards.map((card, i) => (
          <Card key={card.id} card={card} order={i + 1} onOpenSource={onOpenSource} />
        ))}
      </ul>

      {answer.closing && (
        <div className="mt-5 flex flex-col gap-5">
          <RuledDivider />
          <p className="text-[15px] leading-[1.7] text-ink">{answer.closing}</p>
        </div>
      )}
    </section>
  );
}
