"""수집한 "Exit 오깔" 글을 검색용 조각(chunk)으로 자른다.

입력: data/raw/gschool_exit_okkal.json (collect_gschool.py 결과)
출력: data/processed/base/sources_base.json  글 단위 (태그 없음)
      data/processed/base/chunks_base.json   조각 단위 (태그 없음)

규칙 (같은 입력이면 항상 같은 결과가 나온다. 랜덤·AI 판단 없음)
- 제외 글(EXCLUDE)은 건너뛴다.
- Q&A 인터뷰: "Q:" 줄부터 다음 "Q:" 직전까지가 한 조각 (질문 1개 + 답변).
  - 답변이 1,000자를 넘으면 문단 기준으로 나누고, 나뉜 조각에도 같은 질문을 붙인다.
  - 화자 표시("투게덥 (이하 생략) : ", "쿠키(이하 생략) : " 등)는 지운다.
  - 한 글에 졸업생이 여러 명이면(MULTI_SPEAKERS) 질문 하나를 사람별 조각으로 나눈다.
- 에세이(질문 없는 글): 문단을 400~800자 정도로 묶는다. question은 빈 값.
- 버리는 것: "*코-레터 매 회…" 안내문, 본문에 반복된 제목 줄, 첫 질문 앞의 편집자 소개,
  글 끝의 "투게덥의 한마디"/"에디터의 말" 이후, 구분선, 코칭교사 코멘트.
"""

from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_PATH = ROOT / "data" / "raw" / "gschool_exit_okkal.json"
OUT_DIR = ROOT / "data" / "processed" / "base"

# 넣지 않는 글과 이유 (졸업생 본인의 인터뷰·에세이가 아닌 글)
EXCLUDE = {
    "130766543": "행사 후기 (홈커밍파티)",
    "14987326": "행사 후기 (넥시트 파티)",
    "11058735": "시리즈 소개 (Exit 오깔 시작 글)",
    "11868946": "교직원 인터뷰 (에코, 전 교직원)",
    "13618754": "교직원 에세이 (꼰조, 전 과학교사)",
}

# 한 글에 졸업생이 여러 명 나오는 경우: 글번호 → 졸업생 별명(답변 줄 앞 표시)
MULTI_SPEAKERS = {
    "12236997": ["데이", "룸메"],
}

MAX_ANSWER = 1000        # 질문 조각의 답변이 이보다 길면 나눈다
ESSAY_MIN, ESSAY_MAX = 400, 800

INTERVIEWER_LABEL = re.compile(r"(투게덥|메디)\s*\(?\s*이하\s*생략\s*\)?\s*[:：]\s*")
SPEAKER_LABEL = re.compile(r"^([^\s:：()*]{1,10})\s*(\(([^)]*)\))?\s*[:：]\s*")
OUTRO = re.compile(r"^(Q: )?[^\w가-힣]*(인터뷰어\s*)?(투게덥|에디터)\s*의\s*(한마디|말)")
SEPARATOR = re.compile(r"^[\s_\-—–=·]+$")
ESSAY_BYLINE = re.compile(r"^글\s*[:：]")
SENTENCE_END = re.compile(r"(?<=[.!?…~])\s+")


def norm(s: str) -> str:
    """비교용: 한글·영문·숫자만 남긴다."""
    return re.sub(r"[^0-9A-Za-z가-힣]", "", s)


def title_core(title: str) -> str:
    """제목에서 ' - 이름 [별명]' 같은 꼬리를 뗀 앞부분."""
    return norm(re.split(r"\s+-\s*|\[", title)[0])


def is_title_line(text: str, title: str) -> bool:
    n, core = norm(text), title_core(title)
    if not n:
        return False
    return n == norm(title) or (len(core) >= 8 and core[:8] in n[:20])


def split_long(text_parts: list[str], limit: int) -> list[str]:
    """문단 목록을 limit 안쪽으로 묶는다. 한 문단이 limit보다 길면 문장 단위로 자른다."""
    pieces: list[str] = []
    for p in text_parts:
        if len(p) <= limit:
            pieces.append(p)
            continue
        cur = ""
        for s in SENTENCE_END.split(p):
            if cur and len(cur) + 1 + len(s) > limit:
                pieces.append(cur)
                cur = s
            else:
                cur = f"{cur} {s}".strip()
        if cur:
            pieces.append(cur)
    return pieces


def pack_answer(paras: list[str]) -> list[str]:
    """답변을 MAX_ANSWER 안쪽, 비슷한 길이의 조각들로 나눈다."""
    total = len("\n".join(paras))
    if total <= MAX_ANSWER:
        return ["\n".join(paras)]
    parts = split_long(paras, MAX_ANSWER)
    n = math.ceil(total / MAX_ANSWER)
    target = total / n
    out, cur = [], []
    for p in parts:
        if cur and (len("\n".join(cur + [p])) > MAX_ANSWER or len("\n".join(cur)) >= target):
            out.append("\n".join(cur))
            cur = []
        cur.append(p)
    if cur:
        rest = "\n".join(cur)
        # 너무 짧은 꼬리 조각은 앞 조각에 붙인다
        if out and len(rest) < 200 and len(out[-1]) + 1 + len(rest) <= MAX_ANSWER:
            out[-1] += "\n" + rest
        else:
            out.append(rest)
    return out


