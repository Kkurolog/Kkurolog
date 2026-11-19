"""
RAG 성능 측정. 설정·지시문·검색 방법을 바꿀 때마다 돌려서 숫자로 비교한다.
(왜 필요한지와 처음 측정한 결과: docs/proposals/answer-quality-audit.md)

실행은 backend 폴더에서, backend 가상환경으로 한다 (backend/.env 의 키를 쓴다).

  1) 검색만 — 답변 모델을 부르지 않는다. 비용이 거의 없다 (질문 임베딩 + 작은 분류 모델, 둘 다 캐시됨)
       python ../scripts/eval_ask.py ../scripts/eval/questions.json --retrieval-only
       python ../scripts/eval_ask.py ../scripts/eval/questions.json ../scripts/eval/probes.json --retrieval-only
         --sweep      : 유사도 하한·조각 수·글 수·태그 자리 수를 바꿔 가며 비교 (추가 비용 없음)
         --no-intent  : 의도 분석을 건너뛴다 (태그 우선 검색 없이, 예전 방식의 검색만 본다)

  2) 의도 분류만 — 작은 분류 모델만 부른다
       python ../scripts/eval_ask.py --intent ../scripts/eval/intent_cases.json

  3) 전체 — ⚠️ 질문마다 답변 모델(Claude)을 부른다. 실제 비용이 나간다. --confirm-cost 를 붙여야만 실행된다
       python ../scripts/eval_ask.py ../scripts/eval/questions.json --confirm-cost

질문 파일 형식 (scripts/eval/questions.example.json, probes.json 참고)
  expected_type        : answer | no_evidence | off_topic | safety
  expected_source_ids  : 답의 근거가 되어야 하는 글번호 (있으면 '정답 글' 지표를 낸다)
  expected_tags        : {"career_paths": [...], "career_fields": [...]}  그 태그가 있는 선배의 글이 나와야 한다
                         (있으면 '태그가 맞는 글' 지표를 낸다. 종류 안에서는 하나라도 겹치면, 두 종류면 둘 다 맞아야 한다)

지표
  하나라도 전달 : 정답 글 중 하나라도 답변 모델에게 전달된 질문 수 (느슨한 기준)
  전달률       : 정답 글이 들어갈 수 있는 자리 중 실제로 정답 글이 들어간 비율 (엄격한 기준)
  태그 일치율   : 전달된 글 중 기대 태그가 있는 선배의 글의 비율

결과는 data/eval/ 에 저장한다 (data/ 는 git 에 올라가지 않는다). 원문은 저장하지 않고 글번호·점수만 남긴다.
전체 모드는 답변 문장도 저장한다 (원문을 풀어 쓴 글이므로 밖에 올리지 않는다).
"""

import argparse
import dataclasses
import hashlib
import json
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from dotenv import load_dotenv  # noqa: E402

from app.rag.config import RagSettings  # noqa: E402
from app.rag.intent import IntentResult, fixed_reply_for  # noqa: E402
from app.rag.pipeline import RagPipeline, pick_posts  # noqa: E402
from app.services.answer import looks_like_crisis  # noqa: E402

OUT_DIR = ROOT / "data" / "eval"
CACHE_DIR = OUT_DIR / "cache"
SEARCH_FETCH = 50  # match_chunks 가 한 번에 주는 최대 개수. 넉넉히 받아 두고 잘라 쓴다


# ---------------------------------------------------------------------------
# 캐시: 같은 질문을 다시 돌릴 때 유료 호출을 반복하지 않는다
# ---------------------------------------------------------------------------
class JsonCache:
    def __init__(self, name: str) -> None:
        self.path = CACHE_DIR / name
        self.data = json.loads(self.path.read_text(encoding="utf-8")) if self.path.exists() else {}
        self.new = 0

    def save(self) -> None:
        if self.new:
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            self.path.write_text(json.dumps(self.data, ensure_ascii=False), encoding="utf-8")


class CachingEmbedder:
    """질문 임베딩을 파일에 저장해 두고 다시 쓴다."""

    def __init__(self, inner, model: str) -> None:
        self.inner, self.model, self.cache = inner, model, JsonCache("embeddings.json")

    def embed(self, texts: list[str]) -> list[list[float]]:
        missing = [t for t in texts if f"{self.model}|{t}" not in self.cache.data]
        if missing:
            for t, v in zip(missing, self.inner.embed(missing)):
                self.cache.data[f"{self.model}|{t}"] = v
            self.cache.new += len(missing)
        return [self.cache.data[f"{self.model}|{t}"] for t in texts]


