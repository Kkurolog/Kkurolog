// 질문 입력창 + 보내기 버튼. (메인 화면 가운데, 대화가 시작되면 화면 아래에 붙는다)
// 입력한 글(value)은 부모가 갖고 있다. 그래야 메인 화면의 꾸로록 캐릭터를 눌렀을 때
// 부모가 추천 질문을 입력창에 대신 써 넣을 수 있다.
// 실제로 backend를 부르는 일도 부모가 하고, 여기서는 입력만 받는다.
// Enter: 보내기 / Shift+Enter: 줄바꿈
"use client";

import type { Ref } from "react";
import { ArrowUpIcon } from "./icons";

type Props = {
  value: string; // 입력창에 들어 있는 글
  onChange: (value: string) => void;
  onSubmit: (question: string) => void; // 질문을 보낼 때 실행할 함수
  loading: boolean; // 답변을 기다리는 중인지
  placeholder: string; // 비어 있을 때 보이는 안내 문구
  autoFocus?: boolean;
  typing?: boolean; // 추천 질문을 자동으로 쓰는 중인지 (그동안 보내기·직접 입력을 막는다)
  inputRef?: Ref<HTMLTextAreaElement>; // 부모가 입력창에 초점을 옮길 때 쓴다
  onFocusChange?: (focused: boolean) => void; // 입력창에 초점이 들어오고 나갈 때 (꾸로록 표정용)
};

export default function QuestionForm({
  value,
  onChange,
  onSubmit,
  loading,
  placeholder,
  autoFocus,
  typing = false,
  inputRef,
  onFocusChange,
}: Props) {
  function send() {
    const trimmed = value.trim();
    if (!trimmed || loading || typing) return;
    onSubmit(trimmed);
    onChange(""); // 보낸 뒤 입력창 비우기
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); // 페이지 새로고침 막기
    send();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // isComposing: 한글을 조합하는 중에 Enter가 두 번 처리되는 것을 막는다
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex min-h-14 w-full items-center gap-2 rounded-[28px] border-2 border-brand bg-surface py-2 pr-2 pl-5 focus-within:shadow-[0_0_0_4px_var(--color-sky)] sm:min-h-[72px] sm:gap-3 sm:rounded-[36px] sm:py-3 sm:pr-3 sm:pl-7"
    >
      <label htmlFor="question" className="sr-only">
        질문
      </label>
      <textarea
        id="question"
        ref={inputRef}
        value={value}
        // 추천 질문을 자동으로 쓰는 동안에는 직접 입력을 잠깐 막는다 (깜빡이는 커서는 그대로 보인다)
        onChange={(e) => !typing && onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => onFocusChange?.(true)}
        onBlur={() => onFocusChange?.(false)}
        placeholder={placeholder}
        rows={1}
        autoFocus={autoFocus}
        aria-busy={typing}
        // 안내 문구(placeholder)는 한 줄로만 보이고, 넘치면 … 으로 줄인다 (모바일에서 입력창이 두 줄로 커지지 않게)
        className="max-h-40 w-full resize-none bg-transparent py-1 text-base leading-6 text-ink caret-brand [field-sizing:content] placeholder:overflow-hidden placeholder:text-ellipsis placeholder:whitespace-nowrap placeholder:text-placeholder focus:outline-none"
      />
      <button
        type="submit"
        disabled={loading || typing || !value.trim()}
        aria-label={loading ? "답변을 준비하는 중" : "보내기"}
        className="inline-flex size-11 shrink-0 items-center justify-center self-end rounded-full sm:size-12 bg-brand text-white transition-transform hover:bg-brand-dark enabled:active:scale-90 disabled:bg-brand/35"
      >
        <ArrowUpIcon className="size-6" />
      </button>
    </form>
  );
}
