// 채팅 메시지 하나를 그린다. (와이어프레임 02-1, 02-2)
// - 학생 질문: 오른쪽 정렬, 연한 블루(sky) 말풍선
// - 꾸로록 답변은 세 가지 모양 중 하나로 그린다:
//     1) 선배 이야기(structured 에 카드가 있음) → 선배별 카드 (AnswerCards). 출처는 카드 안에만
//     2) 꾸로록 자신에 대한 설명(aboutAspect 가 있음) → 설명 블록 + "꾸로록이 직접 알려드리는 내용이에요."
//     3) 그 외 → 글(문단) + 아래에 '출처 · …' 링크 (누르면 오른쪽에 출처 패널이 열린다)
//   예시 질문(followUps)이 있으면 답변 아래에 버튼으로 그린다.
// - 근거가 부족하면(hasEnoughEvidence=false) 안내 문구와 함께 이 경험을 가진 선배(멘토)를 보여준다.
import type { Mentor, Source } from "@/lib/api";
import type { ChatMessage } from "@/lib/types";
import AnswerCards, { formatSourceDate } from "./AnswerCards";
import { MiniKkuro } from "./Kkuro";
import MentorCard from "./MentorCard";

type Props = {
  message: ChatMessage;
  onOpenSource: (source: Source) => void; // 출처 링크를 눌렀을 때
  onContact: (mentor: Mentor) => void; // 멘토의 메일 버튼을 눌렀을 때 (메일 내용 칸은 비어 있는 채로 열린다)
  isLatest?: boolean; // 가장 최근 메시지인지 (방금 도착한 답변에는 '찾았다!' 꾸로록이 빼꼼 나온다)
  onAsk?: (question: string) => void; // 예시 질문 버튼을 눌렀을 때 (그 질문을 바로 보낸다)
  askDisabled?: boolean; // 답변을 기다리는 동안에는 예시 질문 버튼을 누를 수 없다
};

// 꾸로록 자신에 대한 설명(왜·누가 만들었는지 등) 아래에 붙이는 안내. 선배 글이 아니라 꾸로록이 하는 말이라는 표시다.
const ABOUT_NOTICE = "꾸로록이 직접 알려드리는 내용이에요.";

// 문단 안에 강조할 문장이 있으면 그 문장만 굵게 그린다. (backend 가 '어느 문장인지'를 emphasis 로 알려 준다)
function withEmphasis(paragraph: string, emphasis: string | null | undefined) {
  if (!emphasis) return paragraph;
  const at = paragraph.indexOf(emphasis);
  if (at < 0) return paragraph;
  return (
    <>
      {paragraph.slice(0, at)}
      <strong className="font-bold">{emphasis}</strong>
      {paragraph.slice(at + emphasis.length)}
    </>
  );
}

// 설명 블록에 그릴 문단만 고른다.
// backend 의 answer 글에는 (본문) + (예시 질문 문단) + (안내 한 줄)이 함께 들어 있다.
// 예시 질문은 버튼으로, 안내는 블록 아래 작은 글씨로 따로 그리므로 글에서는 뺀다 (같은 내용이 두 번 나오지 않게).
function aboutParagraphs(content: string, followUps: string[]) {
  return content.split(/\n\s*\n/).filter((paragraph) => {
    if (paragraph.trim() === ABOUT_NOTICE) return false;
    if (followUps.length > 0 && followUps.every((q) => paragraph.includes(q))) return false;
    return true;
  });
}

// 출처 링크 문구. (카드형 답변은 카드 안에 출처가 있어서 이 문구를 쓰지 않는다)
// - 제목이 있으면(L3): "출처 · 2024년 7월 · 「글 제목」 · 새벽"
// - 제목이 없으면(익명): "출처 · 2024년 7월 글 · 졸업생 (익명)"
// - 날짜도 없으면(demo): "출처 · 졸업생 A (demo) · demo-1"
export function sourceLabel(source: Source) {
  const when = source.date ? formatSourceDate(source.date) : null;
  if (source.title) return ["출처", when, `「${source.title}」`, source.alumni].filter(Boolean).join(" · ");
  if (when) return `출처 · ${when} 글 · ${source.alumni}`;
  return `출처 · ${source.alumni} · ${source.interview_id}`;
}

