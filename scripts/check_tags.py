"""데이터에 쓰인 태그가 docs/TAGS.md 기준에 맞는지 검사하고, 승격 후보를 보여준다.

검사하는 것
- TAGS.md 1~4장 표에 없는 code → [없는 태그]
- "폐기된 태그" 표에 있는 code → [폐기된 태그] (대신 쓸 태그도 알려줌)
- 칸과 종류가 안 맞음 (예: career_field code를 career_paths 칸에 씀) → [종류 다름]
- etc를 붙였는데 매핑 표에 없는 상세 값이 없음 → [기타 상세]
- 상세 값이 "상세 값 매핑" 표에 있는데 해당 code가 없음 → [매핑 누락]
- 인물의 career_paths가 비어 있음 → [경로 비어 있음]

승격 후보
- etc 상세 값이 career는 서로 다른 인물 3명 이상, topic은 조각 5개 이상이면 [승격 후보]로 보여준다.
  (승격 후보는 오류가 아니라 안내라서 종료 코드에 영향 없음)

검사 대상 (있는 파일만): data/processed/tags/*.json → people.json, chunks.json 순서로 읽고,
같은 id는 나중에 읽은 것으로 덮어쓴다.

사용: python check_tags.py        → 문제가 있으면 종료 코드 1
"""

from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TAGS_MD = ROOT / "docs" / "TAGS.md"
PROCESSED = ROOT / "data" / "processed"

# 데이터 칸 → (태그 종류, 상세 칸)
FIELDS = {
    "topics": ("topic", "topic_detail"),
    "career_paths": ("career_path", "path_detail"),
    "career_fields": ("career_field", "field_detail"),
    "speaker_type": ("speaker_type", None),
}
PROMOTE_MIN = {"topic": 5, "career_path": 3, "career_field": 3}

ROW = re.compile(r"^\|\s*`([a-z0-9_]+)`\s*\|\s*([^|]+?)\s*\|\s*([a-z_]+)\s*\|(.*)$")


def load_tags() -> tuple[dict[tuple[str, str], str], dict[tuple[str, str], str]]:
    """TAGS.md를 읽는다.
    돌려주는 값: (사용 중 {(종류, code): 한글 이름}, 폐기 {(종류, code): 대신 쓸 태그})
    """
    active, retired = {}, {}
    in_retired = False
    for line in TAGS_MD.read_text(encoding="utf-8").splitlines():
        if line.startswith("## "):
            in_retired = "폐기" in line
            continue
        m = ROW.match(line)
        if not m:
            continue
        code, name, kind, rest = m.groups()
        if in_retired:
            cells = [c.strip() for c in rest.split("|")]
            retired[(kind, code)] = cells[2].strip("` ") if len(cells) > 2 else ""
        else:
            active[(kind, code)] = name
    return active, retired


MAP_ROW = re.compile(r"^\|\s*([a-z_]+)\s*\|\s*([^|]+?)\s*\|\s*`([a-z0-9_]+)`\s*\|")


def load_detail_map() -> dict[tuple[str, str], str]:
    """TAGS.md "상세 값 매핑" 표: {(종류, 상세 값): code}"""
    mapping, in_map = {}, False
    for line in TAGS_MD.read_text(encoding="utf-8").splitlines():
        if line.startswith("## "):
            in_map = "상세 값 매핑" in line
            continue
        m = MAP_ROW.match(line)
        if in_map and m:
            mapping[(m.group(1), m.group(2))] = m.group(3)
    return mapping


def label(active: dict, kind: str, code: str) -> str:
    """code → 한글 이름 (없으면 code 그대로)."""
    return active.get((kind, code), code)


