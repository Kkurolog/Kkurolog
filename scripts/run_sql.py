"""Supabase(Postgres)에 SQL 파일이나 쿼리를 실행한다.

접속 주소는 scripts/.env 의 SUPABASE_DB_URL (대시보드 → Connect → Session pooler 주소).
비밀번호에 @ # / % 같은 특수문자가 있어도 되도록, 주소를 직접 나눠서 접속한다.

사용
  python run_sql.py --test                                   # 접속만 확인 (select 1)
  python run_sql.py ../supabase/migrations/0001_experience_tables.sql
  python run_sql.py --query "select count(*) from public.chunks"

- 파일은 한 트랜잭션으로 실행한다. 중간에 오류가 나면 전부 취소(rollback)되어 반쯤 실행된 상태가 남지 않는다.
- 오류가 나면 오류 메시지와 SQL 파일의 몇 번째 줄 근처인지 보여준다.
- 접속 주소와 비밀번호는 화면에 출력하지 않는다.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path
from urllib.parse import parse_qsl, unquote

import psycopg
from dotenv import load_dotenv

ENV_PATH = Path(__file__).resolve().parent / ".env"


def parse_db_url(url: str) -> dict:
    """postgresql://user:password@host:port/dbname?sslmode=require 를 나눈다.
    비밀번호 안의 @ 는 마지막 @ 를 기준으로 나눠서 처리한다."""
    m = re.match(r"^postgres(?:ql)?://(.+)$", url.strip())
    if not m:
        raise ValueError("SUPABASE_DB_URL은 postgresql:// 로 시작해야 해요.")
    rest = m.group(1)
    userinfo, _, hostpart = rest.rpartition("@")
    if not userinfo:
        raise ValueError("SUPABASE_DB_URL에 사용자 이름과 비밀번호(user:password@)가 없어요.")
    user, _, password = userinfo.partition(":")
    hostpart, _, query = hostpart.partition("?")
    hostport, _, dbname = hostpart.partition("/")
    host, _, port = hostport.rpartition(":") if ":" in hostport else (hostport, "", "")
    params = dict(parse_qsl(query))
    return {
        "host": host, "port": int(port or 5432), "dbname": dbname or "postgres",
        "user": unquote(user), "password": password,
        "sslmode": params.get("sslmode", "require"),
    }


def connect() -> psycopg.Connection:
    load_dotenv(ENV_PATH)
    url = os.environ.get("SUPABASE_DB_URL", "").strip()
    if not url:
        sys.exit("scripts/.env 에 SUPABASE_DB_URL이 없어요. (.env.example 참고)")
    info = parse_db_url(url)
    raw = info.pop("password")
    # 비밀번호를 그대로 한 번, 퍼센트 인코딩(%40 등)을 풀어서 한 번 시도한다
    candidates = [raw] + ([unquote(raw)] if unquote(raw) != raw else [])
    last_err = None
    for pw in candidates:
        try:
            return psycopg.connect(**info, password=pw, connect_timeout=15)
        except psycopg.OperationalError as e:
            last_err = e
            if "password authentication failed" not in str(e):
                break
    sys.exit(f"❌ 접속 실패 ({info['host']}:{info['port']}, 사용자 {info['user']})\n   {last_err}")


def print_rows(cur: psycopg.Cursor):
    if cur.description is None:
        print(f"   (완료, 영향받은 행 {cur.rowcount})")
        return
    cols = [d.name for d in cur.description]
    rows = cur.fetchall()
    widths = [max(len(str(c)), *(len(str(r[i])) for r in rows)) if rows else len(str(c)) for i, c in enumerate(cols)]
    widths = [min(w, 60) for w in widths]
    line = lambda vals: " | ".join(str(v)[:60].ljust(w) for v, w in zip(vals, widths))
    print("   " + line(cols))
    print("   " + "-+-".join("-" * w for w in widths))
    for r in rows:
        print("   " + line(r))
    print(f"   ({len(rows)}행)")


def show_error(e: psycopg.Error, sql: str | None = None):
    d = e.diag
    print(f"❌ 오류: {d.message_primary or e}")
    if d.message_detail:
        print(f"   자세히: {d.message_detail}")
    if d.message_hint:
        print(f"   힌트: {d.message_hint}")
    if sql and d.statement_position:
        pos = int(d.statement_position)
        line_no = sql.count("\n", 0, pos) + 1
        lines = sql.splitlines()
        print(f"   위치: {line_no}번째 줄 근처")
        for n in range(max(1, line_no - 2), min(len(lines), line_no + 2) + 1):
            print(f"   {'>>' if n == line_no else '  '} {n:4} | {lines[n - 1]}")
    print("   → 트랜잭션을 취소했어요 (DB는 실행 전 상태 그대로).")


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description="Supabase에 SQL 실행")
    ap.add_argument("file", nargs="?", type=Path, help="실행할 .sql 파일")
    ap.add_argument("--query", help="한 줄 쿼리 실행")
    ap.add_argument("--test", action="store_true", help="접속만 확인 (select 1)")
    args = ap.parse_args()

    with connect() as conn:
        info = conn.info
        print(f"✅ 접속 성공: {info.host}:{info.port} / DB {info.dbname} / 사용자 {info.user} / Postgres {info.server_version // 10000}")
        if args.test:
            with conn.cursor() as cur:
                cur.execute("select 1 as ok")
                print_rows(cur)
            return
        if args.file:
            sql = args.file.read_text(encoding="utf-8")
            label = str(args.file)
        elif args.query:
            sql, label = args.query, "쿼리"
        else:
            ap.error("파일 경로, --query, --test 중 하나를 주세요.")
        print(f"▶ 실행: {label}")
        try:
            with conn.cursor() as cur:
                cur.execute(sql)
                # 여러 문장이면 결과(표)가 있는 것만 차례로 보여준다
                shown = False
                while True:
                    if cur.description is not None:
                        print_rows(cur)
                        shown = True
                    if not cur.nextset():
                        break
                if not shown:
                    print("   (완료, 돌려줄 결과 없음)")
            conn.commit()
            print("✅ 완료 (commit)")
        except psycopg.Error as e:
            conn.rollback()
            show_error(e, sql)
            sys.exit(1)


if __name__ == "__main__":
    main()
