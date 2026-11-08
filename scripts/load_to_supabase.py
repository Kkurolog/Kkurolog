"""data/processed 의 sources / people / chunks 를 Supabase 테이블에 넣는다.

- scripts/.env 의 SUPABASE_URL, SUPABASE_SECRET_KEY(service_role 권한)를 쓴다.
- 순서: sources → people → chunks (chunks가 앞의 두 테이블을 외래키로 가리키기 때문)
- 모두 id 기준 upsert: 이미 있으면 덮어쓰고 없으면 새로 넣는다. 여러 번 돌려도 중복이 생기지 않는다.
- embedding, embedding_model 은 보내지 않는다 (임베딩은 다음 단계). 이미 채워진 값이 있으면 그대로 남는다.
- 끝나면 테이블별 개수를 DB에서 다시 읽어 확인하고, 조각 샘플 2개를 보여준다.

사용: python load_to_supabase.py   (먼저 build_dataset.py, check_tags.py 가 통과해야 한다)
"""

from __future__ import annotations

import json
import os
import random
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

HERE = Path(__file__).resolve().parent
PROCESSED = HERE.parent / "data" / "processed"
BATCH = 100
TABLES = [  # (테이블, 파일, 보낼 칸)
    ("sources", "sources.json", ["id", "title", "url", "published_at", "source_type", "site", "visibility"]),
    ("people", "people.json", ["id", "nickname", "real_name", "speaker_type", "path_summary",
                               "career_paths", "path_detail", "career_fields", "field_detail",
                               "organizations", "as_of_date", "is_mentor", "source_ids"]),
    ("chunks", "chunks.json", ["id", "source_id", "person_id", "chunk_index", "question", "content",
                               "embed_text", "topics", "topic_detail", "career_paths", "career_fields",
                               "speaker_type", "visibility", "char_count"]),
]


def api():
    load_dotenv(HERE / ".env")
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SECRET_KEY", "")
    if not url or not key:
        sys.exit("scripts/.env 에 SUPABASE_URL, SUPABASE_SECRET_KEY 가 필요해요.")
    s = requests.Session()
    s.headers.update({"apikey": key, "Content-Type": "application/json"})
    if key.startswith("eyJ"):  # 예전 형식(JWT) service_role 키는 Authorization 헤더도 필요
        s.headers["Authorization"] = f"Bearer {key}"
    return s, f"{url}/rest/v1"


def check(resp: requests.Response, what: str):
    if resp.status_code >= 300:
        try:
            body = resp.json()
            msg = body.get("message") or body
            hint = body.get("hint") or body.get("details") or ""
        except ValueError:
            msg, hint = resp.text[:300], ""
        sys.exit(f"❌ {what} 실패 (HTTP {resp.status_code}): {msg}" + (f"\n   {hint}" if hint else ""))


def count(s, base, table) -> int:
    r = s.head(f"{base}/{table}?select=id", headers={"Prefer": "count=exact", "Range": "0-0"})
    check(r, f"{table} 개수 세기")
    return int(r.headers.get("Content-Range", "*/0").split("/")[-1])


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    s, base = api()

    for table, fname, cols in TABLES:
        rows = [{c: r[c] for c in cols} for r in json.loads((PROCESSED / fname).read_text(encoding="utf-8"))]
        before = count(s, base, table)
        for i in range(0, len(rows), BATCH):
            part = rows[i:i + BATCH]
            r = s.post(f"{base}/{table}?on_conflict=id", data=json.dumps(part, ensure_ascii=False).encode("utf-8"),
                       headers={"Prefer": "resolution=merge-duplicates,return=minimal"})
            check(r, f"{table} {i + 1}~{i + len(part)}번째 넣기")
        after = count(s, base, table)
        ok = "✅" if after >= len(rows) else "⚠️"
        print(f"{ok} {table:<8} 파일 {len(rows)}개 → DB {before}개에서 {after}개")

    # 다시 읽어서 확인: 조각 샘플 2개 (매번 같은 샘플이 나오게 고정)
    ids = [c["id"] for c in json.loads((PROCESSED / "chunks.json").read_text(encoding="utf-8"))]
    pick = random.Random(42).sample(ids, 2)
    r = s.get(f"{base}/chunks", params={
        "id": f"in.({','.join(pick)})",
        "select": "id,chunk_index,question,content,topics,career_paths,career_fields,visibility,"
                  "embedding_model,embedding,sources(title,url),people(nickname,path_summary)"})
    check(r, "샘플 읽기")
    print("\n===== DB에서 다시 읽은 조각 샘플 =====")
    for c in r.json():
        print(f"\n[{c['id']}] {c['people']['nickname']} | {c['sources']['title']}")
        print(f"  출처: {c['sources']['url']}")
        print(f"  경로 요약: {c['people']['path_summary']}")
        print(f"  질문: {c['question'] or '(에세이, 질문 없음)'}")
        print(f"  답변 앞부분: {c['content'][:160].replace(chr(10), ' ')}…")
        print(f"  topics={c['topics']} career_paths={c['career_paths']} career_fields={c['career_fields']}")
        print(f"  visibility={c['visibility']} embedding={'있음' if c['embedding'] else 'null'} embedding_model={c['embedding_model']}")


if __name__ == "__main__":
    main()
