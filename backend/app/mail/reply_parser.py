"""
멘토·학생 답장에서 문의번호 찾기, 상대에게 보낼 본문만 남기기.
(예전 apps-script/src/ReplyParser.gs 를 그대로 옮긴 것)

1. 문의번호: ① 받는 주소의 "+문의번호@" → ② 본문(인용 포함)의 "문의번호: q…" 줄 → ③ 없으면 None
   (Apps Script 가 이미 "중계계정+…" 주소인 메일만 골라 보내므로, 여기서는 + 뒤의 문의번호 모양만 본다)
2. 본문: 인용 시작 줄(Gmail 한/영, 아웃룩, 네이버/다음, 인용 표시 없이 붙은 원문) 이후와 ">" 줄을 지우고,
   남은 문의번호 줄·꾸로록 안내 문구(멘토 메일, 리마인드, 학생에게 전달한 메일, 추가 질문 메일)를 한 번 더 지운다.
   멘토 답장(→ 학생)과 학생 답장(→ 멘토) 모두 같은 규칙으로 정리한다.
"""

from __future__ import annotations

import re

from app.mail.templates import INQUIRY_ID_LINE_LABEL, mentor_intro_line

INQUIRY_ID_PATTERN = r"q\d{8}-\d{4,}"
_PLUS = re.compile(rf"\+({INQUIRY_ID_PATTERN})@", re.IGNORECASE)
_ID_LINE = re.compile(rf"{re.escape(INQUIRY_ID_LINE_LABEL)}\s*:\s*({INQUIRY_ID_PATTERN})", re.IGNORECASE)
_ID_LINE_ONLY = re.compile(rf"^\s*{re.escape(INQUIRY_ID_LINE_LABEL)}\s*:\s*{INQUIRY_ID_PATTERN}\s*$", re.IGNORECASE)


def find_inquiry_id(recipients: list[str], plain_body: str) -> str | None:
    for recipient in recipients:
        match = _PLUS.search(str(recipient))
        if match:
            return match.group(1).lower()
    match = _ID_LINE.search(str(plain_body))
    return match.group(1).lower() if match else None


_ON_WROTE = re.compile(r"^On\s.+", re.IGNORECASE)
_WROTE_END = re.compile(r"wrote:$", re.IGNORECASE)
_KO_DATE = re.compile(r"^\d{4}년\s*\d{1,2}월\s*\d{1,2}일")
_SEPARATOR = re.compile(
    r"^-{2,}\s*(original message|원본\s*메시지|원본\s*메일|forwarded message|전달된\s*메시지)\s*-{2,}$", re.IGNORECASE
)
_UNDERSCORES = re.compile(r"^_{5,}$")
_FROM = re.compile(r"^(from|보낸\s*사람)\s*:", re.IGNORECASE)
_SENT = re.compile(r"^(sent|date|보낸\s*날짜|날짜)\s*:", re.IGNORECASE)


def _is_quote_start(lines: list[str], i: int, intro_lines: set[str]) -> bool:
    line = lines[i].strip()
    nxt = lines[i + 1].strip() if i + 1 < len(lines) else ""
    # Gmail 영어: "On Tue, Nov 10, 2026 at 1:45 PM 꾸로록 <...> wrote:" (두 줄로 나뉘기도 함)
    if _ON_WROTE.match(line) and (_WROTE_END.search(line) or _WROTE_END.search(nxt)):
        return True
    # Gmail·네이버 한국어: "2026년 11월 10일 (화) 오후 1:45, 꾸로록 <...>님이 작성:" (두 줄로 나뉘기도 함)
    if _KO_DATE.match(line) and (line.endswith("작성:") or nxt.endswith("작성:")):
        return True
    # 아웃룩·네이버·다음: "-----Original Message-----", "-----원본 메시지-----" 등
    if _SEPARATOR.match(line):
        return True
    # 아웃룩: 밑줄 구분선 다음에 "From:/보낸 사람:"
    if _UNDERSCORES.match(line) and _FROM.match(nxt):
        return True
    # 헤더 묶음이 바로 나오는 경우: "From: ..." 다음 줄이 "Sent:/Date:/보낸 날짜:"
    if _FROM.match(line) and _SENT.match(nxt):
        return True
    # 인용 표시 없이 원래 메일이 붙은 경우: "안녕하세요, ○○님." + 꾸로록 메일 둘째 줄, 또는 그 둘째 줄·리마인드 문구
    if line.startswith("안녕하세요,") and nxt in intro_lines:
        return True
    return line in intro_lines


def _intro_lines(settings: dict[str, str]) -> set[str]:
    """꾸로록이 보낸 메일의 첫 문구들. 답장에 인용 표시 없이 원래 메일이 붙어 오면 여기서 자른다."""
    lines = {
        mentor_intro_line(settings["serviceName"]),
        settings.get("mentorReminderIntro", ""),
        settings.get("studentForwardIntro", ""),
        settings.get("mentorFollowupIntro", ""),
    }
    return {line.strip() for line in lines if line and line.strip()}


def extract_reply_text(plain_body: str, settings: dict[str, str]) -> str:
    """답장 원문에서 상대에게 보낼 부분만. 비어 있을 수 있다."""
    intro_lines = _intro_lines(settings)
    footers = [settings.get(key, "").strip() for key in ("mentorFooter", "studentForwardFooter")]

    lines = re.sub(r"\r\n?", "\n", str(plain_body)).split("\n")
    end = next((i for i in range(len(lines)) if _is_quote_start(lines, i, intro_lines)), len(lines))
    kept = [line for line in lines[:end] if not re.match(r"^\s*>", line) and not _ID_LINE_ONLY.match(line)]

    text = "\n".join(kept)
    for phrase in footers + sorted(intro_lines):
        if phrase:
            text = text.replace(phrase, "")
    text = re.sub(r"[ \t]+$", "", text, flags=re.MULTILINE)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