def pack_essay(paras: list[str]) -> list[str]:
    """에세이 문단을 400~800자 정도로 묶는다."""
    parts = split_long(paras, ESSAY_MAX)
    out, cur = [], []
    for p in parts:
        if cur and len("\n".join(cur + [p])) > ESSAY_MAX:
            out.append("\n".join(cur))
            cur = []
        cur.append(p)
        if len("\n".join(cur)) >= ESSAY_MIN:
            out.append("\n".join(cur))
            cur = []
    if cur:
        rest = "\n".join(cur)
        if out and len(rest) < ESSAY_MIN // 2 and len(out[-1]) + len(rest) <= MAX_ANSWER:
            out[-1] += "\n" + rest
        else:
            out.append(rest)
    return out


def clean_lines(post: dict) -> tuple[list[str], list[str]]:
    """공통으로 버릴 줄을 걸러낸다. (남은 줄, 버린 줄 메모)"""
    kept, dropped = [], []
    for line in post["body"].split("\n"):
        text = line[3:] if line.startswith("Q: ") else line
        if OUTRO.match(line):
            dropped.append("[끝 소감 이후 전부] " + line[:40])
            break
        if text.startswith("*코-레터") or SEPARATOR.match(text) or norm(text) == norm(post["title"]):
            dropped.append(line[:40])
            continue
        kept.append(line)
    return kept, dropped


def chunk_interview(post: dict, lines: list[str], dropped: list[str]) -> list[dict]:
    speakers = MULTI_SPEAKERS.get(post["idx"])
    blocks: list[tuple[str, list[tuple[str | None, str]]]] = []  # (질문, [(화자, 문단)])
    started = False
    for line in lines:
        if line.startswith("Q: "):
            q = line[3:].strip()
            m = INTERVIEWER_LABEL.search(q)
            if m:
                q = q[m.end():].strip()  # 앞에 붙은 제목 + 인터뷰어 표시 제거
            elif not started and is_title_line(q, post["title"]):
                # 첫 질문 전에 굵게 다시 적힌 제목 (중간의 비슷한 질문은 진짜 질문이라 남긴다)
                dropped.append("[제목 줄] " + q[:40])
                continue
            blocks.append((q, []))
            started = True
            continue
        if not started:
            dropped.append("[편집자 소개] " + line[:40])
            continue
        speaker = None
        m = SPEAKER_LABEL.match(line)
        if m:
            name, paren = m.group(1), m.group(3) or ""
            if "이하" in paren and "생략" in paren:
                line = line[m.end():]
            elif speakers and name in speakers:
                speaker, line = name, line[m.end():]
            elif speakers and ("교사" in paren or "코치" in paren):
                dropped.append("[코칭교사 코멘트] " + line[:40])
                continue
        if speakers and speaker is None:
            # 화자 표시가 없는 줄은 바로 앞 화자의 이어지는 말
            prev = blocks[-1][1]
            speaker = prev[-1][0] if prev else None
        if line.strip():
            blocks[-1][1].append((speaker, line.strip()))

    chunks = []
    for q, paras in blocks:
        if not paras:
            dropped.append("[답변 없는 질문] " + q[:40])
            continue
        groups: dict[str | None, list[str]] = {}
        for sp, p in paras:
            groups.setdefault(sp, []).append(p)
        for sp, ps in groups.items():
            for content in pack_answer(ps):
                chunks.append({"question": q, "content": content, "speaker": sp})
    return chunks


def chunk_essay(post: dict, lines: list[str], dropped: list[str]) -> list[dict]:
    # "글: 별명(실명)" 줄과 그 앞(편집자 소개, <제목>)은 버린다
    byline = next((i for i, l in enumerate(lines) if ESSAY_BYLINE.match(l)), None)
    if byline is not None:
        dropped.extend("[에세이 머리말] " + l[:40] for l in lines[: byline + 1])
        lines = lines[byline + 1:]
    return [{"question": "", "content": c, "speaker": None} for c in pack_essay(lines)]


def main():
    posts = json.loads(RAW_PATH.read_text(encoding="utf-8"))
    sources, chunks = [], []
    report = []
    for post in posts:
        if post["idx"] in EXCLUDE:
            print(f"[제외] {post['idx']} {post['title']} → {EXCLUDE[post['idx']]}")
            continue
        lines, dropped = clean_lines(post)
        is_interview = any(l.startswith("Q: ") for l in lines)
        made = (chunk_interview if is_interview else chunk_essay)(post, lines, dropped)
        sources.append({
            "id": post["idx"],
            "title": post["title"].strip("﻿ "),
            "url": post["url"],
            "published_at": post["date"][:10],
            "source_type": "졸업생 인터뷰" if is_interview else "졸업생 에세이",
            "site": "gschool.kr",
        })
        for i, c in enumerate(made, 1):
            chunks.append({
                "id": f"{post['idx']}-{i:02d}",
                "source_id": post["idx"],
                "chunk_index": i,
                "question": c["question"],
                "content": c["content"],
                "speaker": c["speaker"],  # 여러 명 인터뷰일 때만 값이 있음
                "char_count": len(c["content"]),
            })
        report.append((post["idx"], len(made), dropped))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "sources_base.json").write_text(json.dumps(sources, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT_DIR / "chunks_base.json").write_text(json.dumps(chunks, ensure_ascii=False, indent=2), encoding="utf-8")

    if "-v" in sys.argv:
        for idx, n, dropped in report:
            print(f"\n{idx}: 조각 {n}개, 버린 줄 {len(dropped)}개")
            for d in dropped:
                print("   -", d)
    lens = sorted(c["char_count"] for c in chunks)
    print(f"\n글 {len(sources)}개 → 조각 {len(chunks)}개 "
          f"(길이 최소 {lens[0]}, 중간 {lens[len(lens)//2]}, 최대 {lens[-1]})")
    print(f"저장: {OUT_DIR}")


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
