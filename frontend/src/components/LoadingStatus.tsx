// 답변을 기다리는 동안 보여주는 표시: 눈 감은 꾸로록 + 통통 튀는 점 세 개 + 단계 문구.
// 진로 질문은 답이 오기까지 13~40초가 걸린다. 같은 문구만 계속 보이면 멈춘 것처럼 느껴져서,
// 시간이 지나면 문구를 차례로 바꾼다. (화면의 타이머로만 바꾼다. backend 가 실제로 어느 단계인지는 알 수 없다)
// 이 컴포넌트는 기다리는 동안에만 화면에 올라오므로, 올라온 순간부터 시간을 센다.
"use client";

import { useEffect, useState } from "react";
import { MiniKkuro } from "./Kkuro";

// [몇 초 뒤부터, 보여줄 문구]
const STAGES: [number, string][] = [
  [0, "질문을 살펴보고 있어요"],
  [2, "선배들의 기록을 찾는 중이에요"],
  [6, "찾은 이야기를 정리하는 중이에요"],
  [20, "조금만 더 기다려 주세요"],
];

export default function LoadingStatus() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timers = STAGES.slice(1).map(([seconds], i) => setTimeout(() => setStage(i + 1), seconds * 1000));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="flex items-end gap-3 motion-safe:animate-rise-in" role="status">
      <MiniKkuro mood="thinking" className="w-[72px] shrink-0" />
      <span className="flex shrink-0 gap-1.5 pb-1.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="block size-2 rounded-full bg-brand motion-safe:animate-dot"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </span>
      {/* key 를 바꿔서 문구가 바뀔 때마다 살짝 떠오르게 한다 */}
      <p key={stage} className="pb-0.5 text-[15px] text-muted motion-safe:animate-fade-in">
        {STAGES[stage][1]}...
      </p>
    </div>
  );
}
