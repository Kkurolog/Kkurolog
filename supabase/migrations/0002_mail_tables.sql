-- =====================================================================
-- 0002_mail_tables.sql
-- 꾸로록 멘토 문의 메일: mentors(멘토) / inquiries(문의) / mail_replies(답장 기록)
--                       / mail_settings(메일 문구·숫자 설정) / inquiry_counters(문의번호 순번)
--
-- 지금까지 구글 시트("멘토"·"문의"·"설정" 탭)와 backend/app/data/mentors_demo.json 에 나뉘어 있던 것을
-- Supabase 한 곳으로 모은다. (설계: apps-script/docs/SUPABASE_PLAN.md)
--   - 기록·판단은 백엔드가 하고, Apps Script 는 메일 보내기·받기만 한다.
--   - 관리자 페이지는 백엔드를 통해 이 테이블들을 보고 고친다.
--
-- 실행: python scripts/run_sql.py ../supabase/migrations/0002_mail_tables.sql
--       (또는 Supabase 대시보드 → SQL Editor 에 붙여넣고 Run)
-- 다시 실행해도 괜찮게 만들었다 (if not exists / create or replace / on conflict do nothing).
-- 0001_experience_tables.sql 다음에 실행한다. (mentors.person_id 가 people 을 가리킨다)
--
-- 보안 원칙 (0001 과 같음)
-- - 모든 테이블 RLS 켜고 정책은 만들지 않는다 → anon·authenticated(학생 화면)는 아무것도 못 읽는다.
-- - 백엔드가 쓰는 service_role 에게만 권한을 준다.
-- - 멘토 이메일(mentors.email)은 백엔드 안에서만 쓰고, 어떤 API 응답에도 넣지 않는다.
-- - 학생 이름·메일(inquiries)은 개인정보다. 관리자 로그인을 통과한 요청에서만 보여 준다.
-- =====================================================================


-- 1. 공통: updated_at 자동 갱신 ------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- 2. 멘토 ----------------------------------------------------------------
-- 지금의 mentors_demo.json(프로필) + 시트 "멘토" 탭(메일 주소·활성여부)을 합친 것.
-- 백엔드 available 과 시트 활성여부가 따로 있어서 생기던 불일치를 없애려고 "연락 가능" 칸을 하나로 둔다.
create table if not exists public.mentors (
  id            text primary key,                       -- 예: mt-01 (사이트·문의 기록이 이 값으로 멘토를 찾는다. 정하면 바꾸지 않는다)
  name          text not null,                          -- 화면에 보이는 이름 또는 별명
  exit_year     int,                                    -- 엑시트(졸업) 연도
  career_paths  text[] not null default '{}',           -- 진로 경로 (멘토 찾기 탭)
  path_summary  text not null default '',               -- 진로 경로 한 줄 요약
  summary       text not null default '',               -- 경험 요약 1~2줄
  tags          text[] not null default '{}',           -- 주요 경험 태그
  topics        text[] not null default '{}',           -- 답변 가능 주제
  consent       boolean not null default false,         -- 멘토 참여 동의. false 면 어디에도 노출하지 않는다
  available     boolean not null default false,         -- 지금 문의를 받는지 (= 시트 활성여부 + json available)
  email         text,                                   -- 멘토 메일. 백엔드 안에서만 쓴다 (응답·로그 금지)
  person_id     text references public.people(id) on delete set null,  -- (선택) 인터뷰 속 인물과 같은 사람이면 연결
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint mentors_email_format
    check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- 문의를 받으려면 참여 동의 + 메일 주소가 꼭 있어야 한다 (메일 없는 멘토에게 문의가 가는 일을 막음)
  constraint mentors_available_needs_consent_and_email
    check (not available or (consent and email is not null))
);

drop trigger if exists mentors_set_updated_at on public.mentors;
create trigger mentors_set_updated_at
  before update on public.mentors
  for each row execute function public.set_updated_at();


