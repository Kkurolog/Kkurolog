"""
원문 txt 를 다루는 규칙 (AI 없이 항상 같은 결과).

- normalize: 줄바꿈·BOM·탭을 정리한다. 줄 번호는 이 결과 기준이다 (화면에도 같은 줄 번호를 보여준다).
- numbered: AI 에게 줄 번호를 붙여 보낸다. AI 는 조각의 글을 직접 쓰지 않고 '몇 번째 줄부터 몇 번째 줄까지'만 알려준다.
  → 조각 내용은 항상 원문에서 그대로 잘라 온다 (AI 가 지어낸 문장이 섞이지 않는다).
- take_lines: 줄 범위를 잘라 말머리("Q:", "차슈:")를 떼고 합친다.
- split_long: 1,000자가 넘는 답변은 문단 경계에서 나눈다 (scripts/chunk_gschool.py 와 같은 기준).
- find_pii: 전화번호·메일 주소처럼 규칙으로 잡히는 개인정보. 이름·학교는 AI 가 찾는다.
"""

from __future__ import annotations

import re

MAX_CHUNK_CHARS = 1000

_QA_PREFIX = re.compile(r"^\s*(?:Q|A|질문|답변|답|문|인터뷰어|에디터)\s*\d*\s*[.:：)\]]\s*", re.IGNORECASE)
_PHONE = re.compile(r"(?<!\d)(?:01[016789]|0\d{1,2})[-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)")
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_RRN = re.compile(r"(?<!\d)\d{6}[-\s]?[1-4]\d{6}(?!\d)")  # 주민등록번호 모양


def normalize(text: str) -> str:
    text = text.replace("﻿", "").replace("\r\n", "\n").replace("\r", "\n").replace("\t", "    ")
    return "\n".join(line.rstrip() for line in text.split("\n")).strip("\n")


def lines_of(text: str) -> list[str]:
    """줄 목록. 줄 번호는 1부터 센다 (lines[0] = 1번째 줄)."""
    return normalize(text).split("\n")


def numbered(lines: list[str]) -> str:
    width = max(4, len(str(len(lines))))
    return "\n".join(f"L{str(i).zfill(width)}| {line}" for i, line in enumerate(lines, start=1))


def strip_prefix(line: str, labels: list[str]) -> str:
    """줄 앞의 'Q:', 'A.', '차슈 :' 같은 말머리를 뗀다."""
    out = _QA_PREFIX.sub("", line, count=1)
    if out != line:
        return out
    for label in labels:
        label = label.strip()
        if label and re.match(rf"^\s*{re.escape(label)}\s*[:：]\s*", line):
            return re.sub(rf"^\s*{re.escape(label)}\s*[:：]\s*", "", line, count=1)
    return line


def take_lines(lines: list[str], start: int, end: int, labels: list[str]) -> str:
    """start~end 번째 줄(1부터, 끝 포함)을 말머리를 떼고 합친다. 빈 줄이 여러 개면 하나로."""
    start, end = max(1, start), min(len(lines), end)
    if start > end:
        return ""
    picked = [strip_prefix(line, labels) for line in lines[start - 1 : end]]
    text = "\n".join(picked)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def split_long(content: str, limit: int = MAX_CHUNK_CHARS) -> list[str]:
    """limit 자를 넘으면 문단(빈 줄, 없으면 줄) 경계에서 나눈다. 한 문단이 limit 보다 길면 그대로 둔다."""
    if len(content) <= limit:
        return [content]
    paragraphs = [p for p in re.split(r"\n\s*\n", content) if p.strip()]
    if len(paragraphs) == 1:
        paragraphs = [p for p in content.split("\n") if p.strip()]
    parts: list[str] = []
    current = ""
    for paragraph in paragraphs:
        candidate = f"{current}\n\n{paragraph}" if current else paragraph
        if current and len(candidate) > limit:
            parts.append(current)
            current = paragraph
        else:
            current = candidate
    if current:
        parts.append(current)
    return parts


def find_pii(lines: list[str]) -> list[dict]:
    """규칙으로 찾은 개인정보 의심 부분: [{line, text, kind}] (전화번호·메일 주소·주민등록번호 모양)."""
    found = []
    for number, line in enumerate(lines, start=1):
        for match in _EMAIL.finditer(line):
            found.append({"line": number, "text": match.group(), "kind": "email"})
        for pattern in (_RRN, _PHONE):
            for match in pattern.finditer(line):
                found.append({"line": number, "text": match.group(), "kind": "phone" if pattern is _PHONE else "other"})
    return found
