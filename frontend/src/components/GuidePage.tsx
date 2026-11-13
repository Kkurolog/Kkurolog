// 메인 화면 오른쪽 아래의 '접힌 종이 귀퉁이' + 그 뒤에 숨어 있는 꾸로록 사용 가이드.
// - 평소: 귀퉁이가 살짝 접혀 있다 (흰 접힌 면 + 뒷장의 블루와 '?'). 마우스를 올리면 조금 더 들린다.
// - 귀퉁이를 왼쪽 위로 끌면 종이가 넘어가듯 뒷장(가이드)이 드러난다. 충분히 끌고 놓으면 끝까지 넘어가고,
//   조금만 끌고 놓으면 제자리로 돌아간다. 귀퉁이나 '넘겨서 사용 가이드 보기'를 눌러도 넘어간다.
// - 가이드에서 '시작하기'·'처음 화면으로'·Esc 를 누르면 종이가 다시 덮인다.
//
// 넘김 크기(peel): 오른쪽 아래 꼭짓점에서 접힌 선까지의 거리(px).
// 귀퉁이 꼭짓점이 (가로-peel, 세로-peel) 로 접혀 올라간다고 보고,
// 뒷장은 오른쪽 아래 삼각형만큼 보이고(clip-path), 접힌 면은 그 위의 삼각형으로 그린다.
"use client";

import { useEffect, useRef, useState } from "react";

