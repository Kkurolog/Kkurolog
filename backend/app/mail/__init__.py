"""
멘토 문의 메일 (B 방식: Supabase + 메일 전용 Apps Script).

- 저장: Supabase (mentors, inquiries, mail_replies, mail_settings) — supabase/migrations/0002_mail_tables.sql
- 판단: 이 패키지 (검사, 횟수 제한, 문의번호, 기록, 답장 확인·정리, 리마인드 대상)
- 메일 보내기·받기: Apps Script 웹앱 (apps-script/, 약속은 apps-script/docs/API.md v1.0)

MAIL_ENABLED=true 일 때만 동작한다. 꺼져 있으면 멘토는 app/data/mentors_demo.json, 문의는 로그만 (demo).
설계: apps-script/docs/SUPABASE_PLAN.md
"""
