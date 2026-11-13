"""Supabase chunks 테이블의 embedding 칸을 채운다 (OpenAI 임베딩).

- 각 조각의 embed_text([별명 | 진로 요약 | 기관 | 질문] + 답변)를 OpenAI 임베딩 모델에 보내
  숫자 1536개짜리 벡터를 받아 chunks.embedding, chunks.embedding_model 에 저장한다.
- scripts/.env 의 SUPABASE_DB_URL(DB 접속), OPENAI_API_KEY 를 쓴다.
- 기본: embedding 이 비어 있거나, 다른 모델로 만든 조각만 채운다 → 여러 번 돌려도 돈이 다시 들지 않는다.
- 모든 벡터를 먼저 다 받은 뒤 한 트랜잭션으로 저장한다. 중간에 실패하면 DB는 그대로다.
- 끝나면 개수를 다시 세고, "조각 하나의 벡터로 검색하면 자기 자신이 1등으로 나오는지" 확인한다.

⚠️ 모델은 backend/app/rag/config.py 의 embedding_model 과 반드시 같아야 한다.
   (질문과 조각을 같은 모델로 벡터로 바꿔야 비교가 된다. 다르면 검색이 엉망이 된다)

⚠️ load_to_supabase.py 로 embed_text 를 바꿔 다시 올리면 예전 벡터가 그대로 남는다.
   path_summary·기관·질문·답변을 고쳤다면 --all 로 전부 다시 만든다. (태그만 고쳤으면 필요 없음:
   태그는 embed_text 에 들어가지 않는다)

사용
  python embed_chunks.py --dry-run   # OpenAI 호출 없이 몇 개를 만들지·예상 비용만 보기
  python embed_chunks.py             # 비어 있는 조각만 채우기
  python embed_chunks.py --all       # 전부 다시 만들기
"""

from __future__ import annotations

import argparse
import os
import sys
import time

import requests
from dotenv import load_dotenv

from run_sql import ENV_PATH, connect  # DB 접속 방법은 run_sql.py 와 같게 한다

MODEL = "text-embedding-3-small"  # backend/app/rag/config.py 의 embedding_model 과 같게
DIMENSIONS = 1536  # supabase/migrations/0001 의 vector(1536) 과 같게
PRICE_PER_1M_TOKENS = 0.02  # 달러. text-embedding-3-small 기준 (OpenAI 가격표에서 확인)
BATCH = 100  # OpenAI 에 한 번에 보낼 조각 수
OPENAI_URL = "https://api.openai.com/v1/embeddings"


def fetch_targets(conn, redo_all: bool) -> list[tuple[str, str]]:
    sql = "select id, embed_text from public.chunks"
    if not redo_all:
        sql += " where embedding is null or embedding_model is distinct from %(model)s"
    with conn.cursor() as cur:
        cur.execute(sql + " order by id", {"model": MODEL})
        return cur.fetchall()


def embed_batch(session: requests.Session, texts: list[str]) -> list[list[float]]:
    """OpenAI 에 한 묶음을 보낸다. 429(너무 많이 보냄)·5xx(서버 문제)는 잠깐 쉬고 3번까지 다시 시도."""
    for attempt in range(4):
        r = session.post(OPENAI_URL, json={"model": MODEL, "input": texts}, timeout=60)
        if r.status_code == 200:
            data = sorted(r.json()["data"], key=lambda d: d["index"])  # 보낸 순서대로 맞춘다
            return [d["embedding"] for d in data]
        if r.status_code in (429, 500, 502, 503) and attempt < 3:
            wait = 2 ** (attempt + 1)
            print(f"   ⏳ OpenAI {r.status_code} → {wait}초 후 다시 시도")
            time.sleep(wait)
            continue
        try:
            msg = r.json().get("error", {}).get("message", r.text[:300])
        except ValueError:
            msg = r.text[:300]
        sys.exit(f"❌ OpenAI 임베딩 실패 (HTTP {r.status_code}): {msg}\n   DB는 바뀌지 않았어요.")
    raise AssertionError("unreachable")


def to_vector_literal(vec: list[float]) -> str:
    """pgvector 가 읽는 글자 모양: [0.1,0.2,...]"""
    return "[" + ",".join(repr(x) for x in vec) + "]"


