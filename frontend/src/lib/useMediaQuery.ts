// 화면 너비 같은 미디어 쿼리가 맞는지 알려주는 훅. 예: useMediaQuery("(max-width: 639px)")
// CSS 만으로 바꿀 수 없는 것(예: 입력창 placeholder 문구)을 화면 크기에 따라 바꿀 때 쓴다.
// 서버에서 그릴 때는 화면 크기를 몰라서 false(넓은 화면)로 본다.
"use client";

import { useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
