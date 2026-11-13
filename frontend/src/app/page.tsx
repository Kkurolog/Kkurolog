// 메인 화면 (주소 "/"): 꾸로록과 대화하는 채팅 화면.
// - 대화 전(와이어프레임 01): 가운데에 인사 문구 + 입력창. 아래에 꾸로록 캐릭터(노란 돔 + 눈)와 해시태그 스티커.
//   캐릭터를 누르면 추천 질문이 입력창에 한 글자씩 써진다.
//   오른쪽 아래 접힌 귀퉁이를 넘기면 꾸로록 사용 가이드가 나온다 (GuidePage).
// - 대화 중(02-0 ~ 02-2): 680px 폭으로 메시지가 위에서 아래로 쌓이고, 입력창은 화면 아래에 붙는다.
// - 답변의 '출처 · …'를 누르면 오른쪽에 출처 패널(SourcePanel)이 열린다.
// 대화 상태는 lib/useChat.ts 에서 관리한다.
"use client";

import { useEffect, useRef, useState } from "react";
import ChatMessageView from "@/components/ChatMessageView";
import ContactModal from "@/components/ContactModal";
import GuidePage from "@/components/GuidePage";
import QuestionForm from "@/components/QuestionForm";
import SourcePanel from "@/components/SourcePanel";
import { SparkleIcon } from "@/components/icons";
import type { Mentor, Source } from "@/lib/api";
import { useChat } from "@/lib/useChat";

// 메인 화면 주변에 붙은 해시태그 스티커 (꾸밈용, 넓은 화면에서만 보인다). 각자 다른 박자로 둥실둥실 떠 있다
const STICKERS = [
  { label: "#진로 고민", className: "top-[20%] left-[14%] -rotate-[8deg] bg-accent", delay: "0s" },
  { label: "#창업", className: "top-[24%] right-[16%] rotate-[8deg] bg-surface", delay: "-1.2s" },
  { label: "#대학 말고 다른 길", className: "top-[61%] left-[8%] rotate-[6deg] bg-surface", delay: "-2.4s" },
  { label: "#실패해도 괜찮아", className: "top-[55%] right-[10%] -rotate-[6deg] bg-accent", delay: "-0.6s" },
];

// 꾸로록 캐릭터(노란 반원)를 누를 때마다 차례로 입력창에 써 주는 추천 질문
const SUGGESTED_QUESTIONS = [
  "꾸로록, 자기소개 부탁해!",
  "대학을 바로 가지 않고 취업한 선배들은 왜 그렇게 선택했어?",
  "엑시트 후 바로 창업한 선배들은 어떤 고민을 했어?",
  "진로를 아직 못 정했는데, 선배들은 이럴 때 어떻게 했어?",
  "해외 대학에 간 선배들은 언제부터 준비했어?",
];

const TYPING_SPEED_MS = 45; // 추천 질문을 한 글자씩 쓰는 간격

// 대화 전 화면 아래쪽의 꾸로록 캐릭터: 노란 돔 + 큰 눈 두 개.
// 누르면 추천 질문을 입력창에 써 준다. 마우스를 올리면 살짝 올라오고 안내 문구가 바뀐다.
function KkuroCharacter({ onClick, typing }: { onClick: () => void; typing: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[200px] overflow-hidden lg:h-[267px]">
      <button
        type="button"
        onClick={onClick}
        aria-label="꾸로록에게 추천 질문 받기 (입력창에 질문이 써져요)"
        className="group pointer-events-auto absolute top-2 left-1/2 size-[1100px] -translate-x-1/2 cursor-pointer rounded-full bg-accent transition-transform duration-300 ease-out hover:-translate-y-2 focus-visible:-translate-y-2 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-brand active:translate-y-0 lg:size-[1504px]"
      >
        {/* 눈: 주기적으로 깜빡이고, 마우스를 올리거나 질문을 쓰는 중에는 눈동자가 위(입력창)를 본다 */}
        <span aria-hidden="true" className="absolute top-8 left-1/2 flex -translate-x-1/2 gap-6 lg:top-12">
          {[0, 1].map((i) => (
            <span
              key={i}
              className="relative block h-[104px] w-[78px] rounded-[50%] border-4 border-brand bg-surface motion-safe:animate-blink lg:h-[140px] lg:w-[104px]"
            >
              <span
                className={`absolute left-1/2 block size-9 -translate-x-1/2 rounded-full bg-brand transition-all duration-300 lg:size-11 ${
                  typing ? "top-1" : "top-3 group-hover:top-1"
                }`}
              />
            </span>
          ))}
        </span>
        <span className="absolute top-[150px] left-1/2 -translate-x-1/2 text-[15px] font-bold whitespace-nowrap text-brand lg:top-[218px]">
          <span className="group-hover:hidden group-focus-visible:hidden">
            {typing ? "꾸로록이 질문을 쓰고 있어요" : "꾸로록이 듣고 있어요"}
          </span>
          <span className="hidden group-hover:inline group-focus-visible:inline">눌러서 추천 질문 받기</span>
        </span>
      </button>
    </div>
  );
}