def load_records() -> dict[tuple[str, str], dict]:
    """{("person"|"chunk", id): 레코드}"""
    records: dict[tuple[str, str], dict] = {}
    tag_dir = PROCESSED / "tags"
    for f in sorted(tag_dir.glob("*.json")) if tag_dir.exists() else []:
        data = json.loads(f.read_text(encoding="utf-8"))
        for r in data.get("people", []):
            records[("person", r["id"])] = r | {"_file": f.name}
        for r in data.get("chunks", []):
            records[("chunk", r["id"])] = r | {"_file": f.name}
    for name, typ in (("people.json", "person"), ("chunks.json", "chunk")):
        f = PROCESSED / name
        if f.exists():
            for r in json.loads(f.read_text(encoding="utf-8")):
                records[(typ, r["id"])] = r | {"_file": name}
    return records


def as_list(v) -> list:
    if v is None or v == "":
        return []
    return v if isinstance(v, list) else [v]


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    active, retired = load_tags()
    detail_map = load_detail_map()
    records = load_records()

    problems: list[str] = []
    # 승격 후보 세기: (종류, 상세 값) → 인물 id 또는 조각 id 집합
    details: dict[tuple[str, str], set[str]] = defaultdict(set)
    checked = 0

    for (typ, rid), r in sorted(records.items()):
        where = f"{r['_file']} / {rid}"
        for field, (kind, detail_field) in FIELDS.items():
            if field not in r:
                continue
            # speaker_type은 인물·조각 모두에 있으므로 같은 칸 규칙을 그대로 쓴다
            codes = as_list(r.get(field))
            for code in codes:
                checked += 1
                if (kind, code) in retired:
                    problems.append(f"[폐기된 태그] {where}: {field} '{code}' → 대신 '{retired[(kind, code)] or 'TAGS.md 확인'}'")
                elif (kind, code) not in active:
                    other = [k for (k, c) in active if c == code]
                    if other:
                        problems.append(f"[종류 다름] {where}: '{code}'는 {other[0]} 태그인데 {field} 칸에 있음")
                    else:
                        problems.append(f"[없는 태그] {where}: {field} '{code}'")
            # 조각의 career 태그는 인물 태그를 복사한 것이라, 상세 칸 짝 검사는 인물에서만 한다
            if detail_field and (typ == "person" or field == "topics"):
                detail = [d.strip() for d in as_list(r.get(detail_field)) if str(d).strip()]
                has_etc = "etc" in codes
                unmapped = [d for d in detail if (kind, d) not in detail_map]
                for d in detail:
                    code = detail_map.get((kind, d))
                    if code and code not in codes:
                        problems.append(f"[매핑 누락] {where}: {detail_field} '{d}'가 있으면 {field}에 '{code}'가 있어야 함")
                if has_etc and not unmapped:
                    problems.append(f"[기타 상세] {where}: {field}에 etc가 있는데 {detail_field}에 매핑 표에 없는 값이 없음")
                if has_etc:  # 승격 후보는 etc가 붙은 데이터의, 매핑 안 된 상세 값만 센다
                    for d in unmapped:
                        details[(kind, d)].add(rid)
        if typ == "person" and not as_list(r.get("career_paths")):
            problems.append(f"[경로 비어 있음] {where}: career_paths가 비어 있음 (모르면 etc + path_detail)")

    print(f"TAGS.md: 사용 중 {len(active)}개, 폐기 {len(retired)}개 / "
          f"레코드 {len(records)}개, 검사한 태그 {checked}개")
    if problems:
        print(f"\n문제 {len(problems)}개:")
        for p in problems:
            print("  -", p)
    else:
        print("문제 없음 ✅")

    # 승격 후보와 etc 상세 값 현황
    if details:
        print("\n기타(etc) 상세 값 현황 (기준: career 인물 3명, topic 조각 5개)")
        for (kind, d), ids in sorted(details.items(), key=lambda x: (x[0][0], -len(x[1]), x[0][1])):
            mark = "  ⬆ [승격 후보]" if len(ids) >= PROMOTE_MIN[kind] else ""
            print(f"  {kind:<12} {d}: {len(ids)}{'명' if kind != 'topic' else '개'}{mark}")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
