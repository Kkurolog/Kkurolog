"""gschool.kr 에세이 게시판에서 "Exit 오깔" 졸업생 인터뷰를 모은다.

하는 일
  1. 목록 페이지를 1페이지부터 넘기며 라벨이 "Exit 오깔"인 글의 idx·제목·날짜를 모은다.
  2. 새 글이 하나도 안 나오는 페이지에서 멈춘다.
     (이 사이트는 마지막 페이지를 넘어가면 마지막 페이지를 계속 다시 보여준다)
  3. 모은 글의 본문 페이지를 열어 본문(.board_txt_area)만 텍스트로 꺼낸다.
     - 문단마다 줄을 바꾼다.
     - 문단 전체가 굵은 글씨(<strong>/<b>)면 인터뷰 질문으로 보고 앞에 "Q: "를 붙인다.
  4. data/raw/gschool_exit_okkal.json 에 저장한다.

실행 방법은 scripts/README.md 참고.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup, NavigableString, Tag

BASE = "https://gschool.kr/essay/"
Q_PARAM = "YToxOntzOjEyOiJrZXl3b3JkX3R5cGUiO3M6MzoiYWxsIjt9"  # "전체 검색" 조건 (사이트가 쓰는 값 그대로)
LIST_URL = BASE + "?q=" + Q_PARAM + "&page={page}"
VIEW_URL = BASE + "?q=" + Q_PARAM + "&bmode=view&idx={idx}&t=board"

TARGET_LABEL = "Exit 오깔"
USER_AGENT = "kkurolog-student-project (university student prototype; polite crawler)"
DELAY_SEC = 1.5  # 요청 사이 대기 시간
TIMEOUT_SEC = 20

ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = ROOT / "data" / "raw" / "gschool_exit_okkal.json"

# 줄을 바꿔야 하는 태그(문단 단위)
BLOCK_TAGS = {"p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote", "pre", "tr"}
BOLD_TAGS = {"strong", "b"}

session = requests.Session()
session.headers["User-Agent"] = USER_AGENT
_last_request = 0.0


def fetch(url: str) -> str | None:
    """페이지를 가져온다. 실패하면 1번만 다시 시도하고, 그래도 안 되면 None."""
    global _last_request
    for attempt in (1, 2):
        wait = DELAY_SEC - (time.monotonic() - _last_request)
        if wait > 0:
            time.sleep(wait)
        _last_request = time.monotonic()
        try:
            r = session.get(url, timeout=TIMEOUT_SEC)
            r.raise_for_status()
            r.encoding = "utf-8"
            return r.text
        except requests.RequestException as e:
            print(f"  ! 요청 실패({attempt}/2): {url} ({e})")
    return None


# ---------- 목록 페이지 ----------

def parse_list(html: str) -> list[dict]:
    """목록 페이지에서 글 정보(idx, label, title, date)를 꺼낸다."""
    soup = BeautifulSoup(html, "html.parser")
    posts = []
    for a in soup.select("a.post_link_wrap"):
        m = re.search(r"idx=(\d+)", a.get("href", ""))
        title_block = a.select_one(".title-block")
        if not m or title_block is None:
            continue
        label_el = title_block.select_one("span > em")
        label = label_el.get_text(strip=True) if label_el else ""
        # 제목 줄에서 "공지" 표시와 라벨을 떼어내면 제목만 남는다
        for el in title_block.find_all(["em", "span"]):
            el.extract()
        title = " ".join(title_block.get_text(" ", strip=True).split())
        date_el = a.select_one("small.date")
        date = (date_el.get("title") or date_el.get_text(strip=True)) if date_el else ""
        posts.append({"idx": m.group(1), "label": label, "title": title, "date": date})
    return posts


# ---------- 본문 페이지 ----------

def _is_bold(node: Tag, block: Tag) -> bool:
    """node가 block 안에서 <strong>/<b> 안에 들어 있는지."""
    for parent in node.parents:
        if parent is block:
            return False
        if parent.name in BOLD_TAGS:
            return True
    return False


def extract_body(html: str, title: str = "") -> str | None:
    """본문 영역만 텍스트로 바꾼다. 굵은 문단(질문)은 앞에 'Q: '를 붙인다.
    (본문 맨 위에 굵게 다시 적힌 글 제목은 질문이 아니므로 표시하지 않는다)"""
    soup = BeautifulSoup(html, "html.parser")
    area = soup.select_one(".board_txt_area")
    if area is None:
        return None
    for el in area.find_all(["script", "style", "img", "iframe"]):
        el.decompose()
    for br in area.find_all("br"):
        br.replace_with("\n")

    lines: list[str] = []

    def flush(texts: list[str], bold_flags: list[bool]):
        text = "".join(texts)
        for raw in text.split("\n"):
            line = " ".join(raw.split())
            if line:
                lines.append(line)
        # 문단 안의 글자가 전부 굵은 글씨면 질문으로 표시
        visible = [b for t, b in zip(texts, bold_flags) if t.strip()]
        if visible and all(visible) and lines:
            # 이번 문단에서 추가된 줄들에 Q 표시
            added = len([r for r in text.split("\n") if r.strip()])
            for i in range(len(lines) - added, len(lines)):
                lines[i] = "Q: " + lines[i]

    def walk(node: Tag):
        texts: list[str] = []
        flags: list[bool] = []
        for child in node.children:
            if isinstance(child, NavigableString):
                texts.append(str(child))
                flags.append(_is_bold(child, node) or node.name in BOLD_TAGS)
            elif isinstance(child, Tag):
                if child.name in BLOCK_TAGS or child.find(BLOCK_TAGS):
                    flush(texts, flags)
                    texts, flags = [], []
                    walk(child)
                else:
                    # 인라인 태그(span, strong 등): 글자를 이어 붙인다
                    for s in child.find_all(string=True):
                        texts.append(str(s))
                        flags.append(_is_bold(s, node) or s.parent.name in BOLD_TAGS)
        flush(texts, flags)

    walk(area)

    # 바로 이어지는 Q 줄(한 질문이 두 줄로 나뉜 경우)은 한 줄로 합친다
    norm_title = "".join(title.split())
    lines = [l[3:] if l.startswith("Q: ") and "".join(l[3:].split()) == norm_title else l for l in lines]
    merged: list[str] = []
    for line in lines:
        if line.startswith("Q: ") and merged and merged[-1].startswith("Q: "):
            merged[-1] += " " + line[3:]
        else:
            merged.append(line)
    return "\n".join(merged)


# ---------- 제목에서 이름·별명 ----------

def parse_name(title: str) -> tuple[str, str, str]:
    """(interviewee, nickname, 방식) 을 돌려준다. 못 찾으면 빈 값."""
    # 1) "제목 - 안선후 [차슈]"
    m = re.search(r"-\s*([가-힣]{2,4})\s*\[([^\]]+)\]\s*$", title)
    if m:
        return m.group(1), m.group(2).strip(), "이름 [별명]"
    # 2) "제목 - 제나 임희진" (별명 이름 순서, 추정)
    m = re.search(r"-\s*(\S+)\s+([가-힣]{2,4})\s*$", title)
    if m:
        return m.group(2), m.group(1), "별명 이름(추정)"
    # 3) "... [딩동] 이야기" (별명만 있음)
    m = re.search(r"\[([^\]]+)\]", title)
    if m:
        return "", m.group(1).strip(), "별명만"
    return "", "", ""


# ---------- 실행 ----------

def main():
    ap = argparse.ArgumentParser(description="gschool.kr 'Exit 오깔' 인터뷰 수집")
    ap.add_argument("--max-pages", type=int, default=None, help="테스트용: 목록을 N페이지까지만 본다")
    ap.add_argument("--out", type=Path, default=OUT_PATH, help="저장할 JSON 경로")
    args = ap.parse_args()

    # 1~2. 목록 넘기기
    seen: set[str] = set()
    targets: list[dict] = []
    failed_pages: list[int] = []
    pages_checked = 0
    page = 1
    while args.max_pages is None or page <= args.max_pages:
        print(f"[목록] {page}페이지")
        html = fetch(LIST_URL.format(page=page))
        pages_checked += 1
        if html is None:
            failed_pages.append(page)
            if len(failed_pages) >= 3:
                print("  ! 목록 페이지가 계속 실패해서 멈춥니다.")
                break
            page += 1
            continue
        posts = parse_list(html)
        new = [p for p in posts if p["idx"] not in seen]
        if not new:
            print("  새 글이 없어서 목록 넘기기를 멈춥니다.")
            break
        for p in new:
            seen.add(p["idx"])
            if p["label"] == TARGET_LABEL:
                targets.append(p)
        print(f"  글 {len(posts)}개 중 새 글 {len(new)}개, 누적 Exit 오깔 {len(targets)}개")
        page += 1

    # 3. 본문 수집
    results: list[dict] = []
    failed_posts: list[dict] = []
    name_warnings: list[str] = []
    guessed: list[str] = []
    for i, p in enumerate(targets, 1):
        url = VIEW_URL.format(idx=p["idx"])
        print(f"[본문 {i}/{len(targets)}] {p['title']}")
        html = fetch(url)
        body = extract_body(html, p["title"]) if html else None
        if not body:
            reason = "요청 실패" if html is None else "본문 영역을 못 찾음"
            print(f"  ! 건너뜀: {reason}")
            failed_posts.append({"idx": p["idx"], "title": p["title"], "reason": reason})
            continue
        name, nick, how = parse_name(p["title"])
        if not name:
            what = "이름" if nick else "이름·별명"
            print(f"  ! 경고: 제목에서 {what}을 못 뽑았어요 → 빈 값으로 둡니다")
            name_warnings.append(f"{p['idx']} {p['title']}" + (f" (별명={nick})" if nick else ""))
        elif how.endswith("(추정)"):
            guessed.append(f"{p['idx']} {p['title']} → 이름={name}, 별명={nick}")
        results.append({
            "idx": p["idx"],
            "url": url,
            "title": p["title"],
            "date": p["date"],
            "interviewee": name,
            "nickname": nick,
            "body": body,
            "collected_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        })

    # 4. 저장
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")

    print("\n===== 요약 =====")
    print(f"확인한 목록 페이지: {pages_checked}개" + (f" (실패: {failed_pages})" if failed_pages else ""))
    print(f"찾은 Exit 오깔 글: {len(targets)}개, 저장한 글: {len(results)}개")
    if results:
        dates = sorted(r["date"] for r in results)
        print(f"날짜 범위: {dates[0]} ~ {dates[-1]}")
    print(f"실패한 글: {len(failed_posts)}개")
    for f in failed_posts:
        print(f"  - {f['idx']} {f['title']} ({f['reason']})")
    print(f"이름을 못 뽑은 글: {len(name_warnings)}개 (별명은 있으면 함께 표시)")
    for w in name_warnings:
        print(f"  - {w}")
    if guessed:
        print(f"'별명 이름' 순서로 추정한 글(확인 필요): {len(guessed)}개")
        for g in guessed:
            print(f"  - {g}")
    print(f"저장 위치: {args.out}")


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # Windows 터미널에서 한글 깨짐 방지
    main()
