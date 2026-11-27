// 메인 화면 (주소 "/"): 꾸로록과 대화하는 채팅 화면.
// - 대화 전(와이어프레임 01, Figma '메인페이지_너울'): 가운데에 인사 문구 + 입력창. 입력창 아래에 해시태그 스티커, 맨 아래에 꾸로록 캐릭터(노란 돔 + 눈).
//   입력창을 누르면(질문 입력 시) 스티커들이 아래로 떨어지며 노란 돔 뒤로 숨는다.
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
import { KkuroEyes } from "@/components/Kkuro";
import LoadingStatus from "@/components/LoadingStatus";
import QuestionForm from "@/components/QuestionForm";
import SourcePanel from "@/components/SourcePanel";
import { SparkleIcon } from "@/components/icons";
import type { Mentor, Source } from "@/lib/api";
import { useChat } from "@/lib/useChat";
import { useKeyboardOpen } from "@/lib/useKeyboardOpen";
import { useMediaQuery } from "@/lib/useMediaQuery";

// 입력창 아래에 놓인 해시태그 스티커 (꾸밈용, 넓은 화면에서만 보인다). 각자 다른 박자로 둥실둥실 떠 있다.
// 자리는 Figma '꾸로록 메인 — 1' 기준: x = 입력창 폭에 대한 스티커 가운데 위치(%), y = 입력창 아래에서 스티커 가운데까지(px)
const STICKERS = [
  { label: "#거꾸로캠퍼스", x: "13.6%", y: 59, className: "-rotate-[8deg] bg-accent", delay: "0s" },
  { label: "#창업", x: "37.8%", y: 72, className: "rotate-[8deg] bg-surface", delay: "-1.2s" },
  { label: "#진로 고민", x: "59.8%", y: 50, className: "-rotate-[9deg] bg-accent", delay: "-2.4s" },
  { label: "#대학 말고 다른 길", x: "86.3%", y: 69, className: "rotate-[7deg] bg-surface", delay: "-0.6s" },
];

// 꾸로록 캐릭터(노란 반원)를 누를 때마다 차례로 입력창에 써 주는 추천 질문.
// 추천한 질문이 "답하기 어려워요"로 끝나면 안 되므로, 검색 측정에서 맞는 선배의 글이 전달된 질문으로 골랐다
// (docs/proposals/answer-quality-audit.md 0장, 2026-11-18. backend/app/rag/intent.py 의 예시 질문과 같은 기준).
// 문장을 조금만 바꿔도 검색 결과가 달라지니, 바꾸려면 backend 담당과 다시 측정한다.
const SUGGESTED_QUESTIONS = [
  "꾸로록, 자기소개 부탁해!",
  "엑시트하고 바로 취업한 선배는 왜 대학 대신 회사를 골랐어요?",
  "직접 브랜드나 사업을 시작한 선배는 어떻게 시작했어요?",
  "진로를 아직 못 정했는데, 선배들은 이럴 때 어떻게 했어?",
  "해외 대학 입시를 준비한 선배들은 어떻게 준비했어요?",
];

const TYPING_SPEED_MS = 45; // 추천 질문을 한 글자씩 쓰는 간격

// 대화 전 화면 아래쪽의 꾸로록 캐릭터("빼꼼 꾸로록"): 노란 돔 + 큰 눈 두 개.
// - 기본: 정면을 보며 가끔 깜빡인다
// - 듣는 중: 입력창에 초점이 있거나 글을 쓰는 동안 눈동자가 입력창의 글 끝을 따라간다
// 누르면 추천 질문을 입력창에 써 준다. 마우스를 올리면 살짝 올라오고 안내 문구가 바뀐다.
function KkuroCharacter({
  onClick,
  typing,
  listening,
  lookX,
}: {
  onClick: () => void;
  typing: boolean;
  listening: boolean;
  lookX: number;
}) {
  // 휴대폰에서는 화면 높이에 맞춰 반원이 보이는 높이·눈 크기를 줄인다 (작은 화면에서 입력창과 겹치지 않게)
  return (
    // z-10: 입력창 아래 스티커(z-0)가 떨어질 때 이 돔 뒤로 숨는다
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[clamp(120px,24dvh,200px)] overflow-hidden lg:h-[267px]">
      <button
        type="button"
        onClick={onClick}
        aria-label="꾸로록에게 추천 질문 받기 (입력창에 질문이 써져요)"
        className="group pointer-events-auto absolute top-2 left-1/2 size-[900px] -translate-x-1/2 cursor-pointer sm:size-[1100px] rounded-full bg-accent transition-transform duration-300 ease-out hover:-translate-y-2 focus-visible:-translate-y-2 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-brand active:translate-y-0 lg:size-[1504px]"
      >
        <KkuroEyes
          mood={listening ? "listening" : "default"}
          lookX={lookX}
          className="absolute top-[clamp(12px,3dvh,32px)] left-1/2 h-[clamp(60px,13dvh,104px)] -translate-x-1/2 lg:top-12 lg:h-[140px]"
        />
        <span className="absolute top-[calc(clamp(120px,24dvh,200px)-40px)] left-1/2 -translate-x-1/2 text-sm font-bold whitespace-nowrap text-brand sm:text-[15px] lg:top-[218px]">
          <span className="group-hover:hidden group-focus-visible:hidden">
            {typing ? "꾸로록이 질문을 쓰고 있어요" : "꾸로록이 듣고 있어요"}
          </span>
          <span className="hidden group-hover:inline group-focus-visible:inline">눌러서 추천 질문 받기</span>
        </span>
      </button>
    </div>
  );
}

