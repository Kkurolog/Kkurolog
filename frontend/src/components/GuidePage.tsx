// 메인 화면 오른쪽 아래의 '접힌 종이 귀퉁이' + 그 뒤에 숨어 있는 꾸로록 사용 가이드.
// - 평소: 귀퉁이가 살짝 접혀 있다 (흰 접힌 면 + 뒷장의 블루와 '?'). 마우스를 올리면 조금 더 들린다.
// - 귀퉁이를 왼쪽 위로 끌면 종이가 넘어가듯 뒷장(가이드)이 드러난다. 충분히 끌고 놓으면 끝까지 넘어가고,
//   조금만 끌고 놓으면 제자리로 돌아간다. 귀퉁이(흰 접힌 면이나 블루 '?' 어디든)를 눌러도 넘어간다.
// - 가이드 왼쪽 위 ← 를 누르면 종이만 다시 덮인다.
// - 가이드에서 '시작하기'를 누르면 종이가 다시 덮이고 바로 질문을 쓸 수 있게 입력창에 커서가 간다.
//   Esc 를 누르면 종이만 다시 덮인다.
//
// 넘김 크기(peel): 오른쪽 아래 꼭짓점에서 접힌 선까지의 거리(px).
// 귀퉁이 꼭짓점이 (가로-peel, 세로-peel) 로 접혀 올라간다고 보고,
// 뒷장은 오른쪽 아래 삼각형만큼 보이고(clip-path), 접힌 면은 그 위의 삼각형으로 그린다.
"use client";

import { useEffect, useRef, useState } from "react";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { ArrowLeftIcon, CloseIcon } from "./icons";

// 평소 접힌 크기 / 마우스를 올렸을 때 크기. 휴대폰에서는 '꾸로록이 듣고 있어요'를 가리지 않게 작게
const SIZES = { wide: { rest: 96, hover: 128 }, narrow: { rest: 56, hover: 72 } };
const OPEN_RATIO = 0.3;
const HINT_KEY = "kkurolog-guide-hint-dismissed"; // 말풍선을 닫았는지 기억하는 브라우저 저장소 이름

// 브라우저 저장소는 막혀 있을 수도 있어서(시크릿 모드 등) 실패해도 화면이 멈추지 않게 감싼다
function hintDismissed() {
  try {
    return localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return false;
  }
}
function rememberHintDismissed() {
  try {
    localStorage.setItem(HINT_KEY, "1");
  } catch {
    // 저장이 안 되면 이번 방문 동안만 숨긴다
  }
} // 화면 짧은 변의 30% 이상 끌고 놓으면 끝까지 넘긴다

