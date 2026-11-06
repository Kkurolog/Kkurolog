// 출처 카드 하나: 어느 졸업생의 어떤 인터뷰 구간인지 보여준다.
// 나중에: 카드를 누르면 인터뷰의 해당 구간과 앞뒤 맥락을 보여주기.
import type { Source } from "@/lib/api";

export default function SourceCard({ source }: { source: Source }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm font-semibold text-gray-800">{source.alumni}</p>
      <p className="mt-2 text-sm leading-relaxed text-gray-600">“{source.excerpt}”</p>
      <p className="mt-2 text-xs text-gray-400">인터뷰 ID: {source.interview_id}</p>
    </div>
  );
}
