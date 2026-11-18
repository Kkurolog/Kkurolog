"""멘토 프로필을 Supabase mentors 테이블에 넣는다 (메일 자동화 B-4).

원본: backend/app/data/mentors_demo.json (이름, 엑시트 연도, 진로, 요약, 태그, 주제, 참여 동의)

- 처음 넣는 멘토: 프로필만 넣고 **메일 주소는 비우고, 연락 가능(available)은 false**로 넣는다.
  실제 메일 주소와 연락 가능은 Supabase 대시보드 Table Editor 에서 직접 채운다. (메일 주소가 파일·git 에 남지 않게)
- 이미 있는 멘토: **아무것도 바꾸지 않는다** (기본). 처음 넣은 뒤로는 Supabase(대시보드·관리자 페이지)가 기준이라,
  대시보드에서 고친 이름·메일·연락 가능이 스크립트 때문에 되돌아가지 않는다.
- --update-profiles: 이미 있는 멘토의 **프로필 칸**(이름·연도·진로·요약·태그·주제·참여 동의)을 JSON 내용으로 덮어쓴다.
  email·available·person_id 는 이때도 건드리지 않는다. 대시보드에서 고친 이름도 JSON 이름으로 돌아가니 꼭 필요할 때만 쓴다.
- 한 트랜잭션으로 실행한다. 중간에 오류가 나면 전부 취소된다.
- 화면에는 메일 주소를 출력하지 않는다 (있음/없음만).

사용 (scripts 폴더, 가상환경 켠 상태)
  python load_mentors.py --dry-run          # 무엇을 넣을지 보기만 (DB 변경 없음)
  python load_mentors.py                    # 없는 멘토만 새로 넣기
  python load_mentors.py --update-profiles  # (주의) 이미 있는 멘토의 프로필도 JSON 으로 덮어쓰기

접속: scripts/.env 의 SUPABASE_DB_URL (run_sql.py 와 같음)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import psycopg

from run_sql import connect

MENTORS_JSON = Path(__file__).resolve().parent.parent / "backend" / "app" / "data" / "mentors_demo.json"

PROFILE_FIELDS = ("name", "exit_year", "career_paths", "path_summary", "summary", "tags", "topics", "consent")

INSERT_COLUMNS = """
insert into public.mentors (id, name, exit_year, career_paths, path_summary, summary, tags, topics, consent,
                            available, email)
values (%(id)s, %(name)s, %(exit_year)s, %(career_paths)s, %(path_summary)s, %(summary)s, %(tags)s, %(topics)s,
        %(consent)s, false, null)
"""

# 기본: 없는 멘토만 넣고, 있는 멘토는 그대로 (돌려받는 줄이 없으면 이미 있던 멘토)
INSERT_SQL = INSERT_COLUMNS + """on conflict (id) do nothing
returning id
"""

# --update-profiles: 있는 멘토는 프로필 칸만 덮어씀 (email·available·person_id 는 그대로)
UPSERT_SQL = INSERT_COLUMNS + """on conflict (id) do update set
  name = excluded.name,
  exit_year = excluded.exit_year,
  career_paths = excluded.career_paths,
  path_summary = excluded.path_summary,
  summary = excluded.summary,
  tags = excluded.tags,
  topics = excluded.topics,
  consent = excluded.consent
returning (xmax = 0) as inserted
"""


def load_profiles() -> list[dict]:
    """JSON 에서 프로필 칸만 꺼낸다. (JSON 의 예시 email·available 은 쓰지 않는다)"""
    with MENTORS_JSON.open(encoding="utf-8") as f:
        raw = json.load(f)
    profiles = []
    for m in raw:
        profile = {"id": m["id"]}
        for field in PROFILE_FIELDS:
            value = m.get(field)
            if field in ("career_paths", "tags", "topics"):
                value = list(value or [])
            elif field in ("path_summary", "summary"):
                value = value or ""
            elif field == "consent":
                value = bool(value)
            profile[field] = value
        if not profile["name"]:
            sys.exit(f"❌ {m['id']} 의 name 이 비어 있어요. mentors_demo.json 을 확인하세요.")
        profiles.append(profile)
    return profiles


def show_table(conn: psycopg.Connection) -> None:
    rows = conn.execute(
        "select id, name, consent, available, email is not null from public.mentors order by id"
    ).fetchall()
    print("   id     | 이름              | 참여동의 | 연락가능 | 메일")
    print("   -------+-------------------+----------+----------+------")
    for mentor_id, name, consent, available, has_email in rows:
        print(f"   {mentor_id:<6} | {name:<17} | {'예' if consent else '아니오':<6} | "
              f"{'예' if available else '아니오':<6} | {'있음' if has_email else '없음'}")
    print(f"   ({len(rows)}명)")


def main() -> None:
    parser = argparse.ArgumentParser(description="mentors_demo.json 의 멘토 프로필을 Supabase mentors 테이블에 넣는다.")
    parser.add_argument("--dry-run", action="store_true", help="넣을 내용만 보여 주고 DB 는 바꾸지 않는다")
    parser.add_argument(
        "--update-profiles", action="store_true",
        help="이미 있는 멘토의 프로필 칸도 JSON 으로 덮어쓴다 (대시보드에서 고친 이름 등이 되돌아감)",
    )
    args = parser.parse_args()

    profiles = load_profiles()
    print(f"▶ {MENTORS_JSON.name}: 멘토 {len(profiles)}명")

    with connect() as conn:
        exists = conn.execute("select to_regclass('public.mentors') is not null").fetchone()[0]
        if not exists:
            sys.exit("❌ mentors 테이블이 없어요. 먼저 0002_mail_tables.sql 을 적용하세요.")
        inserted = updated = kept = 0
        try:
            for profile in profiles:
                if args.update_profiles:
                    is_new = conn.execute(UPSERT_SQL, profile).fetchone()[0]
                    inserted += int(is_new)
                    updated += int(not is_new)
                elif conn.execute(INSERT_SQL, profile).fetchone():
                    inserted += 1
                else:
                    kept += 1
        except psycopg.Error as err:
            conn.rollback()
            sys.exit(f"❌ 넣기 실패 (아무것도 바뀌지 않음): {err.diag.message_primary or err}")

        if args.update_profiles:
            print(f"   새로 넣음 {inserted}명, 프로필을 JSON 으로 덮어씀 {updated}명 (메일 주소·연락 가능은 그대로)")
        else:
            print(f"   새로 넣음 {inserted}명, 이미 있어서 그대로 둠 {kept}명")
        show_table(conn)
        if args.dry_run:
            conn.rollback()
            print("✅ --dry-run: 보기만 했어요. DB 는 바뀌지 않았어요.")
        else:
            conn.commit()
            print("✅ 완료 (commit). 이제 대시보드 Table Editor 에서 실제 멘토의 email 을 넣고 available 을 켜세요.")


if __name__ == "__main__":
    main()