def self_check(conn) -> None:
    """조각 하나의 벡터로 match_chunks 를 불러, 그 조각이 1등(유사도 ≈ 1.0)으로 나오는지 본다."""
    with conn.cursor() as cur:
        cur.execute(
            "select id, embedding from public.chunks "
            "where embedding is not null and visibility in ('L1','L2','L3') order by id limit 1"
        )
        row = cur.fetchone()
        if not row:
            print("⚠️ 검색 확인 건너뜀: 검색 가능한(L1~L3) 조각이 없어요.")
            return
        cid, emb = row
        cur.execute("select chunk_id, similarity from public.match_chunks(%s::extensions.vector, 3)", (emb,))
        hits = cur.fetchall()
    top = hits[0] if hits else None
    ok = top is not None and top[0] == cid and top[1] > 0.99
    print(f"{'✅' if ok else '⚠️'} 검색 확인: [{cid}] 의 벡터로 검색 → 1등 "
          + (f"[{top[0]}] 유사도 {top[1]:.3f}" if top else "결과 없음"))
    for h in hits[1:]:
        print(f"      다음: [{h[0]}] 유사도 {h[1]:.3f}")


def main() -> None:
    for stream in (sys.stdout, sys.stderr):  # 윈도우 터미널에서 한글이 깨지지 않게
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--all", action="store_true", help="이미 있는 벡터도 전부 다시 만든다")
    parser.add_argument("--dry-run", action="store_true", help="OpenAI 를 부르지 않고 대상 개수·예상 비용만 출력")
    args = parser.parse_args()

    load_dotenv(ENV_PATH)
    conn = connect()
    targets = fetch_targets(conn, args.all)
    chars = sum(len(t) for _, t in targets)
    # 한국어는 대략 글자 1개 ≈ 토큰 1개 이하라, 글자 수를 토큰 수의 넉넉한 어림값으로 쓴다
    print(f"모델 {MODEL} / 대상 조각 {len(targets)}개 / 약 {chars:,}자 "
          f"(예상 비용 최대 약 ${chars / 1_000_000 * PRICE_PER_1M_TOKENS:.4f})")
    if not targets:
        print("✅ 채울 조각이 없어요. 전부 다시 만들려면 --all")
        self_check(conn)
        return
    if args.dry_run:
        print("(--dry-run 이라 여기서 멈춰요)")
        return

    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        sys.exit("scripts/.env 에 OPENAI_API_KEY 가 필요해요. (.env.example 참고)")
    session = requests.Session()
    session.headers["Authorization"] = f"Bearer {key}"

    # 1. 벡터를 전부 먼저 받는다 (DB는 아직 안 건드림)
    vectors: list[list[float]] = []
    for i in range(0, len(targets), BATCH):
        part = targets[i:i + BATCH]
        vecs = embed_batch(session, [t for _, t in part])
        if len(vecs) != len(part) or any(len(v) != DIMENSIONS for v in vecs):
            sys.exit(f"❌ 벡터 개수나 길이가 이상해요 (기대: {len(part)}개 × {DIMENSIONS}). DB는 바뀌지 않았어요.")
        vectors.extend(vecs)
        print(f"   {min(i + BATCH, len(targets))}/{len(targets)} 받음")

    # 2. 한 트랜잭션으로 저장
    with conn.transaction(), conn.cursor() as cur:
        cur.executemany(
            "update public.chunks set embedding = %s::extensions.vector, embedding_model = %s where id = %s",
            [(to_vector_literal(v), MODEL, cid) for (cid, _), v in zip(targets, vectors)],
        )
    conn.commit()

    # 3. 다시 세어 확인
    with conn.cursor() as cur:
        cur.execute("select count(*), count(embedding), count(*) filter (where embedding_model = %s) "
                    "from public.chunks", (MODEL,))
        total, filled, same_model = cur.fetchone()
    print(f"{'✅' if filled == total == same_model else '⚠️'} 저장 완료: 조각 {total}개 중 벡터 {filled}개 "
          f"({MODEL} {same_model}개)")
    self_check(conn)


if __name__ == "__main__":
    main()
