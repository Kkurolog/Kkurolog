"""
관리자 API (/admin/*). 관리자 페이지가 문의 기록을 보고, 멘토·메일 설정을 고칠 때 쓴다.

- 로그인: 공용 비밀번호 하나 (환경변수 ADMIN_PASSWORD). 관리자를 구분하지 않고, 변경 기록도 남기지 않는다.
- 응답에 학생 이름·메일, 멘토 메일이 들어 있다. 관리자 로그인을 통과한 요청에만 준다.
- MAIL_ENABLED=true 일 때만 동작한다 (데이터가 Supabase 에 있으므로).
형식: apps-script/docs/ADMIN_API.md
"""