// 입력창 아래 해시태그 스티커. tucked 이면 아래로 떨어지며 사라진다 (꾸로록 돔 뒤로 숨음).
// 겹 세 개: ① 자리 잡기(transform) ② 떨어지기(translate·opacity 전환) ③ 기울기(rotate)·둥실(animate-float 의 translate)
function Stickers({ tucked }: { tucked: boolean }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-full hidden lg:block">
      {STICKERS.map((s, i) => (
        <span
          key={s.label}
          className={`absolute z-0 block transition-[translate,opacity] duration-500 motion-reduce:transition-none ${
            tucked ? "translate-y-48 opacity-0 ease-in" : "translate-y-0 opacity-100 ease-out"
          }`}
          style={{ left: s.x, top: s.y, transform: "translate(-50%, -50%)", transitionDelay: `${i * 60}ms` }}
        >
          <span
            className={`block rounded-full border-2 border-brand px-[18px] py-2 text-[15px] font-bold whitespace-nowrap text-brand motion-safe:animate-float ${s.className}`}
            style={{ animationDelay: s.delay }}
          >
            {s.label}
          </span>
        </span>
      ))}
    </div>
  );
}

export default function Home() {
  const { messages, loading, ask, homeVersion, currentId } = useChat();
  // 좁은 화면(휴대폰)에서는 입력창 안내 문구를 짧게 해서 한 줄에 들어가게 한다
  const narrow = useMediaQuery("(max-width: 639px)");
  // 휴대폰 키보드가 올라오면 노란 반원·귀퉁이를 숨겨서 입력창이 가려지지 않게 한다
  const keyboardOpen = useKeyboardOpen();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [openSource, setOpenSource] = useState<Source | null>(null); // 오른쪽 출처 패널 (null 이면 닫힘)
  // 메일 쓰기 창: 누구에게 보낼지. null 이면 닫힘 (내용 칸은 비워 두고 안내 문구만 보여준다)
  const [contact, setContact] = useState<{ mentor: Mentor } | null>(null);
  const [draft, setDraft] = useState(""); // 입력창에 쓰고 있는 질문
  // 다른 대화(최근 대화·새 채팅)로 옮기면 입력창을 비운다. 쓰던 질문이 다른 대화에 남지 않게
  // (effect 대신 그리는 중에 바꾸는 React 권장 방식: 대화가 바뀐 것을 기억해 두고 비교한다)
  const [draftConversation, setDraftConversation] = useState(currentId);
  if (draftConversation !== currentId) {
    setDraftConversation(currentId);
    setDraft("");
  }
  const [typing, setTyping] = useState(false); // 추천 질문을 자동으로 쓰는 중인지
  const [inputFocused, setInputFocused] = useState(false); // 입력창에 초점이 있는지 (꾸로록이 '듣는 중' 표정)
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
    // 입력창의 커서가 글 끝을 따라가며 깜빡인다. 휴대폰에서는 키보드가 미리 올라와 반원을 가리지 않게, 다 쓴 뒤에만 초점을 준다
    if (!narrow) inputRef.current?.focus();
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

  // 출처 패널은 '지금 보고 있는 대화'의 출처일 때만 보인다 (새 채팅·다른 대화를 열면 자동으로 닫힘)
  const sourcePanel =
    openSource &&
    messages.some((m) => m.role === "assistant" && m.sources.includes(openSource))
      ? openSource
      : null;

  // 대화 전: 인사 화면
  if (messages.length === 0) {
    // 질문을 입력하려 하면(입력창에 초점, 추천 질문을 쓰는 중, 쓴 글이 있음) 스티커가 아래로 떨어져 숨는다
    const stickersTucked = inputFocused || typing || draft.length > 0;
    return (
      <main className="paper-lines relative flex min-h-[480px] flex-1 flex-col items-center overflow-hidden px-5">
        {/* section 에는 z-index 를 주지 않는다: 그래야 스티커(z-0)가 꾸로록 돔(z-10) 뒤로 숨을 수 있다. 글·입력창은 z-20
            넓은 화면 윗여백: Figma(832px 높이)처럼 33vh. 키가 낮은 화면에서는 스티커가 돔에 가리지 않게 더 줄인다 (화면 높이 - 540px) */}
        <section className="relative flex w-full max-w-[680px] flex-col items-center gap-6 pt-[14dvh] text-center sm:pt-[22vh] lg:pt-[max(24px,min(33vh,calc(100dvh_-_540px)))]">
          {/* 넓은 화면(Figma)에는 이 안내 배지가 없다. 휴대폰·태블릿에서만 보인다 */}
          <p className="relative z-20 rounded-full border-2 border-brand bg-surface px-3 py-1 text-xs font-medium text-brand sm:px-4 sm:text-sm lg:hidden">
            거꾸로캠퍼스 선배들의 이야기로 답하는 챗봇
          </p>
          {/* 휴대폰에서는 '무엇을 함께 / 고민해볼까요?' 두 줄로 나눠서, 물결 밑줄이 '고민해볼' 아래에 오게 한다 */}
          <h1 className="relative z-20 font-display text-[30px] leading-[44px] text-brand sm:text-[44px] sm:leading-[48px]">
            <SparkleIcon className="absolute top-1 -left-14 hidden size-4 text-brand motion-safe:animate-twinkle sm:block" />
            무엇을 함께{" "}
            <br className="sm:hidden" />
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
          <div className="relative mt-4 w-full lg:mt-7">
            {/* 자동 초점(autoFocus)을 주지 않는다: 처음에는 스티커가 보이고, 입력창을 누르면 떨어지게 (Figma 메인 1 → 2) */}
            <div className="relative z-20">
              <QuestionForm
                value={draft}
                onChange={setDraft}
                onSubmit={ask}
                loading={loading}
                typing={typing}
                inputRef={inputRef}
                onFocusChange={setInputFocused}
                placeholder={narrow ? "자기소개를 부탁해 보세요!" : "처음이라면, 꾸로록에게 자기소개를 부탁해보세요!"}
              />
            </div>
            <Stickers tucked={stickersTucked} />
          </div>
        </section>

        {!keyboardOpen && (
          <KkuroCharacter
          onClick={fillSuggestion}
          typing={typing}
          listening={typing || inputFocused}
          // 글이 길어질수록 눈동자가 왼쪽 → 오른쪽으로 따라간다 (40자쯤에서 오른쪽 끝)
          lookX={-0.8 + 1.6 * Math.min(1, Array.from(draft).length / 40)}
          />
        )}
        {/* key: 로고를 누르면(homeVersion 이 바뀌면) 가이드를 새로 그려 닫힌 상태로 돌아간다 */}
        {!keyboardOpen && <GuidePage key={homeVersion} />}
      </main>
    );
  }

  // 대화 중
  return (
    <div className="flex min-w-0 flex-1">
      <main className="paper-lines flex min-w-0 flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-[680px] flex-1 flex-col gap-8 px-4 pt-6 pb-6 sm:px-5 sm:pt-12">
          {messages.map((message, i) => (
            <ChatMessageView
              key={message.id}
              message={message}
              isLatest={i === messages.length - 1}
              onOpenSource={setOpenSource}
              onContact={(mentor) => setContact({ mentor })}
              onAsk={ask} // 예시 질문 버튼: 입력창에서 보낸 것과 똑같이 바로 보낸다
              askDisabled={loading}
            />
          ))}
          {/* 생각 중: 꾸로록이 눈을 감고, 점 세 개가 통통 튀고, 시간이 지나면 문구가 바뀐다 */}
          {loading && <LoadingStatus />}
          <div ref={bottomRef} />
        </div>

        {/* 입력창은 화면 아래에 붙어 있게 한다 */}
        <div className="sticky bottom-0 bg-canvas">
          {/* 아이폰 홈 막대에 가리지 않게 아래쪽 안전 영역만큼 더 띄운다 */}
          <div className="mx-auto w-full max-w-[680px] px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-5 sm:pt-4 sm:pb-6">
            <QuestionForm
              value={draft}
              onChange={setDraft}
              onSubmit={ask}
              loading={loading}
              placeholder={narrow ? "선배들에게 물어보세요" : "선배들의 고민, 실패, 선택에 대해 물어보세요."}
            />
          </div>
        </div>
      </main>

      {sourcePanel && <SourcePanel key={sourcePanel.interview_id} source={sourcePanel} onClose={() => setOpenSource(null)} />}

      {contact && (
        <ContactModal
          key={contact.mentor.id} // 다른 멘토를 열면 입력칸을 새로 시작
          mentor={contact.mentor}
          onClose={() => setContact(null)}
        />
      )}
    </div>
  );
}