const REST = 96; // 평소 접힌 크기
const HOVER = 128; // 마우스를 올렸을 때
const OPEN_RATIO = 0.3; // 화면 짧은 변의 30% 이상 끌고 놓으면 끝까지 넘긴다

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
  const [peel, setPeel] = useState(REST);
  const [open, setOpen] = useState(false);

  // 화면(이 영역) 크기. 끝까지 넘기려면 가로+세로만큼 넘기면 된다
  function size() {
    const rect = areaRef.current?.getBoundingClientRect();
    return { w: rect?.width ?? 1200, h: rect?.height ?? 800, left: rect?.left ?? 0, top: rect?.top ?? 0 };
  }

  // peel 을 target 까지 부드럽게 바꾼다. '동작 줄이기'를 켠 기기에서는 바로 바꾼다
  function animateTo(target: number, duration = 550, done?: () => void) {
    if (frame.current) cancelAnimationFrame(frame.current);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setPeel(target);
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
    const { w, h } = size();
    animateTo(w + h, 650, () => setOpen(true));
  }

  function closeGuide() {
    setOpen(false);
    animateTo(REST, 650, () => cornerRef.current?.focus());
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
    else animateTo(REST, 350);
  }

  const covering = open; // 가이드가 화면을 다 덮었는지
  const peekOpacity = Math.max(0, 1 - (peel - HOVER) / 120); // 넘길수록 '?'·안내 버튼이 사라진다
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
        <div className="mx-auto flex min-h-full w-full max-w-[880px] flex-col gap-7 px-6 py-10 sm:px-10">
          <div className="flex flex-col gap-3 text-white">
            <p className="w-fit rounded-full border-2 border-white/70 px-3 py-1 text-sm font-medium">꾸로록 사용 가이드</p>
            <h2
              id="guide-title"
              ref={titleRef}
              tabIndex={-1}
              className="font-display text-[34px] leading-tight focus:outline-none sm:text-[44px]"
            >
              한 사람의 경험이
              <br />
              다음 학생의 선택지가 되도록
            </h2>
            <p className="max-w-[620px] leading-relaxed text-white/90">
              꾸로록은 거꾸로캠퍼스를 먼저 엑시트한 선배들의 인터뷰를 바탕으로 답하는 진로 상담 챗봇이에요. 선배들이 어떤
              길을 갔는지뿐 아니라, 왜 그렇게 선택했고 어떤 고민과 시행착오가 있었는지 들려줘요.
            </p>
          </div>

          <ol className="grid gap-4 sm:grid-cols-3">
            {[
              {
                n: "1",
                title: "편하게 물어보기",
                body: "진로 고민을 그대로 적어 보세요. 뭘 물어야 할지 모르겠으면 노란 꾸로록을 눌러 보세요. 추천 질문을 써 줘요.",
              },
              {
                n: "2",
                title: "출처 확인하기",
                body: "답변 아래 '출처'를 누르면 어떤 선배의 어떤 인터뷰에서 나온 이야기인지 오른쪽에서 볼 수 있어요.",
              },
              {
                n: "3",
                title: "선배에게 메일 보내기",
                body: "더 궁금하면 멘토 리스트에서 선배에게 메일을 보내요. 첫 연락은 꾸로록이 전달하고, 선배 연락처는 공개되지 않아요.",
              },
            ].map((step) => (
              <li key={step.n} className="flex flex-col gap-2 rounded-3xl border-2 border-ink/10 bg-canvas p-6">
                <span className="inline-flex size-9 items-center justify-center rounded-full bg-accent font-display text-lg text-brand">
                  {step.n}
                </span>
                <h3 className="text-lg font-bold text-ink">{step.title}</h3>
                <p className="text-[15px] leading-relaxed text-body">{step.body}</p>
              </li>
            ))}
          </ol>

          <div className="rounded-3xl bg-canvas p-6">
            <h3 className="font-bold text-ink">꾸로록이 지키는 약속</h3>
            <ul className="mt-3 flex flex-col gap-2 text-[15px] leading-relaxed text-body">
              <li>• 인터뷰에 없는 내용은 지어내지 않아요. 자료가 부족하면 솔직하게 말하고 선배를 추천해요.</li>
              <li>• 대화는 저장되지 않아요. &apos;새 채팅&apos;을 누르거나 새로고침하면 사라져요.</li>
              <li>• 지금 보이는 답변과 멘토는 시험용(demo) 데이터예요.</li>
            </ul>
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={closeGuide}
              className="min-h-12 rounded-full bg-accent px-7 font-bold text-brand hover:brightness-95"
            >
              시작하기
            </button>
            <button
              type="button"
              onClick={closeGuide}
              className="min-h-12 rounded-full border-2 border-white/70 px-6 font-bold text-white hover:bg-white/10"
            >
              처음 화면으로
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
            <polygon
              points="0,0 100,0 0,100"
              fill="var(--color-surface)"
              stroke="var(--color-brand)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
            />
          </svg>

          {/* 귀퉁이 손잡이: 끌거나 누르면 넘어간다 */}
          <button
            ref={cornerRef}
            type="button"
            aria-label="종이를 넘겨 꾸로록 사용 가이드 보기"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerEnter={() => !dragging.current && peelRef.current <= HOVER && animateTo(HOVER, 250)}
            onPointerLeave={() => !dragging.current && peelRef.current <= HOVER && animateTo(REST, 250)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openGuide();
              }
            }}
            className="pointer-events-auto absolute right-0 bottom-0 cursor-grab touch-none [clip-path:polygon(100%_0,100%_100%,0_100%)] focus-visible:outline-none active:cursor-grabbing"
            style={{ width: Math.max(peel, REST), height: Math.max(peel, REST) }}
          >
            <span
              aria-hidden="true"
              className="absolute right-3 bottom-2 font-display text-2xl text-white"
              style={{ opacity: peekOpacity }}
            >
              ?
            </span>
          </button>

          {/* 안내 버튼 (넓은 화면) */}
          <button
            type="button"
            onClick={openGuide}
            className="pointer-events-auto absolute right-[116px] bottom-6 hidden rounded-full border-2 border-brand bg-surface px-4 py-1.5 text-sm font-bold text-brand transition-opacity hover:bg-sky sm:block"
            style={{ opacity: peekOpacity, visibility: peekOpacity === 0 ? "hidden" : "visible" }}
          >
            넘겨서 사용 가이드 보기
          </button>
        </>
      )}
    </div>
  );
}
