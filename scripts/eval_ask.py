"""
RAG 성능 측정. 설정(Top-K, 유사도 하한 등)을 바꿀 때마다 돌려서 숫자로 비교한다.

질문 세트 형식: scripts/eval/questions.example.json 참고
  expected_type     : answer | no_evidence | off_topic | safety
  expected_post_ids : 답의 근거가 되어야 하는 글 ID (answer 일 때)

모드
  --retrieval-only : 임베딩 + 검색만 (Claude 호출 없음, 비용 아주 적음)
                     → 검색 적중률: 기대 글이 유사도 하한을 넘겨 검색되었는가
  (기본)           : 전체 파이프라인 (⚠️ 질문마다 Claude 호출 → 비용 발생)
                     → answer_type 정확도, 출처 적중률

실행 (backend 폴더에서):
  python ../scripts/eval_ask.py ../scripts/eval/questions.example.json --local ../data/raw/chunks_embedded.jsonl --retrieval-only
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from dotenv import load_dotenv  # noqa: E402

from app.rag.config import RagSettings  # noqa: E402
from app.rag.pipeline import build_pipeline_from_env, has_safety_keyword  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("questions", help="질문 세트 JSON")
    parser.add_argument("--local", help="임베딩 포함 chunk jsonl (없으면 Supabase 사용)")
    parser.add_argument("--retrieval-only", action="store_true", help="Claude 를 부르지 않고 검색만 측정")
    args = parser.parse_args()

    load_dotenv(Path(__file__).resolve().parent.parent / "backend" / ".env")
    settings = RagSettings.from_env()
    pipeline = build_pipeline_from_env(settings, args.local)
    questions = json.loads(Path(args.questions).read_text(encoding="utf-8"))
    print(f"설정: top_k={settings.top_k}, similarity_floor={settings.similarity_floor}, "
          f"neighbor_window={settings.neighbor_window}, max_posts={settings.max_posts}\n")

    retrieval_hit = retrieval_total = 0
    false_hits = no_evidence_total = 0
    type_correct = source_hit = source_total = 0
    failed_total = 0  # API 오류로 '임시 안내'를 대신 낸 횟수 (근거 부족과 구분)

    for q in questions:
        expected = set(q.get("expected_post_ids", []))
        hits = [] if has_safety_keyword(q["question"]) else pipeline.retrieve(q["question"])
        found = {h.chunk.post_id for h in hits}
        top = ", ".join(f"{h.chunk.chunk_id}({h.score:.2f})" for h in hits[:3]) or "-"

        if q["expected_type"] == "answer":
            retrieval_total += 1
            retrieval_hit += bool(expected & found)
        elif q["expected_type"] == "no_evidence":
            no_evidence_total += 1
            false_hits += bool(found)
        line = f"[{q['id']}] 검색: {top}"

        if not args.retrieval_only:
            result = pipeline.answer(q["question"])
            ok = result.answer_type == q["expected_type"]
            type_correct += ok
            if q["expected_type"] == "answer":
                source_total += 1
                source_hit += bool(expected & {s.post_id for s in result.sources})
            line += f" | 결과: {result.answer_type} {'✓' if ok else '✗ (기대 ' + q['expected_type'] + ')'}"
            if result.failed:
                failed_total += 1
                line += " ⚠️ API 오류 (서버 로그 확인)"
        print(line)

    print("\n===== 요약 =====")
    if retrieval_total:
        print(f"검색 적중률 (answer 질문): {retrieval_hit}/{retrieval_total}")
    if no_evidence_total:
        print(f"근거 부족 질문인데 하한을 넘긴 chunk 가 있었음: {false_hits}/{no_evidence_total} (낮을수록 좋음)")
    if not args.retrieval_only:
        print(f"answer_type 정확도: {type_correct}/{len(questions)}")
        if failed_total:
            print(f"⚠️ API 오류로 측정이 안 된 질문: {failed_total}개 — 위 정확도는 믿을 수 없어요. 다시 돌려 주세요.")
        if source_total:
            print(f"출처 적중률: {source_hit}/{source_total}")


if __name__ == "__main__":
    main()
