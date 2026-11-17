// 카드형 답변: 선배 한 명당 카드 한 장. (backend 응답의 structured 를 그린다)
//   headline  — 카드 위, 큰 글씨 ("창업 경험이 있는 선배가 3명 있어요.")
//   compare   — 그 아래 회색 한 줄 (선배들이 무엇에서 갈리는지)
//   카드들     — 흰 바탕 + 테두리 + 둥근 모서리. 카드 사이 20px
//   closing   — 카드 아래, 연한 블루 상자 (다음에 해 볼 것)
// 출처는 카드마다 그 카드 아래쪽에만 둔다. 답변 맨 아래에 따로 모으지 않는다 (같은 정보가 두 번 나오지 않게).
import type { AnswerCard, Source, StructuredAnswer } from "@/lib/api";

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

// 카드 아래쪽 출처 문구. 제목은 공개 등급 L3 글에만 온다. 예: "2024년 4월 글", "2024년 4월 · 「글 제목」"
function cardSourceLabel(source: Source) {
  const when = source.date ? formatSourceDate(source.date) : null;
  if (source.title) return [when, `「${source.title}」`].filter(Boolean).join(" · ");
  return when ? `${when} 글` : "선배 글";
}

// 아바타 자리. 선배 그림(card.avatar_id = "avatar-1"~"avatar-8")이 준비되기 전까지는 카드 순번을 동그란 배지로 보여준다.
// 나중에 그림이 생기면 이 안만 바꾸면 된다 (자리 크기 40px 는 그대로).
function CardAvatar({ card, order }: { card: AnswerCard; order: number }) {
  return (
    <span
      aria-hidden="true"
      data-avatar={card.avatar_id}
      className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-brand bg-sky font-display text-lg text-brand"
    >
      {order}
    </span>
  );
}

function Card({ card, order, onOpenSource }: { card: AnswerCard; order: number; onOpenSource: Props["onOpenSource"] }) {
  // 별명은 공개 등급 L3 인 선배만 온다. 없으면 그 선배가 택한 길(label)을 제목 자리에 올린다.
  const title = card.nickname ? `${card.nickname} 선배` : card.label;

  return (
    <li className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <article>
        <header className="flex items-start gap-3">
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

        <footer className="mt-4 flex flex-col gap-1 border-t border-line pt-3 text-xs leading-5 text-muted">
          {card.sources.map((source) => (
            <div key={source.interview_id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <button
                type="button"
                onClick={() => onOpenSource(source)}
                className="text-left underline-offset-4 hover:underline focus-visible:underline"
              >
                {cardSourceLabel(source)}
              </button>
              {/* 원문 주소는 공개 등급 L3 글에만 온다 (익명 글은 날짜만 보인다) */}
              {source.visibility === "L3" && source.url && (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-brand px-3 py-0.5 font-bold text-brand hover:bg-sky"
                >
                  원문 보기
                </a>
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
        <p className="mt-6 rounded-xl bg-sky px-5 py-4 text-[15px] leading-[1.7] text-ink">{answer.closing}</p>
      )}
    </section>
  );
}
