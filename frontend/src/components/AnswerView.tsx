// 답변 영역: 답변 글 + 출처 카드 목록.
// 근거가 부족하면(has_enough_evidence=false) '멘토 찾아보기' 안내를 보여준다.
import type { AskResponse } from "@/lib/api";
import SourceCard from "./SourceCard";

export default function AnswerView({ result }: { result: AskResponse }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-lg bg-indigo-50 p-4 leading-relaxed text-gray-800">{result.answer}</div>

      {!result.has_enough_evidence && (
        // 멘토 기능은 아직 없음. 안내 문구만 표시.
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          비슷한 경험을 가진 선배나 코치를 찾아볼 수 있어요. <b>멘토 찾아보기</b> 기능은 준비 중입니다.
        </div>
      )}

      {result.sources.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-gray-500">출처</h2>
          {result.sources.map((source) => (
            <SourceCard key={source.interview_id} source={source} />
          ))}
        </div>
      )}
    </section>
  );
}