class CachingStore:
    """검색 결과를 넉넉히(50개) 받아 메모리에 두고 잘라 쓴다. 설정을 바꿔 가며 비교해도 DB 를 다시 부르지 않는다."""

    def __init__(self, inner) -> None:
        self.inner, self.memo = inner, {}

    def search(self, vector, top_k, career_paths=None, career_fields=None):
        key = (hashlib.md5(json.dumps(vector[:16]).encode()).hexdigest(), tuple(career_paths or ()), tuple(career_fields or ()))
        if key not in self.memo:
            self.memo[key] = self.inner.search(vector, SEARCH_FETCH, career_paths=career_paths, career_fields=career_fields)
        return self.memo[key][:top_k]

    def get_chunks(self, source_id, indices):
        return self.inner.get_chunks(source_id, indices)


class CachingIntentAnalyzer:
    """의도 분석 결과를 파일에 저장해 두고 다시 쓴다. 분류 지시문이 바뀌면 캐시 키가 달라져 새로 부른다."""

    def __init__(self, inner, model: str) -> None:
        from app.rag.intent import INTENT_SYSTEM_PROMPT

        self.inner = inner
        self.prefix = f"{model}|{hashlib.md5(INTENT_SYSTEM_PROMPT.encode()).hexdigest()[:10]}|"
        self.cache = JsonCache("intents.json")

    def analyze(self, question: str) -> IntentResult | None:
        key = self.prefix + question
        if key not in self.cache.data:
            result = self.inner.analyze(question)
            if result is None:
                return None  # 실패는 저장하지 않는다 (다음에 다시 시도)
            self.cache.data[key] = result.model_dump()
            self.cache.new += 1
        return IntentResult.model_validate(self.cache.data[key])


# ---------------------------------------------------------------------------
# 준비
# ---------------------------------------------------------------------------
def build(settings: RagSettings, local: str | None, with_intent: bool, with_generator: bool):
    from app.rag.embedding import OpenAIEmbedder
    from app.rag.store import InMemoryVectorStore, SupabaseVectorStore

    embedder = CachingEmbedder(
        OpenAIEmbedder(settings.embedding_model, timeout=settings.embedding_timeout_seconds), settings.embedding_model
    )
    store = CachingStore(InMemoryVectorStore.from_jsonl(local) if local else SupabaseVectorStore())
    analyzer = None
    if with_intent:
        from app.rag.intent import ClaudeIntentAnalyzer

        analyzer = CachingIntentAnalyzer(
            ClaudeIntentAnalyzer(settings.intent_model, timeout=settings.intent_timeout_seconds), settings.intent_model
        )
    generator = None
    if with_generator:
        from app.rag.generator import ClaudeGenerator

        generator = ClaudeGenerator(
            settings.claude_model,
            settings.claude_effort,
            settings.claude_max_tokens,
            settings.claude_use_fallbacks,
            timeout=settings.claude_timeout_seconds,
        )
    return RagPipeline(embedder=embedder, store=store, generator=generator, settings=settings, intent_analyzer=analyzer)


def load_questions(paths: list[str]) -> list[dict]:
    questions = []
    for p in paths:
        questions += json.loads(Path(p).read_text(encoding="utf-8"))
    ids = [q["id"] for q in questions]
    assert len(ids) == len(set(ids)), "질문 id 가 겹쳐요"
    return questions


def save(mode: str, payload: dict) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"{mode}-{datetime.now():%Y%m%d-%H%M%S}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    return path


# ---------------------------------------------------------------------------
# 1) 검색만
# ---------------------------------------------------------------------------
def tag_ok(chunk, tags: dict) -> bool:
    paths, fields = tags.get("career_paths") or [], tags.get("career_fields") or []
    return (not paths or bool(set(chunk.career_paths) & set(paths))) and (
        not fields or bool(set(chunk.career_fields) & set(fields))
    )


