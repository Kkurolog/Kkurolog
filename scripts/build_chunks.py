"""
글(JSON) → chunk(jsonl). API 호출 없음, 비용 없음.

입력: 글 목록 JSON 파일 (형식은 scripts/examples/sample_posts.json 참고)
      실제 데이터는 data/raw/ 에 둔다 (git 에 올라가지 않는다)
      글마다: post_id, post_type(interview|letter|essay), html, visibility(L0~L3),
             title, nickname, career_tags, date, url
출력: chunk 를 한 줄에 하나씩 쓴 jsonl (임베딩 없음)

실행 (backend 폴더에서, venv 켠 상태):
  python ../scripts/build_chunks.py ../scripts/examples/sample_posts.json ../data/raw/chunks.jsonl
"""

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.rag.chunking import chunk_post  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("posts", help="글 목록 JSON 파일")
    parser.add_argument("output", help="출력 jsonl 경로")
    args = parser.parse_args()

    posts = json.loads(Path(args.posts).read_text(encoding="utf-8"))
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)

    count = Counter()
    with out.open("w", encoding="utf-8") as f:
        for post in posts:
            chunks = chunk_post(post)
            if not chunks:
                count["skipped_posts"] += 1
            for c in chunks:
                f.write(c.model_dump_json(exclude={"embedding"}) + "\n")
                count["chunks"] += 1
                count[f"type:{c.post_type}"] += 1

    print(f"글 {len(posts)}개 → chunk {count['chunks']}개 (L0 등으로 건너뛴 글 {count['skipped_posts']}개)")
    print({k: v for k, v in count.items() if k.startswith("type:")})
    print(f"저장: {out}")


if __name__ == "__main__":
    main()