-- 3. 문의 ----------------------------------------------------------------
-- 지금의 시트 "문의" 탭과 같은 항목. (관리자 화면 8개 항목 + 문의번호·mentorId·리마인드 일시)
create table if not exists public.inquiries (
  id             text primary key,                      -- 문의번호. 예: q20261117-0001 (next_inquiry_id() 로 만든다)
  created_at     timestamptz not null default now(),    -- 보낸 일시
  mentor_id      text not null references public.mentors(id) on delete restrict,  -- 문의 기록이 있는 멘토는 지울 수 없다 (비활성으로만)
  student_name   text not null,
  student_email  text not null,
  title          text not null,
  body           text not null,
  replied        boolean not null default false,        -- 멘토 답변 여부
  replied_at     timestamptz,                           -- 첫 답장 시각 (여러 번 답장해도 바뀌지 않음)
  reminded_at    timestamptz,                           -- 리마인드 보낸 시각 (한 번만 보냄)

  constraint inquiries_id_format     check (id ~ '^q[0-9]{8}-[0-9]{4,}$'),
  constraint inquiries_name_length   check (char_length(student_name) between 1 and 30),
  constraint inquiries_email_length  check (char_length(student_email) between 3 and 254),
  constraint inquiries_title_length  check (char_length(title) between 1 and 100),
  constraint inquiries_body_length   check (char_length(body) between 1 and 2000),
  constraint inquiries_replied_pair  check (replied = (replied_at is not null))
);

-- 횟수 제한(같은 학생 메일 10분 3건·하루 5건)을 셀 때
create index if not exists inquiries_student_email_idx
  on public.inquiries (lower(student_email), created_at desc);
-- 관리자 목록 (최신순, 답장 전/후 필터)
create index if not exists inquiries_replied_created_idx
  on public.inquiries (replied, created_at desc);
-- 리마인드 대상 찾기 (답장 없음 + 리마인드 안 함)
create index if not exists inquiries_reminder_idx
  on public.inquiries (created_at)
  where not replied and reminded_at is null;
create index if not exists inquiries_mentor_idx
  on public.inquiries (mentor_id);


-- 4. 문의번호 순번 --------------------------------------------------------
-- 날짜(한국 시간)마다 0001 부터. 두 요청이 동시에 와도 번호가 겹치지 않게 한 줄 upsert 로 올린다.
-- 메일 발송에 실패해 문의를 지우면 그 번호는 건너뛴다 (번호가 비어도 문제없음).
create table if not exists public.inquiry_counters (
  day       date primary key,                           -- 한국 날짜
  last_seq  int  not null check (last_seq >= 0)
);

create or replace function public.next_inquiry_id()
returns text
language plpgsql
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
  seq   int;
begin
  insert into public.inquiry_counters as c (day, last_seq)
  values (today, 1)
  on conflict (day) do update set last_seq = c.last_seq + 1
  returning c.last_seq into seq;

  return 'q' || to_char(today, 'YYYYMMDD') || '-'
         || case when seq < 10000 then lpad(seq::text, 4, '0') else seq::text end;
end;
$$;


-- 5. 답장 기록 ------------------------------------------------------------
-- 멘토 답장 한 통마다 한 줄. 학생에게 전달했는지, 사람이 확인해야 하는지 남긴다.
-- (문의번호가 없는 일반 메일은 여기에 남기지 않는다)
create table if not exists public.mail_replies (
  message_id    text primary key,                       -- Gmail 메일 ID. 같은 답장을 두 번 처리하지 않게
  inquiry_id    text references public.inquiries(id) on delete cascade,
  from_email    text not null,                          -- 답장을 보낸 주소 (소문자)
  received_at   timestamptz not null,                   -- 중계 계정이 받은 시각
  status        text not null
                check (status in ('forwarded', 'needs_review', 'failed')),
  reason        text,                                   -- needs_review·failed 일 때 이유 (예: sender_mismatch, empty_body, send_failed)
  reply_text    text,                                   -- 학생에게 전달한(또는 전달하려던) 본문. 인용문을 지운 것
  processed_at  timestamptz not null default now()
);

create index if not exists mail_replies_inquiry_idx
  on public.mail_replies (inquiry_id, received_at);
create index if not exists mail_replies_status_idx
  on public.mail_replies (status, processed_at desc);


-- 6. 메일 설정 ------------------------------------------------------------
-- 지금의 시트 "설정" 탭. 관리자 페이지에서 "값"만 고친다. 메일을 보낼 때마다 읽으므로 고치면 바로 다음 메일부터 적용.
-- 숫자 칸(rateLimit*, reminderDays)은 0 이상의 정수 글자. 비었거나 숫자가 아니면 백엔드가 기본값을 쓴다.
create table if not exists public.mail_settings (
  key          text primary key,
  value        text not null default '',
  description  text not null default '',
  updated_at   timestamptz not null default now()
);

