"""청킹 결과 + 태깅 결과 + TAGS.md를 합쳐 최종 데이터와 검수용 CSV를 만든다.

입력
  data/processed/base/sources_base.json, chunks_base.json   (chunk_gschool.py 결과)
  data/processed/tags/batch_*.json                          (태깅 결과: people, chunks)
  docs/TAGS.md                                              (code → 한글 이름)
출력
  data/processed/sources.json   글 단위
  data/processed/people.json    인물 단위
  data/processed/chunks.json    조각 단위 (embed_text 포함)
  data/processed/review_chunks.csv   검수용: 조각 (UTF-8 BOM, 엑셀·구글 시트에서 한글 안 깨짐)
  data/processed/review_people.csv   검수용: 인물

embed_text 형식 (검색용, 실명은 넣지 않음)
  [별명 | 진로 경로 요약 | 기관: A, B | 질문: …]
  답변 원문
  - 기관이 없으면 "기관: …" 부분, 질문이 없으면(에세이) "질문: …" 부분을 뺀다.
"""

from __future__ import annotations

import csv
import json
import sys
from collections import Counter
from pathlib import Path

from check_tags import load_tags

ROOT = Path(__file__).resolve().parent.parent
PROCESSED = ROOT / "data" / "processed"
BASE = PROCESSED / "base"
VISIBILITY = "L1"  # 학교 사용 허락 전: 익명으로 답변 근거만 (docs/DATA.md 공개 등급)
SITE = "gschool.kr"