def retrieve_one(pipeline: RagPipeline, q: dict) -> dict:
    """질문 하나에 대해 '답변 모델에게 전달될 글'을 구한다. 실제 서비스와 같은 코드(pipeline.retrieve, pick_posts)를 쓴다."""
    text = q["question"]
    if looks_like_crisis(text):
        return {"route": "crisis", "posts": []}
    intent = pipeline.analyze_intent(text)
    if intent is not None and fixed_reply_for(intent) is not None:
        return {"route": f"fixed:{intent.intent}", "posts": [], "intent": intent.model_dump()}
    found = pipeline.retrieve(text, intent)
    s = pipeline.settings
    posts = pick_posts(found.hits, s.max_posts, found.tagged_sources, s.tag_reserved_posts)
    by_source = {}
    for h in found.hits:
        by_source.setdefault(h.chunk.source_id, h)  # hits 는 점수 순이라 처음 것이 그 글의 최고 조각
    row = {
        "route": "search",
        "posts": posts,
        "top_score": round(found.hits[0].score, 3) if found.hits else None,
        "hits": len(found.hits),
        "tagged_posts": [p for p in posts if p in found.tagged_sources],
        "intent": intent.model_dump() if intent else None,
        "post_scores": {p: round(by_source[p].score, 3) for p in posts},
    }
    tags = q.get("expected_tags")
    if tags:
        row["tag_match"] = [p for p in posts if tag_ok(by_source[p].chunk, tags)]
    return row


def summarize(questions: list[dict], rows: dict[str, dict], max_posts: int) -> dict:
    labelled = [q for q in questions if q.get("expected_type") == "answer" and q.get("expected_source_ids")]
    hit = sum(1 for q in labelled if set(rows[q["id"]]["posts"]) & set(q["expected_source_ids"]))
    cover = sum(
        len(set(rows[q["id"]]["posts"]) & set(q["expected_source_ids"])) / min(len(q["expected_source_ids"]), max_posts)
        for q in labelled
    )
    tagged = [q for q in questions if q.get("expected_tags")]
    delivered = sum(len(rows[q["id"]]["posts"]) for q in tagged)
    matched = sum(len(rows[q["id"]].get("tag_match", [])) for q in tagged)
    empty = sum(1 for q in questions if q.get("expected_type") == "answer" and not rows[q["id"]]["posts"])
    noev = [q for q in questions if q.get("expected_type") == "no_evidence"]
    return {
        "labelled": len(labelled),
        "hit": hit,
        "coverage": round(cover / len(labelled), 3) if labelled else None,
        "tag_questions": len(tagged),
        "tag_match_rate": round(matched / delivered, 3) if delivered else None,
        "tag_zero": sum(1 for q in tagged if not rows[q["id"]].get("tag_match")),
        "answer_questions_with_no_posts": empty,
        "no_evidence_with_posts": sum(1 for q in noev if rows[q["id"]]["posts"]),
        "no_evidence_total": len(noev),
    }


def print_summary(label: str, s: dict) -> None:
    parts = [label]
    if s["labelled"]:
        parts.append(f"하나라도 전달 {s['hit']}/{s['labelled']} · 전달률 {s['coverage']:.2f}")
    if s["tag_questions"]:
        parts.append(f"태그 일치율 {s['tag_match_rate']:.2f} (태그 맞는 글이 0개인 질문 {s['tag_zero']}/{s['tag_questions']})")
    parts.append(f"글이 하나도 전달 안 된 답변 질문 {s['answer_questions_with_no_posts']}")
    if s["no_evidence_total"]:
        parts.append(f"근거 부족 질문에 글 전달 {s['no_evidence_with_posts']}/{s['no_evidence_total']}")
    print(" | ".join(parts))


