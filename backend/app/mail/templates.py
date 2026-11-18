"""
메일 제목·본문(글자 버전, HTML 버전) 만들기. 문구는 mail_settings 값을 쓴다.
(예전 apps-script/src/MailTemplates.gs 를 그대로 옮긴 것. 메일 모양은 바뀌지 않는다)

- 멘토 메일: 학생 이름·제목·내용 + 맨 아래 안내 문구 + 작은 글씨 "문의번호: q…" 한 줄
  (문의번호 줄은 멘토가 Reply-To 를 지우고 답장해도 인용된 본문에서 문의를 찾는 단서)
- 학생 메일 주소는 멘토에게 보여 주지 않는다. 멘토 메일 주소는 학생에게 보여 주지 않는다.
- 학생 사본에는 문의번호를 넣지 않는다 (학생이 사본에 답장해도 멘토 답장으로 잘못 처리되지 않게)
- 사용자가 쓴 글은 HTML 로 해석되지 않게 escape 한다.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from html import escape

from app.mail.timeutil import KST

INQUIRY_ID_LINE_LABEL = "문의번호"


@dataclass(frozen=True)
class Mail:
    subject: str
    text_body: str
    html_body: str


def inquiry_id_line(inquiry_id: str) -> str:
    return f"{INQUIRY_ID_LINE_LABEL}: {inquiry_id}"


def mentor_intro_line(service_name: str) -> str:
    """멘토 메일 둘째 줄. 답장에 원래 메일이 인용 표시 없이 붙어 오면 reply_parser 가 이 줄을 찾아 잘라낸다."""
    return f"{service_name}에서 학생 문의가 도착했어요."


def _e(text: str) -> str:
    return escape(str(text), quote=True)


def _br(html_text: str) -> str:
    return html_text.replace("\n", "<br>")


_WRAP = '<div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#222">'
_ROW = '<tr><td style="padding:2px 12px 2px 0;color:#666">{label}</td><td>{value}</td></tr>'
_QUOTE = '<div style="border-left:3px solid #ccc;padding:8px 12px;margin:12px 0;background:#fafafa">{body}</div>'


def mentor_inquiry_mail(
    settings: dict[str, str], mentor_name: str, inquiry_id: str, student_name: str, title: str, body: str,
    *, reminder: bool = False,
) -> Mail:
    """멘토에게 보낼 문의 메일. reminder=True 면 리마인드 말머리 + 맨 위 리마인드 문구."""
    service_name = settings["serviceName"]
    prefix = settings["mentorReminderSubjectPrefix" if reminder else "mentorSubjectPrefix"]
    footer = settings["mentorFooter"]
    reminder_intro = settings["mentorReminderIntro"] if reminder else ""
    id_line = inquiry_id_line(inquiry_id)

    text_lines = ([reminder_intro, ""] if reminder else []) + [
        f"안녕하세요, {mentor_name}님.",
        mentor_intro_line(service_name),
        "",
        f"- 학생 이름: {student_name}",
        f"- 제목: {title}",
        "",
        "──────────",
        body,
        "──────────",
        "",
        footer,
        "",
        id_line,
    ]
    html = "".join([
        _WRAP,
        f'<p style="padding:8px 12px;background:#fff6e0;border-radius:4px;font-weight:bold">{_br(_e(reminder_intro))}</p>'
        if reminder else "",
        f"<p>안녕하세요, {_e(mentor_name)}님.<br>{_e(mentor_intro_line(service_name))}</p>",
        '<table style="border-collapse:collapse;margin:8px 0">',
        _ROW.format(label="학생 이름", value=_e(student_name)),
        _ROW.format(label="제목", value=_e(title)),
        "</table>",
        _QUOTE.format(body=_br(_e(body))),
        f'<p style="margin-top:24px;font-weight:bold">{_br(_e(footer))}</p>',
        f'<p style="margin-top:16px;font-size:11px;color:#999">{_e(id_line)}</p>',
        "</div>",
    ])
    return Mail(subject=f"{prefix} {title}", text_body="\n".join(text_lines), html_body=html)


def student_copy_mail(
    settings: dict[str, str], mentor_name: str, student_name: str, title: str, body: str, sent_at: datetime
) -> Mail:
    """학생에게 보낼 "보낸 문의 사본". 문의번호·멘토 이메일 없음."""
    intro = settings["studentCopyIntro"]
    footer = settings["studentCopyFooter"]
    sent = sent_at.astimezone(KST).strftime("%Y-%m-%d %H:%M")
    text = "\n".join([
        f"안녕하세요, {student_name}님.",
        intro,
        "",
        f"- 받는 멘토: {mentor_name}",
        f"- 제목: {title}",
        f"- 보낸 일시: {sent}",
        "",
        "──────────",
        body,
        "──────────",
        "",
        footer,
    ])
    html = "".join([
        _WRAP,
        f"<p>안녕하세요, {_e(student_name)}님.<br>{_br(_e(intro))}</p>",
        '<table style="border-collapse:collapse;margin:8px 0">',
        _ROW.format(label="받는 멘토", value=_e(mentor_name)),
        _ROW.format(label="제목", value=_e(title)),
        _ROW.format(label="보낸 일시", value=_e(sent)),
        "</table>",
        _QUOTE.format(body=_br(_e(body))),
        f'<p style="margin-top:24px;font-size:12px;color:#666">{_br(_e(footer))}</p>',
        "</div>",
    ])
    return Mail(subject=f"{settings['studentCopySubjectPrefix']} {title}", text_body=text, html_body=html)


def student_forward_mail(
    settings: dict[str, str], student_name: str, title: str, mentor_name: str, reply_text: str
) -> Mail:
    """학생에게 전달할 멘토 답장. 멘토 이름만 (멘토 이메일·문의번호·멘토 안내 문구 없음)."""
    intro = settings["studentForwardIntro"]
    footer = settings["studentForwardFooter"]
    text = "\n".join([
        f"안녕하세요, {student_name}님.",
        intro,
        "",
        f"- 답장한 멘토: {mentor_name}",
        f"- 내 문의 제목: {title}",
        "",
        "──────────",
        reply_text,
        "──────────",
        "",
        footer,
    ])
    html = "".join([
        _WRAP,
        f"<p>안녕하세요, {_e(student_name)}님.<br>{_br(_e(intro))}</p>",
        '<table style="border-collapse:collapse;margin:8px 0">',
        _ROW.format(label="답장한 멘토", value=_e(mentor_name)),
        _ROW.format(label="내 문의 제목", value=_e(title)),
        "</table>",
        _QUOTE.format(body=_br(_e(reply_text))),
        f'<p style="margin-top:24px;font-size:12px;color:#666">{_br(_e(footer))}</p>',
        "</div>",
    ])
    return Mail(subject=f"{settings['studentSubjectPrefix']} {title}", text_body=text, html_body=html)