def read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write(path: Path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def labels(active, kind, codes):
    return [active.get((kind, c), c) for c in codes]


def embed_text(person: dict, question: str, content: str) -> str:
    head = [person["nickname"], person["path_summary"]]
    if person["organizations"]:
        head.append("기관: " + ", ".join(person["organizations"]))
    if question:
        head.append("질문: " + question)
    return "[" + " | ".join(h for h in head if h) + "]\n" + content


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    active, _ = load_tags()
    base_sources = read(BASE / "sources_base.json")
    base_chunks = read(BASE / "chunks_base.json")

    people, chunk_tags = {}, {}
    for f in sorted((PROCESSED / "tags").glob("batch_*.json")):
        d = read(f)
        for p in d["people"]:
            people[p["id"]] = p
        for c in d["chunks"]:
            chunk_tags[c["id"]] = c

    # (글번호, 화자) → 인물
    who = {(s["source_id"], s["speaker"]): p for p in people.values() for s in p["sources"]}

    sources = [{
        "id": s["id"], "title": s["title"], "url": s["url"], "published_at": s["published_at"],
        "source_type": s["source_type"], "site": SITE, "visibility": VISIBILITY,
    } for s in base_sources]

    people_out = [{
        "id": p["id"], "nickname": p["nickname"], "real_name": p["real_name"],
        "speaker_type": p["speaker_type"], "path_summary": p["path_summary"],
        "career_paths": p["career_paths"], "path_detail": p["path_detail"],
        "career_fields": p["career_fields"], "field_detail": p["field_detail"],
        "organizations": p["organizations"], "as_of_date": p["as_of_date"],
        "is_mentor": False,
        "source_ids": sorted({s["source_id"] for s in p["sources"]}),
    } for p in sorted(people.values(), key=lambda p: p["id"])]

    chunks, missing = [], []
    for c in base_chunks:
        p = who.get((c["source_id"], c["speaker"]))
        t = chunk_tags.get(c["id"])
        if p is None or t is None:
            missing.append(c["id"])
            continue
        chunks.append({
            "id": c["id"], "source_id": c["source_id"], "person_id": p["id"],
            "chunk_index": c["chunk_index"], "question": c["question"], "content": c["content"],
            "embed_text": embed_text(p, c["question"], c["content"]),
            "topics": t["topics"], "topic_detail": t.get("topic_detail", []),
            "career_paths": p["career_paths"], "career_fields": p["career_fields"],
            "speaker_type": p["speaker_type"], "visibility": VISIBILITY,
            "char_count": c["char_count"],
        })
    if missing:
        sys.exit(f"태그나 인물이 없는 조각이 있어요: {missing}")

    write(PROCESSED / "sources.json", sources)
    write(PROCESSED / "people.json", people_out)
    write(PROCESSED / "chunks.json", chunks)

    # 검수용 CSV (한글 이름으로 보여준다. apply_review.py는 한글 이름·code 둘 다 읽는다)
    nick = {p["id"]: p["nickname"] for p in people_out}
    with open(PROCESSED / "review_chunks.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "별명", "질문", "답변 앞 150자", "topics", "topic_detail",
                    "career_paths(참고)", "career_fields(참고)", "수정 메모"])
        for c in chunks:
            w.writerow([c["id"], nick[c["person_id"]], c["question"], c["content"][:150].replace("\n", " "),
                        ", ".join(labels(active, "topic", c["topics"])), ", ".join(c["topic_detail"]),
                        ", ".join(labels(active, "career_path", c["career_paths"])),
                        ", ".join(labels(active, "career_field", c["career_fields"])), ""])
    with open(PROCESSED / "review_people.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "별명", "실명", "진로 경로 요약(path_summary)", "career_paths", "path_detail",
                    "career_fields", "field_detail", "organizations", "as_of_date", "글번호", "수정 메모"])
        for p in people_out:
            w.writerow([p["id"], p["nickname"], p["real_name"], p["path_summary"],
                        ", ".join(labels(active, "career_path", p["career_paths"])), ", ".join(p["path_detail"]),
                        ", ".join(labels(active, "career_field", p["career_fields"])), ", ".join(p["field_detail"]),
                        ", ".join(p["organizations"]), p["as_of_date"], ", ".join(p["source_ids"]), ""])

    # ---------- 요약 ----------
    print(f"글 {len(sources)}개 / 인물 {len(people_out)}명 / 조각 {len(chunks)}개")
    lens = sorted(c["char_count"] for c in chunks)
    bins = [(0, 100), (100, 200), (200, 400), (400, 600), (600, 800), (800, 1001)]
    print("조각 길이:", f"최소 {lens[0]}, 중간 {lens[len(lens)//2]}, 최대 {lens[-1]}, 평균 {sum(lens)//len(lens)}")
    print("  " + " / ".join(f"{a}~{b-1}자 {sum(a <= x < b for x in lens)}개" for a, b in bins))

    def show(title, counter, kind, total, unit):
        print(f"\n{title}")
        for code, n in counter.most_common():
            print(f"  {active.get((kind, code), code):<10} ({code}) {n}{unit}  ({n/total:.0%})")

    show("[topic] 조각 수 (조각 하나에 1~2개)", Counter(t for c in chunks for t in c["topics"]), "topic", len(chunks), "개")
    show("[career_path] 인물 수", Counter(t for p in people_out for t in p["career_paths"]), "career_path", len(people_out), "명")
    show("[career_field] 인물 수", Counter(t for p in people_out for t in p["career_fields"]), "career_field", len(people_out), "명")
    no_path = [p["nickname"] for p in people_out if not p["career_paths"]]
    no_field = [p["nickname"] for p in people_out if not p["career_fields"]]
    print(f"\n경로 태그 없음: {no_path} / 분야 태그 없음: {no_field}")

    short = [c for c in chunks if c["char_count"] < 60]
    long_ = [c for c in chunks if c["char_count"] > 900]
    print(f"\n짧은 조각(60자 미만) {len(short)}개:")
    for c in short:
        print(f"  {c['id']} ({c['char_count']}자) {nick[c['person_id']]}: {c['content'][:40]}")
    print(f"긴 조각(900자 초과) {len(long_)}개: " + ", ".join(f"{c['id']}({c['char_count']})" for c in long_))
    print(f"\n저장: {PROCESSED}")


if __name__ == "__main__":
    main()