drop trigger if exists mail_settings_set_updated_at on public.mail_settings;
create trigger mail_settings_set_updated_at
  before update on public.mail_settings
  for each row execute function public.set_updated_at();

-- 기본값 (시트 "설정" 탭과 같음). 이미 있는 키는 건드리지 않는다.
insert into public.mail_settings (key, value, description) values
  ('serviceName',                 '꾸로록',
     '서비스 이름. 메일 본문 인사말 등에 쓴다'),
  ('senderName',                  '꾸로록',
     '메일 ''보낸 사람''에 보이는 이름'),
  ('mentorSubjectPrefix',         '[꾸로록 문의]',
     '멘토에게 가는 메일 제목 앞에 붙는 말'),
  ('mentorFooter',                '답장을 보내실 때, 반드시 해당 메일 주소로 ''답장'' 기능을 활용해 보내주세요!',
     '멘토에게 가는 메일 맨 아래 안내 문구'),
  ('studentSubjectPrefix',        '[꾸로록 답장]',
     '학생에게 전달되는 답장 메일 제목 앞에 붙는 말'),
  ('studentForwardIntro',         '멘토님이 보내주신 답장을 전달해 드려요.',
     '학생에게 전달되는 메일 맨 위 안내 문구'),
  ('studentForwardFooter',        '이 메일은 꾸로록이 자동으로 전달한 메일이에요. 추가로 궁금한 점은 꾸로록에서 새 문의를 보내주세요.',
     '학생에게 전달되는 메일 맨 아래 안내 문구'),
  ('rateLimitMinutes',            '10',
     '같은 학생 메일의 문의 수를 셀 시간(분). rateLimitPerWindow와 함께 씀. 0이면 이 제한 없음'),
  ('rateLimitPerWindow',          '3',
     'rateLimitMinutes분 안에 같은 학생 메일로 보낼 수 있는 문의 수. 0이면 이 제한 없음'),
  ('rateLimitPerDay',             '5',
     '같은 학생 메일로 하루(자정 기준)에 보낼 수 있는 문의 수. 0이면 제한 없음'),
  ('studentCopySubjectPrefix',    '[꾸로록 보낸 문의]',
     '학생에게 가는 "보낸 문의 사본" 메일 제목 앞에 붙는 말'),
  ('studentCopyIntro',            '멘토님께 아래 문의를 보냈어요. 답장이 오면 이 메일 주소로 전달해 드려요.',
     '학생에게 가는 "보낸 문의 사본" 메일 맨 위 안내 문구'),
  ('studentCopyFooter',           '이 메일은 보낸 문의의 사본이에요. 이 메일에 답장해도 멘토에게 전달되지 않아요.',
     '학생에게 가는 "보낸 문의 사본" 메일 맨 아래 안내 문구'),
  ('reminderDays',                '10',
     '답장이 없을 때 보낸 날짜로부터 며칠째에 멘토에게 한 번 더 보낼지. 0이면 보내지 않음'),
  ('mentorReminderSubjectPrefix', '[꾸로록 리마인드]',
     '멘토에게 가는 리마인드 메일 제목 앞에 붙는 말'),
  ('mentorReminderIntro',         '열흘 전 꾸로록에 들어온 문의가 멘토님을 기다리고 있어요. 해당 메일의 ''답장'' 버튼으로 회신해 주세요!',
     '멘토에게 가는 리마인드 메일 맨 위 문구')
on conflict (key) do nothing;


-- 7. 보안: RLS + 권한 ---------------------------------------------------
alter table public.mentors          enable row level security;
alter table public.inquiries        enable row level security;
alter table public.inquiry_counters enable row level security;
alter table public.mail_replies     enable row level security;
alter table public.mail_settings    enable row level security;

revoke all on public.mentors, public.inquiries, public.inquiry_counters,
              public.mail_replies, public.mail_settings
  from anon, authenticated;
grant select, insert, update, delete on public.mentors, public.inquiries, public.inquiry_counters,
                                        public.mail_replies, public.mail_settings
  to service_role;

-- 함수는 기본으로 누구나 실행할 수 있다 → 백엔드(service_role)만 실행하게 막는다
revoke execute on function public.next_inquiry_id() from public, anon, authenticated;
grant  execute on function public.next_inquiry_id() to service_role;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