export default function Home() {
  const { messages, loading, ask } = useChat();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [openSource, setOpenSource] = useState<Source | null>(null); // 오른쪽 출처 패널 (null 이면 닫힘)
  // 메일 쓰기 창: 누구에게, 어떤 질문을 미리 채울지. null 이면 닫힘
  const [contact, setContact] = useState<{ mentor: Mentor; question: string } | null>(null);
  const [draft, setDraft] = useState(""); // 입력창에 쓰고 있는 질문
  const [typing, setTyping] = useState(false); // 추천 질문을 자동으로 쓰는 중인지
  const suggestionIndex = useRef(0); // 다음에 써 줄 추천 질문 번호
  const typingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 화면을 떠날 때 쓰던 타이머를 정리한다
  useEffect(() => {
    return () => {
      if (typingTimer.current) clearInterval(typingTimer.current);
    };
  }, []);

  // 꾸로록 캐릭터를 누르면: 다음 추천 질문을 한 글자씩 입력창에 써 준다 (보내기는 학생이 직접)
  function fillSuggestion() {
    if (typingTimer.current) clearInterval(typingTimer.current);
    const question = SUGGESTED_QUESTIONS[suggestionIndex.current % SUGGESTED_QUESTIONS.length];
    suggestionIndex.current += 1;
    const chars = Array.from(question); // 한글도 한 글자씩 자른다

    // '동작 줄이기'를 켠 기기에서는 한 번에 써 준다
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDraft(question);
      inputRef.current?.focus();
      return;
    }

    let count = 0;
    setDraft("");
    setTyping(true);
    inputRef.current?.focus(); // 입력창의 커서가 글 끝을 따라가며 깜빡인다
    typingTimer.current = setInterval(() => {
      count += 1;
      setDraft(chars.slice(0, count).join(""));
      if (count >= chars.length) {
        if (typingTimer.current) clearInterval(typingTimer.current);
        typingTimer.current = null;
        setTyping(false);
        inputRef.current?.focus();
      }
    }, TYPING_SPEED_MS);
  }

  // 새 메시지가 생기면 맨 아래로 스크롤
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // 새 채팅으로 대화가 지워지면 출처 패널도 닫는다
  const sourcePanel = messages.length > 0 ? openSource : null;

  // 대화 전: 인사 화면
  if (messages.length === 0) {
    return (
      <main className="paper-lines relative flex min-h-screen flex-1 flex-col items-center overflow-hidden px-5">
        {STICKERS.map((s) => (
          // 기울기(rotate)와 둥실 움직임(translate)은 서로 다른 CSS 속성이라 함께 써도 된다
          <span
            key={s.label}
            aria-hidden="true"
            className={`absolute hidden rounded-full border-2 border-brand px-4 py-1.5 text-[15px] font-bold text-brand motion-safe:animate-float lg:block ${s.className}`}
            style={{ animationDelay: s.delay }}
          >
            {s.label}
          </span>
        ))}

        <section className="relative z-10 flex w-full max-w-[680px] flex-col items-center gap-6 pt-[22vh] text-center lg:pt-[30vh]">
          <p className="rounded-full border-2 border-brand bg-surface px-3 py-1 text-xs font-medium text-brand sm:px-4 sm:text-sm">
            거꾸로캠퍼스 선배들의 이야기로 답하는 챗봇
          </p>
          <h1 className="relative font-display text-[34px] leading-[48px] text-brand sm:text-[44px]">
            <SparkleIcon className="absolute top-1 -left-14 hidden size-4 text-brand motion-safe:animate-twinkle sm:block" />
            무엇을 함께{" "}
            <span className="relative inline-block">
              고민해볼
              <svg
                viewBox="0 0 150 14"
                aria-hidden="true"
                className="absolute -bottom-3 left-1/2 w-[110%] -translate-x-1/2 text-accent"
              >
                <path
                  d="M2 7c9-6 18-6 27 0s18 6 27 0 18-6 27 0 18 6 27 0 18-6 27 0 9 4 11 2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            까요?
            <SparkleIcon className="absolute -top-8 -right-16 hidden size-9 text-brand motion-safe:animate-twinkle sm:block [animation-delay:-1.2s]" />
          </h1>
          <div className="mt-4 w-full">
            <QuestionForm
              value={draft}
              onChange={setDraft}
              onSubmit={ask}
              loading={loading}
              typing={typing}
              inputRef={inputRef}
              placeholder="처음이라면, 꾸로록에게 자기소개를 부탁해보세요!"
              autoFocus
            />
          </div>
        </section>

        <KkuroCharacter onClick={fillSuggestion} typing={typing} />
        <GuidePage />
      </main>
    );
  }

  // 대화 중
  return (
    <div className="flex min-w-0 flex-1">
      <main className="paper-lines flex min-w-0 flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-[680px] flex-1 flex-col gap-8 px-5 pt-12 pb-6">
          {messages.map((message) => (
            <ChatMessageView
              key={message.id}
              message={message}
              onOpenSource={setOpenSource}
              onContact={(mentor, question) => setContact({ mentor, question })}
            />
          ))}
          {loading && (
            <div className="flex items-center gap-3" role="status">
              <span className="flex gap-1.5" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="block size-2 animate-dot rounded-full bg-brand"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </span>
              <p className="text-[15px] text-muted">답변을 준비하고 있어요...</p>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* 입력창은 화면 아래에 붙어 있게 한다 */}
        <div className="sticky bottom-0 bg-canvas">
          <div className="mx-auto w-full max-w-[680px] px-5 pt-4 pb-6">
            <QuestionForm
              value={draft}
              onChange={setDraft}
              onSubmit={ask}
              loading={loading}
              placeholder="선배들의 고민, 실패, 선택에 대해 물어보세요."
            />
          </div>
        </div>
      </main>

      {sourcePanel && <SourcePanel key={sourcePanel.interview_id} source={sourcePanel} onClose={() => setOpenSource(null)} />}

      {contact && (
        <ContactModal
          key={contact.mentor.id} // 다른 멘토를 열면 입력칸을 새로 시작
          mentor={contact.mentor}
          initialMessage={contact.question}
          onClose={() => setContact(null)}
        />
      )}
    </div>
  );
}