export default function ChatMessageView({
  message,
  onOpenSource,
  onContact,
  isLatest = false,
  onAsk,
  askDisabled = false,
}: Props) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end motion-safe:animate-rise-in">
        <p className="max-w-[85%] rounded-[20px] bg-sky px-5 py-3 text-[15px] leading-[26px] whitespace-pre-wrap text-ink">
          {message.content}
        </p>
      </div>
    );
  }

  if (message.isError) {
    return (
      <p role="alert" className="motion-safe:animate-rise-in border-l-4 border-danger py-1 pl-4 text-[15px] leading-[26px] text-ink">
        {message.content}
      </p>
    );
  }

  // 근거 부족: 지어내지 않고, 선배에게 직접 묻도록 안내한다.
  // 서버 쪽 문제(temporaryError)로 답하지 못한 경우는 "자료가 없다"고 하지 않는다. 자료는 있는데 잠깐 못 찾은 것이다.
  if (!message.hasEnoughEvidence) {
    return (
      <div className="flex flex-col gap-3.5 text-[15px] leading-[26px] text-ink motion-safe:animate-rise-in">
        <p>
          <span className="bg-[linear-gradient(transparent_55%,var(--color-butter)_55%)] font-bold">
            {message.temporaryError
              ? "지금 잠깐 문제가 생겼어요."
              : message.noMore
                ? "지금 찾을 수 있는 선배 이야기는 여기까지예요."
                : "지금 자료만으로는 답하기 어려워요."}
          </span>
        </p>
        {message.temporaryError ? (
          <p>
            잠시 후 같은 질문을 다시 보내 주세요. 기다리는 동안 비슷한 경험을 가진 선배에게 직접 물어볼 수도 있어요. 첫
            연락은 꾸로록이 대신 전달해요.
          </p>
        ) : (
          <p>
            {message.noMore ? "더 궁금한 점은 비슷한 경험을 가진" : "이 경험을 가진"} 선배에게 직접 물어볼 수 있어요. 첫
            연락은 꾸로록이 대신 전달해요.
          </p>
        )}
        {message.mentors.length > 0 && (
          <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-8 rounded-3xl border-2 border-brand bg-surface px-6 py-7 sm:grid-cols-3">
            {message.mentors.map((rec) => (
              <MentorCard
                key={rec.mentor.id}
                mentor={rec.mentor}
                reason={rec.reason}
                onContact={onContact}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // 답변을 어떤 모양으로 그릴지 고른다. 아래 3) 문단 표시는 지우면 안 된다:
  // 근거 부족·위기 안내·무관한 질문은 structured 가 없고, 예전 backend 는 structured 를 아예 보내지 않는다.
  const cards = message.structured && message.structured.cards.length > 0 ? message.structured : null;
  const isAbout = Boolean(message.aboutAspect);
  const followUps = message.followUps ?? [];

  return (
    <div className="flex flex-col gap-3.5 text-[15px] leading-[26px] text-ink motion-safe:animate-rise-in">
      {/* 방금 도착한 답변: 꾸로록이 눈을 반짝이며 빼꼼 (지난 답변은 기본 표정) */}
      <div className="flex items-end gap-2">
        <MiniKkuro mood={isLatest ? "found" : "default"} className="w-[72px] motion-safe:animate-pop-in" />
        <span className="pb-0.5 font-display text-xl text-brand">꾸로록</span>
      </div>
      {/* 1) 카드형 답변: 선배별 카드로 그린다. 출처는 카드 안에만 있으므로 아래 출처 목록은 그리지 않는다 */}
      {/* 감정이 담긴 진로 고민이면 카드 위에 한 줄로 먼저 받아 준다 ("막막한 게 당연해요. …") */}
      {cards && message.preface && <p>{message.preface}</p>}
      {cards && <AnswerCards answer={cards} onOpenSource={onOpenSource} />}

      {/* 2) 꾸로록 자신에 대한 설명: 다른 답변처럼 바탕 없이 글로 그린다 (흰 상자를 두지 않는다. 노트 줄 바탕을 가린다).
             선배 글이 아니라서 출처 대신 작은 안내 한 줄을 붙인다 */}
      {!cards && isAbout && (
        <>
          {aboutParagraphs(message.content, followUps).map((paragraph, i) => (
            <p key={i} className="whitespace-pre-wrap">
              {withEmphasis(paragraph, message.emphasis)}
            </p>
          ))}
          <p className="text-xs leading-5 text-muted">{ABOUT_NOTICE}</p>
        </>
      )}

      {/* 3) 그 외(근거 부족이 아닌 안내 문구·demo·예전 backend): 빈 줄로 나뉜 덩어리마다 문단 하나 (문단 사이 14px) */}
      {!cards &&
        !isAbout &&
        message.content.split(/\n\s*\n/).map((paragraph, i) => (
          <p key={i} className="whitespace-pre-wrap">
            {paragraph}
          </p>
        ))}

      {/* 다음에 물어볼 예시 질문: 누르면 그 질문을 바로 보낸다 */}
      {followUps.length > 0 && onAsk && (
        <ul className="flex flex-wrap gap-2">
          {followUps.map((question) => (
            <li key={question} className="max-w-full">
              <button
                type="button"
                onClick={() => onAsk(question)}
                disabled={askDisabled}
                className="max-w-full rounded-full border-2 border-brand px-4 py-1.5 text-left text-sm leading-6 font-bold text-brand hover:bg-sky focus-visible:bg-sky disabled:cursor-not-allowed disabled:opacity-50"
              >
                {question}
              </button>
            </li>
          ))}
        </ul>
      )}

      {!cards && !isAbout && message.sources.length > 0 && (
        <ul className="flex flex-col gap-1">
          {message.sources.map((source) => (
            <li key={source.interview_id} className="flex flex-col items-start">
              <button
                type="button"
                onClick={() => onOpenSource(source)}
                className="py-1.5 text-left text-brand underline-offset-4 hover:underline focus-visible:underline sm:py-0"
              >
                {sourceLabel(source)}
              </button>
              {/* 원문 주소는 공개 등급 L3 글에만 온다 (익명 글은 링크가 없다) */}
              {source.url && (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm break-all text-brand underline underline-offset-4"
                >
                  원문 보기: {source.url}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
