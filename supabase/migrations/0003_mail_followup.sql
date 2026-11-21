-- 멘토 문의 메일: 여러 번 왕복 (2026-11-21)
-- 0002_mail_tables.sql 다음에 실행한다. 여러 번 실행해도 안전하다.
--   python scripts/run_sql.py ../supabase/migrations/0003_mail_followup.sql
--
-- 바뀌는 것
-- - 멘토의 첫 답장 뒤에도 학생 ↔ 멘토가 계속 '답장'으로 주고받을 수 있다.
-- - 관리자는 첫 왕복(학생 문의 + 멘토 첫 답장)만 본다. 그 뒤 메일은 같은 메일을 두 번 보내지 않기 위한
--   처리 표시만 남기고(followup = true), 내용(reply_text)은 저장하지 않는다.


-- 1. 답장 기록: 첫 왕복 이후 메일 표시 ------------------------------------
alter table public.mail_replies
  add column if not exists followup boolean not null default false;  -- true = 첫 왕복 이후 메일 (관리자 화면에 안 보임, 본문 저장 안 함)

comment on column public.mail_replies.followup is
  '첫 왕복(학생 문의 + 멘토 첫 답장) 이후의 메일이면 true. 관리자 API에서 빼고, reply_text를 저장하지 않는다';


-- 2. 메일 설정: 새 키 2개 ---------------------------------------------------
-- 이미 있는 키는 건드리지 않는다.
insert into public.mail_settings (key, value, description) values
  ('mentorFollowupSubjectPrefix', '[꾸로록 추가 질문]',
     '학생이 멘토 답장에 다시 답장했을 때, 멘토에게 가는 메일 제목 앞에 붙는 말'),
  ('mentorFollowupIntro',         '학생이 멘토님의 답장에 이어서 메시지를 보냈어요.',
     '학생이 다시 답장했을 때, 멘토에게 가는 메일 맨 위 문구')
on conflict (key) do nothing;


-- 3. 메일 설정: 학생 안내 문구 바꾸기 ---------------------------------------
-- 이제 학생이 답장하면 멘토에게 전달되므로 안내 문구를 바꾼다.
-- 관리자가 이미 다른 문구로 고쳤다면 건드리지 않는다 (예전 기본 문구 그대로일 때만 바꿈).
update public.mail_settings
   set value = '이 메일에 답장하면 멘토님께 전달돼요.'
 where key = 'studentForwardFooter'
   and value = '이 메일은 꾸로록이 자동으로 전달한 메일이에요. 추가로 궁금한 점은 꾸로록에서 새 문의를 보내주세요.';
