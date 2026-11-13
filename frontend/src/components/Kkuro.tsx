// 꾸로록 캐릭터 "빼꼼 꾸로록" — 화면 아래(또는 위)에서 눈만 빼꼼 내미는 노란 돔.
// 몸 전체를 그리지 않고, 표정은 눈동자 위치와 눈꺼풀만으로 표현한다. (캐릭터 시트 CHARACTER A)
//
// 표정(mood):
//  - default   기본: 대기 화면. 정면(살짝 위)을 본다. 가끔 깜빡인다
//  - listening 듣는 중: 눈동자가 입력창을 따라간다 (lookX: -1 왼쪽 ~ 1 오른쪽)
//  - thinking  생각 중: 눈을 감는다 (점 세 개는 옆에서 따로 보여준다)
//  - found     찾았다!: 눈이 반짝. 답변이 도착했을 때
//  - upside    거꾸로: 천장에 매달려 아래를 본다. 로딩·빈 화면
"use client";

export type KkuroMood = "default" | "listening" | "thinking" | "found" | "upside";

type EyesProps = {
  mood?: KkuroMood;
  lookX?: number; // listening 일 때 눈동자 좌우 위치 (-1 ~ 1)
  className?: string;
};

// 4갈래 반짝이 (찾았다! 표정의 눈동자)
const SPARKLE = "M0 -1C.12-.33.33-.12 1 0 .33.12.12.33 0 1-.12.33-.33.12-1 0-.33-.12-.12-.33 0-1z";

// 눈 두 개. 232x140 비율로 그려서 어떤 크기로든 늘려 쓴다.
export function KkuroEyes({ mood = "default", lookX = 0, className }: EyesProps) {
  const eyes = [52, 180]; // 두 눈의 가운데 x
  // 눈동자 위치: 기본은 살짝 위, 듣는 중은 입력창 쪽(위)으로 좌우를 따라가고, 거꾸로는 아래를 본다
  const look =
    mood === "listening"
      ? { x: Math.max(-1, Math.min(1, lookX)) * 18, y: -36 }
      : mood === "upside"
        ? { x: 0, y: 30 }
        : { x: 0, y: -26 };
  const blinks = mood === "default" || mood === "listening" || mood === "upside";

  return (
    <svg viewBox="-4 -4 240 148" aria-hidden="true" className={className} overflow="visible">
      {eyes.map((cx, i) => (
        <g key={cx}>
          {mood === "thinking" ? (
            // 감은 눈: 위로 볼록한 곡선
            <path
              d={`M${cx - 40} 92 Q${cx} 40 ${cx + 40} 92`}
              fill="none"
              stroke="var(--color-brand)"
              strokeWidth="9"
              strokeLinecap="round"
            />
          ) : (
            <g className={blinks ? "origin-center [transform-box:fill-box] motion-safe:animate-blink" : undefined}>
              <ellipse cx={cx} cy={70} rx={48} ry={66} fill="var(--color-surface)" stroke="var(--color-brand)" strokeWidth="8" />
              {mood === "found" ? (
                <path
                  d={SPARKLE}
                  fill="var(--color-brand)"
                  transform={`translate(${cx} 70) scale(30)`}
                  className="origin-center [transform-box:fill-box] motion-safe:animate-twinkle"
                  style={{ animationDelay: `${i * -0.4}s` }}
                />
              ) : (
                <circle
                  cx={cx}
                  cy={70}
                  r={22}
                  fill="var(--color-brand)"
                  className="transition-transform duration-200 ease-out"
                  style={{ transform: `translate(${look.x}px, ${look.y}px)` }}
                />
              )}
            </g>
          )}
        </g>
      ))}
    </svg>
  );
}

// 작은 꾸로록: 노란 반원 + 눈. 채팅의 답변 대기·답변 머리, 로딩·빈 화면에 쓴다.
// upside 이면 위에서 매달린 모양(반원이 아래로 볼록)이 된다.
export function MiniKkuro({ mood = "default", className = "w-[72px]" }: { mood?: KkuroMood; className?: string }) {
  const upside = mood === "upside";
  return (
    <svg viewBox="0 0 120 60" aria-hidden="true" className={className} overflow="visible">
      <path d={upside ? "M0 0A60 60 0 0 0 120 0Z" : "M0 60A60 60 0 0 1 120 60Z"} fill="var(--color-accent)" />
      <svg x="24" y={upside ? 4 : 16} width="72" height="44" viewBox="-4 -4 240 148" overflow="visible">
        <KkuroEyes mood={mood} />
      </svg>
    </svg>
  );
}