def run_retrieval(args, settings: RagSettings) -> None:
    questions = load_questions(args.questions)
    pipeline = build(settings, args.local, with_intent=not args.no_intent, with_generator=False)
    print(f"설정: top_k={settings.top_k}, 하한={settings.similarity_floor}, 글={settings.max_posts}, "
          f"태그 자리={settings.tag_reserved_posts}, 의도 분석={'끔' if args.no_intent else '켬'}\n")

    rows = {q["id"]: retrieve_one(pipeline, q) for q in questions}
    for q in questions:
        r = rows[q["id"]]
        exp = set(q.get("expected_source_ids") or [])
        bits = [f"[{q['id']}]"]
        if r["route"] != "search":
            bits.append(f"검색 안 함 ({r['route']})")
        else:
            bits.append(f"1등 {r['top_score']}" if r["top_score"] is not None else "조각 없음")
            bits.append(f"글 {r['posts']}")
            if exp:
                bits.append(f"정답 글 {len(exp & set(r['posts']))}/{len(exp)}")
            if "tag_match" in r:
                bits.append(f"태그 맞는 글 {len(r['tag_match'])}/{len(r['posts'])}")
            tags = (r.get("intent") or {}).get("career_paths", []) + (r.get("intent") or {}).get("career_fields", [])
            if tags:
                bits.append(f"뽑은 태그 {tags}")
        print(" | ".join(bits) + f"  « {q['question'][:30].replace(chr(10), ' ')}")

    print("\n===== 요약 =====")
    summary = summarize(questions, rows, settings.max_posts)
    print_summary("지금 설정", summary)

    sweep = []
    if args.sweep:
        print("\n===== 설정 조합 (하한 / 조각 수 / 글 수 / 태그 자리) =====")
        for floor in (0.3, 0.2, 0.0):
            for top_k in (8, 15):
                for max_posts in (3, 5):
                    for reserved in (0, 1, 2, 3):
                        if reserved > max_posts or (args.no_intent and reserved):
                            continue
                        s2 = dataclasses.replace(
                            settings, similarity_floor=floor, top_k=top_k, max_posts=max_posts, tag_reserved_posts=reserved
                        )
                        p2 = RagPipeline(pipeline.embedder, pipeline.store, None, s2, pipeline.intent_analyzer)
                        r2 = {q["id"]: retrieve_one(p2, q) for q in questions}
                        sm = summarize(questions, r2, max_posts)
                        sweep.append({"floor": floor, "top_k": top_k, "max_posts": max_posts, "reserved": reserved, **sm})
                        print_summary(f"{floor:.1f} / {top_k:2d} / {max_posts} / {reserved}", sm)

    pipeline.embedder.cache.save()
    if pipeline.intent_analyzer:
        pipeline.intent_analyzer.cache.save()
    path = save("retrieval", {"settings": dataclasses.asdict(settings), "summary": summary, "rows": rows, "sweep": sweep})
    print(f"\n새로 부른 유료 호출: 임베딩 {pipeline.embedder.cache.new}건, 의도 분석 "
          f"{pipeline.intent_analyzer.cache.new if pipeline.intent_analyzer else 0}건 | 저장: {path}")


# ---------------------------------------------------------------------------
# 2) 의도 분류만
# ---------------------------------------------------------------------------
def run_intent(args, settings: RagSettings) -> None:
    from app.rag.intent import ClaudeIntentAnalyzer

    cases = json.loads(Path(args.intent).read_text(encoding="utf-8"))
    analyzer = CachingIntentAnalyzer(
        ClaudeIntentAnalyzer(settings.intent_model, timeout=settings.intent_timeout_seconds), settings.intent_model
    )
    rows, ok = [], 0
    for case in cases:
        text = case["text"]
        if looks_like_crisis(text):
            rows.append({"text": text, "route": "crisis"})
            print(f"  (위기 단어에 걸려 분류 전에 상담 안내) | {text}")
            continue
        r = analyzer.analyze(text)
        if r is None:
            rows.append({"text": text, "got": None})
            print(f"✗ (분석 실패) | {text}")
            continue
        problems = []
        if r.intent not in case["intent"]:
            problems.append(f"갈래 {r.intent} (기대 {case['intent']})")
        if case.get("aspect") and r.intent == "about_service" and r.about_aspect not in case["aspect"]:
            problems.append(f"측면 {r.about_aspect} (기대 {case['aspect']})")
        if "greeting" in case and r.has_greeting != case["greeting"]:
            problems.append(f"인사 {r.has_greeting} (기대 {case['greeting']})")
        for key in ("career_paths", "career_fields"):
            if key in case and sorted(getattr(r, key)) != sorted(case[key]):
                problems.append(f"{key} {getattr(r, key)} (기대 {case[key]})")
        ok += not problems
        rows.append({"text": text, "got": r.model_dump(), "problems": problems})
        if problems:
            print(f"✗ {' / '.join(problems)} | {text}")
    analyzer.cache.save()
    path = save("intent", {"model": settings.intent_model, "ok": ok, "total": len(cases), "rows": rows})
    print(f"\n{ok}/{len(cases)} 일치 | 새로 부른 분류 호출 {analyzer.cache.new}건 | 저장: {path}")


# ---------------------------------------------------------------------------
# 3) 전체 (답변 모델 호출 → 비용 발생)
# ---------------------------------------------------------------------------
def format_problems(structured) -> list[str]:
    """카드형 답변이 지시한 모양을 지켰는지 (docs/proposals/answer-quality-audit.md 의 E 유형)."""
    problems = []
    if structured is None:
        return problems
    if len(structured.headline) > 45:
        problems.append(f"머리말 {len(structured.headline)}자")
    for n, card in enumerate(structured.cards, start=1):
        if len(card.body) > 3:
            problems.append(f"카드{n} 조각 {len(card.body)}개")
        if card.one_liner and "지금은" in card.one_liner:
            problems.append(f"카드{n} 한 줄 소개에 '지금은'")
        if any(piece.split(" ")[0].endswith("선배는") or "선배는 " in piece[:16] for piece in card.body):
            problems.append(f"카드{n} 조각이 '~선배는'으로 시작")
    return problems


