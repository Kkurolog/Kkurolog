// 없는 주소로 들어왔을 때 보이는 화면 (빈 화면 → 거꾸로 매달린 꾸로록)
import Link from "next/link";
import { MiniKkuro } from "@/components/Kkuro";

export default function NotFound() {
  return (
    <main className="paper-lines flex min-h-screen flex-1 flex-col items-center gap-6 px-6 pt-0 text-center">
      <MiniKkuro mood="upside" className="w-56 motion-safe:animate-float" />
      <h1 className="mt-6 font-display text-[34px] text-brand">여기는 빈 페이지예요</h1>
      <p className="text-[15px] text-muted">주소를 다시 확인하거나, 처음 화면으로 돌아가 주세요.</p>
      <Link href="/" className="min-h-12 rounded-full bg-brand px-7 py-3 font-bold text-white hover:bg-brand-dark">
        처음 화면으로
      </Link>
    </main>
  );
}
