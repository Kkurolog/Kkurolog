// 관리자 로그인 화면 (와이어프레임 04-1, 오류 04-1-1)
// 공용 비밀번호를 입력하면 backend 가 12시간짜리 token 을 준다. (adminApi.login 이 sessionStorage 에 저장)
// 비밀번호는 이 입력칸에서 backend 로 보내기만 하고, 어디에도 저장하거나 로그로 찍지 않는다.
// 로그인에 성공하면 AdminShell 이 바로 원래 보던 관리자 화면(기본: 문의 목록)을 보여준다.
"use client";

import { useState } from "react";
import { AdminApiError, getLogoutReason, login } from "@/lib/adminApi";
import Logo from "../Logo";

export default function AdminLogin() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  // 401 로 쫓겨났거나 12시간이 지났으면 '다시 로그인해 주세요.'로 시작한다
  const [message, setMessage] = useState<string | null>(() => getLogoutReason());
  const [isError, setIsError] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await login(password);
    } catch (err) {
      setPassword("");
      setIsError(true);
      setMessage(err instanceof AdminApiError ? err.message : "로그인하지 못했어요. 잠시 후 다시 시도해 주세요.");
      setBusy(false);
    }
  }

  return (
    <main className="paper-lines flex min-h-dvh w-full items-center justify-center px-5 py-10">
      <form onSubmit={handleSubmit} className="flex w-full max-w-[400px] flex-col items-center" noValidate>
        <Logo className="size-12" />
        <h1 className="mt-4 font-display text-[28px] leading-9 text-brand">관리자 로그인</h1>

        <label htmlFor="admin-password" className="sr-only">
          관리자 비밀번호
        </label>
        <input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (isError) setIsError(false);
          }}
          placeholder="비밀번호"
          aria-invalid={isError}
          aria-describedby="admin-login-message"
          className={`mt-8 h-14 w-full rounded-3xl border-2 bg-surface px-5 text-[15px] text-ink placeholder:text-placeholder focus:outline-none ${
            isError ? "border-danger" : "border-line focus:border-brand"
          }`}
        />

        {/* 오류·안내 문구 자리 (높이를 미리 잡아 두어 문구가 나와도 버튼이 밀리지 않는다) */}
        <p
          id="admin-login-message"
          role={message ? "alert" : undefined}
          className={`flex h-10 w-full items-center px-2 text-[13px] ${isError ? "text-danger" : "text-body"}`}
        >
          {message}
        </p>

        <button
          type="submit"
          disabled={!password || busy}
          className="h-14 w-full rounded-full bg-brand text-[16px] font-bold text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
        >
          {busy ? "확인하는 중…" : "로그인"}
        </button>
      </form>
    </main>
  );
}
