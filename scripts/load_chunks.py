"""
chunk(jsonl)에 임베딩을 붙여 저장한다. ⚠️ OpenAI 임베딩 API 를 호출한다 (적은 금액이지만 비용 발생).

  --local 출력.jsonl : Supabase 없이 임베딩 포함 jsonl 로 저장 (로컬 개발용)
  (옵션 없음)        : Supabase kkurolog_chunks 테이블에 upsert (scripts/sql/kkurolog_chunks.sql 먼저 실행)

필요한 환경변수 (backend/.env): OPENAI_API_KEY, (Supabase 쓸 때) SUPABASE_URL, SUPABASE_KEY

실행 (backend 폴더에서, venv 켠 상태, pip install -r requirements-rag.txt 후):
  python ../scripts/load_chunks.py ../data/raw/chunks.jsonl --local ../data/raw/chunks_embedded.jsonl
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from dotenv import load_dotenv  # noqa: E402

from app.rag.config import RagSettings  # noqa: E402
from app.rag.embedding import OpenAIEmbedder  # noqa: E402
from app.rag.models import Chunk  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("chunks", help="build_chunks.py 가 만든 jsonl")
    parser.add_argument("--local", help="Supabase 대신 저장할 jsonl 경로")
    args = parser.parse_args()

    load_dotenv(Path(__file__).resolve().parent.parent / "backend" / ".env")
    settings = RagSettings.from_env()

    with Path(args.chunks).open(encoding="utf-8") as f:
        chunks = [Chunk.model_validate(json.loads(line)) for line in f if line.strip()]
    chunks = [c for c in chunks if c.visibility != "L0"]
    print(f"chunk {len(chunks)}개 임베딩 중... (모델: {settings.embedding_model})")

    vectors = OpenAIEmbedder(settings.embedding_model).embed([c.embed_text for c in chunks])
    for c, v in zip(chunks, vectors):
        c.embedding = v

    if args.local:
        out = Path(args.local)
        out.parent.mkdir(parents=True, exist_ok=True)
        with out.open("w", encoding="utf-8") as f:
            for c in chunks:
                f.write(c.model_dump_json() + "\n")
        print(f"저장: {out}")
    else:
        from app.rag.store import SupabaseVectorStore

        SupabaseVectorStore().upsert(chunks)
        print("Supabase 에 저장했어요.")


if __name__ == "__main__":
    main()
