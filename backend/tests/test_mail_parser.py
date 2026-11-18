"""메일 답장 정리(reply_parser)·메일 문장(templates) 테스트. 메일·DB 를 쓰지 않는다.
(예전 apps-script Test.gs 의 testReplyParser, testMailTemplates 를 옮긴 것)"""

from datetime import datetime

import pytest

from app.mail.mail_settings import DEFAULTS, merge_settings, number
from app.mail.reply_parser import extract_reply_text, find_inquiry_id
from app.mail.templates import (
    inquiry_id_line,
    mentor_inquiry_mail,
    mentor_intro_line,
    student_copy_mail,
    student_forward_mail,
)
from app.mail.timeutil import KST

SETTINGS = dict(DEFAULTS)
FOOTER = SETTINGS["mentorFooter"]
INTRO = mentor_intro_line(SETTINGS["serviceName"])
REMINDER = SETTINGS["mentorReminderIntro"]
ID = "q20261108-0001"
ORIGINAL = ["안녕하세요, 테스트멘토님.", INTRO, "", "- 학생 이름: 테스트학생", "", "학생 문의 내용", "", FOOTER, "", inquiry_id_line(ID)]
QUOTED = ["> " + line for line in ORIGINAL]
ANSWER = "좋은 질문이에요.\n제 경험을 말씀드리면 이래요."


@pytest.mark.parametrize(
    "name, lines",
    [
        ("Gmail 한국어", [ANSWER, "", "2026년 11월 8일 (일) 오후 2:03, 꾸로록 <relay>님이 작성:", *QUOTED]),
        ("Gmail 한국어(두 줄)", [ANSWER, "", "2026년 11월 8일 (일) 오후 2:03, 꾸로록 <relay>님이", "작성:", *QUOTED]),
        ("Gmail 영어(두 줄)", [ANSWER, "", "On Sun, Nov 8, 2026 at 2:03 PM 꾸로록 <relay>", "wrote:", "", *QUOTED]),
        ("네이버/아웃룩", [ANSWER, "", "-----Original Message-----", "From: 꾸로록 <relay>", "Sent: 2026-11-08", *ORIGINAL]),
        ("아웃룩 밑줄", [ANSWER, "", "________________________________", "보낸 사람: 꾸로록", *ORIGINAL]),
        ("인용 표시 없음", [ANSWER, "", *ORIGINAL]),
        ("> 인용만", [ANSWER, "", *QUOTED]),
        ("안내 문구·번호만 남음", [ANSWER, "", FOOTER, inquiry_id_line(ID)]),
        ("리마인드 메일, 인용 표시 없음", [ANSWER, "", REMINDER, "", *ORIGINAL]),
        ("리마인드 메일, Gmail 한국어", [ANSWER, "", "2026년 11월 18일 (수) 오전 10:03, 꾸로록 <relay>님이 작성:", "> " + REMINDER, ">", *QUOTED]),
        ("윈도우 줄바꿈", ["\r\n".join([ANSWER, "", *QUOTED])]),
    ],
)
def test_extract_reply_text(name, lines):
    assert extract_reply_text("\n".join(lines), SETTINGS) == ANSWER, name


def test_extract_reply_text_empty_when_mentor_wrote_nothing():
    body = "\n".join(["2026년 11월 8일 (일) 오후 2:03, 꾸로록 <relay>님이 작성:", *QUOTED])
    assert extract_reply_text(body, SETTINGS) == ""


@pytest.mark.parametrize(
    "recipients, body, expected",
    [
        (["꾸로록 <relay+q20261108-0001@gmail.com>"], "", ID),
        (["RELAY+Q20261108-0001@GMAIL.COM"], "", ID),
        (["relay@gmail.com"], ANSWER + "\n> " + inquiry_id_line(ID), ID),
        (["relay+q20261108-0002@gmail.com"], "> " + inquiry_id_line(ID), "q20261108-0002"),  # 주소가 우선
        (["relay@gmail.com"], ANSWER, None),
    ],
)
def test_find_inquiry_id(recipients, body, expected):
    assert find_inquiry_id(recipients, body) == expected


def test_mentor_mail_has_id_line_and_escapes_html():
    mail = mentor_inquiry_mail(SETTINGS, "멘토", ID, "<b>학생</b>", "제목", "내용 <script>")
    assert mail.subject == "[꾸로록 문의] 제목"
    assert mail.text_body.splitlines()[-1] == inquiry_id_line(ID)
    assert "<script>" not in mail.html_body and "&lt;script&gt;" in mail.html_body
    assert REMINDER not in mail.text_body


def test_reminder_mail():
    mail = mentor_inquiry_mail(SETTINGS, "멘토", ID, "학생", "제목", "내용", reminder=True)
    assert mail.subject == "[꾸로록 리마인드] 제목"
    assert mail.text_body.splitlines()[0] == REMINDER
    assert inquiry_id_line(ID) in mail.text_body


def test_student_copy_has_no_inquiry_id_or_email():
    sent = datetime(2026, 11, 17, 14, 3, tzinfo=KST)
    mail = student_copy_mail(SETTINGS, "멘토", "학생", "제목", "내용", sent)
    assert mail.subject == "[꾸로록 보낸 문의] 제목"
    assert "2026-11-17 14:03" in mail.text_body
    assert "문의번호" not in mail.text_body + mail.html_body
    assert "@" not in mail.text_body + mail.html_body


def test_student_forward_shows_mentor_name_only():
    mail = student_forward_mail(SETTINGS, "학생", "제목", "새벽", "답장 내용")
    assert mail.subject == "[꾸로록 답장] 제목"
    assert "새벽" in mail.text_body and "답장 내용" in mail.text_body
    assert "@" not in mail.text_body + mail.html_body


def test_settings_merge_and_numbers():
    merged = merge_settings({"senderName": "꾸로록 테스트", "rateLimitPerDay": "", "reminderDays": "abc"})
    assert merged["senderName"] == "꾸로록 테스트"
    assert merged["rateLimitPerDay"] == "5"  # 비어 있으면 기본값
    assert number(merged, "reminderDays") == 10  # 숫자가 아니면 기본값
    assert number(merge_settings({"rateLimitMinutes": "0"}), "rateLimitMinutes") == 0