def run_full(args, settings: RagSettings) -> None:
    questions = load_questions(args.questions)
    if not args.confirm_cost:
        print(f"전체 측정은 질문 {len(questions)}개마다 답변 모델({settings.claude_model})을 부릅니다. 실제 비용이 나갑니다.\n"
              "실행하려면 --confirm-cost 를 붙이세요. 검색만 보려면 --retrieval-only 를 쓰세요.")
        sys.exit(2)
    pipeline = build(settings, args.local, with_intent=not args.no_intent, with_generator=True)
    rows, type_ok, src_hit, src_total, failed = [], 0, 0, 0, 0
    for q in questions:
        started = time.time()
        result = pipeline.answer(q["question"])
        seconds = round(time.time() - started, 1)
        ok = result.answer_type == q["expected_type"]
        type_ok += ok
        failed += result.failed
        got_sources = sorted({s.source_id for s in result.sources})
        exp = set(q.get("expected_source_ids") or [])
        if q["expected_type"] == "answer" and exp:
            src_total += 1
            src_hit += bool(exp & set(got_sources))
        problems = format_problems(result.structured)
        rows.append({
            "id": q["id"], "question": q["question"], "expected_type": q["expected_type"], "answer_type": result.answer_type,
            "intent": result.intent, "seconds": seconds, "sources": got_sources, "failed": result.failed,
            "cards": len(result.structured.cards) if result.structured else 0, "format_problems": problems,
            "answer": result.answer,
        })
        print(f"[{q['id']}] {result.answer_type} {'✓' if ok else '✗ (기대 ' + q['expected_type'] + ')'} | {seconds}s | "
              f"카드 {rows[-1]['cards']} | 글 {got_sources}" + (f" | 형식: {problems}" if problems else "")
              + (" ⚠️ API 오류 (서버 로그 확인)" if result.failed else ""))
    pipeline.embedder.cache.save()
    if pipeline.intent_analyzer:
        pipeline.intent_analyzer.cache.save()
    path = save("full", {"settings": dataclasses.asdict(settings), "rows": rows})
    times = sorted(r["seconds"] for r in rows)
    print("\n===== 요약 =====")
    print(f"answer_type 정확도: {type_ok}/{len(questions)}")
    if src_total:
        print(f"출처 적중률: {src_hit}/{src_total}")
    print(f"형식 문제가 있는 답변: {sum(1 for r in rows if r['format_problems'])}개 | 응답 시간 중앙 {times[len(times)//2]}s, 최대 {times[-1]}s")
    if failed:
        print(f"⚠️ API 오류로 측정이 안 된 질문: {failed}개 — 위 숫자는 믿을 수 없어요. 다시 돌려 주세요.")
    print(f"답변 전체 저장: {path}  (원문을 풀어 쓴 글이 들어 있으니 밖에 올리지 않는다)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("questions", nargs="*", help="질문 세트 JSON (여러 개 가능)")
    parser.add_argument("--local", help="임베딩 포함 Chunk 모양 jsonl (없으면 Supabase 사용)")
    parser.add_argument("--retrieval-only", action="store_true", help="답변 모델을 부르지 않고 검색만 측정")
    parser.add_argument("--sweep", action="store_true", help="(검색만) 설정 조합을 바꿔 가며 비교")
    parser.add_argument("--no-intent", action="store_true", help="의도 분석을 건너뛴다 (태그 우선 검색 없음)")
    parser.add_argument("--intent", metavar="CASES_JSON", help="의도 분류만 측정")
    parser.add_argument("--confirm-cost", action="store_true", help="전체 측정(답변 모델 호출, 비용 발생)을 실행한다")
    args = parser.parse_args()

    load_dotenv(ROOT / "backend" / ".env")
    settings = RagSettings.from_env()
    if args.intent:
        run_intent(args, settings)
    elif not args.questions:
        parser.error("질문 세트 JSON 이 필요해요 (또는 --intent CASES_JSON)")
    elif args.retrieval_only:
        run_retrieval(args, settings)
    else:
        run_full(args, settings)


if __name__ == "__main__":
    main()