// 천천히 시작해 빨라졌다가 천천히 멈추는 곡선
function easeInOut(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export default function GuidePage() {
  const areaRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const cornerRef = useRef<HTMLButtonElement>(null);
  const frame = useRef<number | null>(null);
  const dragging = useRef(false);
  const moved = useRef(false); // 끌었는지(=클릭이 아닌지)
  const narrow = useMediaQuery("(max-width: 639px)");
  const { rest: REST, hover: HOVER } = narrow ? SIZES.narrow : SIZES.wide;
  // 넘김 크기. null 이면 '평소 접힌 크기(REST)' — 화면 크기가 바뀌면 그에 맞는 크기로 자동으로 따라간다
  const [peelState, setPeel] = useState<number | null>(null);
  const peel = peelState ?? REST;
  const [open, setOpen] = useState(false);
  const [showHint, setShowHint] = useState(false); // '넘겨서 사용 가이드 보기' 말풍선

  // 처음 온 학생에게만, 화면이 뜨고 잠시 뒤 말풍선을 띄운다
  useEffect(() => {
    const timer = setTimeout(() => setShowHint(!hintDismissed()), 900);
    return () => clearTimeout(timer);
  }, []);

  function dismissHint() {
    setShowHint(false);
    rememberHintDismissed();
  }

  // 화면(이 영역) 크기. 끝까지 넘기려면 가로+세로만큼 넘기면 된다
  function size() {
    const rect = areaRef.current?.getBoundingClientRect();
    return { w: rect?.width ?? 1200, h: rect?.height ?? 800, left: rect?.left ?? 0, top: rect?.top ?? 0 };
  }

  // peel 을 target 까지 부드럽게 바꾼다. '동작 줄이기'를 켠 기기에서는 바로 바꾼다
  // toRest: 끝나면 '평소 접힌 크기' 상태(null)로 돌려 둔다
  function animateTo(target: number, duration = 550, done?: () => void, toRest = false) {
    if (frame.current) cancelAnimationFrame(frame.current);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setPeel(toRest ? null : target);
      done?.();
      return;
    }
    const from = peelRef.current;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setPeel(from + (target - from) * easeInOut(t));
      if (t < 1) frame.current = requestAnimationFrame(step);
      else {
        frame.current = null;
        if (toRest) setPeel(null);
        done?.();
      }
    };
    frame.current = requestAnimationFrame(step);
  }

  // 애니메이션 중에도 최신 peel 값을 읽기 위해 ref 에도 담아 둔다
  const peelRef = useRef(peel);
  useEffect(() => {
    peelRef.current = peel;
  }, [peel]);

  function openGuide() {
    dismissHint(); // 가이드를 한 번 열었으면 말풍선은 더 필요 없다
    const { w, h } = size();
    animateTo(w + h, 650, () => setOpen(true));
  }

  // 가이드 닫기. startTyping 이면 다 덮인 뒤 질문 입력창으로 커서를 옮긴다 ('시작하기')
  function closeGuide(startTyping = false) {
    setOpen(false);
    animateTo(
      REST,
      650,
      () => {
        if (startTyping) document.getElementById("question")?.focus();
        else cornerRef.current?.focus();
      },
      true,
    );
  }

  // 다 넘어가면 가이드 제목으로 초점을 옮긴다 (화면 읽기 프로그램이 가이드부터 읽게)
  useEffect(() => {
    if (open) titleRef.current?.focus();
  }, [open]);

  // Esc 로 가이드 닫기
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeGuide();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  // 화면을 떠날 때 진행 중인 애니메이션 정리
  useEffect(() => {
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, []);

  // --- 귀퉁이 끌기 ---
  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (open) return;
    dragging.current = true;
    moved.current = false;
    if (frame.current) cancelAnimationFrame(frame.current);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!dragging.current) return;
    const { w, h, left, top } = size();
    // 꼭짓점이 손가락(마우스) 위치까지 접혀 올라간다고 보고, 가로·세로 거리의 평균으로 넘김 크기를 정한다
    const next = ((left + w - e.clientX) + (top + h - e.clientY)) / 2;
    if (Math.abs(next - peelRef.current) > 4) moved.current = true;
    setPeel(Math.max(REST, Math.min(next, w + h)));
  }

  function handlePointerUp() {
    if (!dragging.current) return;
    dragging.current = false;
    const { w, h } = size();
    // 끌지 않고 그냥 눌렀거나, 충분히 끌었으면 끝까지 넘긴다
    if (!moved.current || peelRef.current > Math.min(w, h) * OPEN_RATIO) openGuide();
    else animateTo(REST, 350, undefined, true);
  }

  const covering = open; // 가이드가 화면을 다 덮었는지
  const peekOpacity = Math.max(0, 1 - (peel - HOVER) / 120); // 넘길수록 '?'가 사라진다
  const clip = covering
    ? "none"
    : `polygon(100% calc(100% - ${peel}px), 100% 100%, calc(100% - ${peel}px) 100%)`;

  return (
    <div ref={areaRef} className="pointer-events-none absolute inset-0 z-30">
      {/* 뒷장: 꾸로록 사용 가이드 (블루 바탕 위 크림 창) */}
      <section
        aria-labelledby="guide-title"
        aria-hidden={!open}
        inert={!open}
        className={`absolute inset-0 bg-brand ${open ? "pointer-events-auto overflow-y-auto" : "overflow-hidden"}`}
        style={{ clipPath: clip }}
      >
        {/* 넓은 화면에서는 스크롤 없이 한 화면에 다 들어가게: 세로 가운데 정렬 + 간격·글자 크기를 화면 높이에 맞춰 줄인다 */}
        <div className="mx-auto flex min-h-full w-full max-w-[920px] flex-col justify-center gap-[clamp(12px,2.6vh,24px)] px-5 py-[clamp(16px,4vh,40px)] pb-[calc(clamp(16px,4vh,40px)+env(safe-area-inset-bottom))] sm:px-10">
          <div className="flex flex-col gap-2 text-white">
            {/* 뒤로가기(←): 가이드를 덮고 메인 화면으로. 제목 줄 왼쪽에 붙여 한 화면 높이를 늘리지 않는다 */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => closeGuide()}
                aria-label="사용 가이드 닫고 돌아가기"
                className="-ml-2.5 inline-flex size-11 items-center justify-center rounded-full text-white hover:bg-white/15"
              >
                <ArrowLeftIcon className="size-6" />
              </button>
              <p className="w-fit rounded-full border-2 border-white/70 px-3 py-0.5 text-sm font-medium">꾸로록 사용 가이드</p>
            </div>
            <h2
              id="guide-title"
              ref={titleRef}
              tabIndex={-1}
              className="font-display text-2xl leading-tight focus:outline-none sm:text-[length:clamp(26px,4.6vh,40px)]"
            >
              한 사람의 경험이 <br className="lg:hidden" />
              다음 학생의 선택지가 되도록
            </h2>
            {/* 휴대폰에서는 세로 공간이 부족해 소개 문단을 빼고 3단계·약속만 보여준다 */}
            <p className="hidden max-w-[680px] text-[15px] leading-relaxed text-white/90 sm:block">
              거꾸로캠퍼스를 먼저 엑시트한 선배들의 인터뷰를 바탕으로, 어떤 길을 왜 골랐고 어떤 고민과 시행착오가 있었는지
              들려주는 진로 상담 챗봇이에요.
            </p>
          </div>

          <ol className="grid gap-2 sm:grid-cols-3 sm:gap-3">
            {[
              {
                n: "1",
                title: "편하게 물어보기",
                body: "진로 고민을 그대로 적어 보세요. 막막하면 노란 꾸로록을 누르면 추천 질문을 써 줘요.",
              },
              {
                n: "2",
                title: "출처 확인하기",
                body: "답변 아래 '출처'를 누르면 어떤 선배의 어떤 인터뷰에서 나온 이야기인지 볼 수 있어요.",
              },
              {
                n: "3",
                title: "선배에게 메일 보내기",
                body: "멘토 리스트에서 선배에게 메일을 보내요. 꾸로록이 전달하고, 선배 연락처는 공개되지 않아요.",
              },
            ].map((step) => (
              <li key={step.n} className="flex flex-col gap-1 rounded-2xl bg-canvas px-4 py-3 sm:gap-1.5 sm:p-5">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-accent font-display text-base text-brand sm:size-8">
                    {step.n}
                  </span>
                  <h3 className="text-base font-bold text-ink sm:text-[17px]">{step.title}</h3>
                </div>
                <p className="text-[13px] leading-relaxed text-body sm:text-sm">{step.body}</p>
              </li>
            ))}
          </ol>

          <div className="rounded-2xl bg-canvas px-4 py-3 sm:px-5 sm:py-4">
            <h3 className="text-[15px] font-bold text-ink">꾸로록이 지키는 약속</h3>
            <ul className="mt-1.5 flex flex-col gap-1 text-[13px] leading-relaxed text-body sm:mt-2 sm:text-sm">
              <li>• 인터뷰에 없는 내용은 지어내지 않아요. 자료가 부족하면 솔직하게 말하고 선배를 추천해요.</li>
              <li>• 대화 기록은 서버가 아니라 이 브라우저에만 저장돼요. 사이드바 &apos;최근 대화&apos;에서 보거나 지울 수 있어요.</li>
            </ul>
          </div>

          <div>
            <button
              type="button"
              onClick={() => closeGuide(true)}
              className="min-h-12 rounded-full bg-accent px-8 font-bold text-brand hover:brightness-95"
            >
              시작하기
            </button>
          </div>
        </div>
      </section>

      {!covering && (
        <>
          {/* 접힌 면 (종이 뒷면). 넘김 크기만큼의 상자 중 왼쪽 위 삼각형 */}
          <svg
            aria-hidden="true"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute right-0 bottom-0 drop-shadow-[-6px_-6px_10px_rgba(11,37,89,0.18)]"
            style={{ width: peel, height: peel }}
          >
            {/* 평소(살짝 접힌 상태)에는 블루 삼각형도 여기서 직접 그린다.
                뒷장(section)의 clip-path 로만 보이게 하면, 아이폰 사파리처럼 아래 주소창이 화면을 덮는 브라우저에서
                뒷장과 귀퉁이 위치가 어긋나 블루 자리에 크림색 종이가 비쳐 보였다. 더 넘기면 뒷장이 그대로 드러난다 */}
            {peel <= HOVER && <polygon points="100,0 100,100 0,100" fill="var(--color-brand)" />}
            <polygon
              points="0,0 100,0 0,100"
              fill="var(--color-surface)"
              stroke="var(--color-brand)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
            />
          </svg>

          {/* 귀퉁이 손잡이: 흰 접힌 면 + 블루 삼각형 전체. 끌거나 누르면 넘어간다 */}
          <button
            ref={cornerRef}
            type="button"
            aria-label="종이를 넘겨 꾸로록 사용 가이드 보기"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerEnter={() => !dragging.current && peelRef.current <= HOVER && animateTo(HOVER, 250)}
            onPointerLeave={() => !dragging.current && peelRef.current <= HOVER && animateTo(REST, 250, undefined, true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openGuide();
              }
            }}
            className="pointer-events-auto absolute right-0 bottom-0 cursor-grab touch-none focus-visible:outline-none active:cursor-grabbing"
            style={{ width: Math.max(peel, REST), height: Math.max(peel, REST) }}
          >
            {/* 휴대폰은 귀퉁이가 작아서(56px) '?'를 작게, 꼭짓점 쪽으로 붙인다. 안 그러면 흰 접힌 면에 겹쳐 잘려 보인다 */}
            <span
              aria-hidden="true"
              className="absolute right-2 bottom-1.5 font-display text-xl leading-none text-white sm:right-3 sm:bottom-2 sm:text-2xl sm:leading-8"
              style={{ opacity: peekOpacity }}
            >
              ?
            </span>
          </button>

          {/* 말풍선: 귀퉁이를 가리키는 꼬리. 누르면 가이드가 열리고, X 를 누르면 사라진다 */}
          {showHint && (
            <div
              className="pointer-events-auto absolute right-3 motion-safe:animate-pop-in sm:right-5"
              // 휴대폰에서는 노란 반원(꾸로록 눈)을 가리지 않게 반원 위쪽에 띄운다
              style={{
                bottom: narrow ? "calc(clamp(120px, 24dvh, 200px) + 12px)" : REST + 20,
                opacity: peekOpacity,
                visibility: peekOpacity === 0 ? "hidden" : "visible",
              }}
            >
              <div className="relative flex items-center gap-1 rounded-2xl border-2 border-brand bg-surface py-1.5 pr-1.5 pl-4 shadow-[0_6px_16px_rgba(11,37,89,0.12)] motion-safe:animate-float">
                <button type="button" onClick={openGuide} className="text-sm font-bold whitespace-nowrap text-brand hover:underline">
                  넘겨서 사용 가이드 보기
                </button>
                <button
                  type="button"
                  onClick={dismissHint}
                  aria-label="안내 말풍선 닫기"
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand hover:bg-sky sm:size-7"
                >
                  <CloseIcon className="size-4" />
                </button>
                {/* 꼬리: 오른쪽 아래(귀퉁이 쪽)를 가리킨다 */}
                <span
                  aria-hidden="true"
                  className="absolute right-9 -bottom-[9px] size-4 rotate-45 border-r-2 border-b-2 border-brand bg-surface"
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
