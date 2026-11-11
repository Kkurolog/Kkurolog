// 출처 카드 하나: 어느 졸업생의 어떤 인터뷰 구간인지 보여준다.
// 제목(졸업생 · 인터뷰 ID)을 누르면 인용문이 펼쳐지고 접힌다. 첫 번째 출처는 펼친 채로 시작한다.
// 나중에: 인터뷰의 해당 구간과 앞뒤 맥락을 보여주기.
import type { Source } from "@/lib/api";

export default function SourceCard({ source, defaultOpen = false }: { source: Source; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-xl border border-line bg-white px-4 py-3">
      <summary className="flex min-h-6 cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-ink">
        <span>
          {source.alumni} <span className="font-normal text-muted">· {source.interview_id}</span>
        </span>
        <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <p className="mt-2 text-sm leading-relaxed text-body">“{source.excerpt}”</p>
    </details>
  );
}
