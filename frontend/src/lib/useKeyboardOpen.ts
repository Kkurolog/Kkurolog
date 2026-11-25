// 휴대폰 화면 키보드가 올라와 있는지 알려주는 훅.
// 키보드가 올라오면 실제로 보이는 화면 높이(visualViewport)가 창 높이보다 크게 줄어드는 걸로 판단한다.
// 메인 화면의 노란 반원·귀퉁이를 키보드가 떠 있는 동안 숨겨서 입력창이 가려지지 않게 할 때 쓴다.
"use client";

import { useSyncExternalStore } from "react";

function isOpen() {
  const vv = window.visualViewport;
  if (!vv) return false;
  return vv.height < window.innerHeight * 0.8;
}

export function useKeyboardOpen(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const vv = window.visualViewport;
      vv?.addEventListener("resize", onChange);
      window.addEventListener("resize", onChange);
      return () => {
        vv?.removeEventListener("resize", onChange);
        window.removeEventListener("resize", onChange);
      };
    },
    isOpen,
    () => false,
  );
}
