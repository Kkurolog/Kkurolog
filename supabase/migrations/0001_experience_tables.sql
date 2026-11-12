-- =====================================================================
-- 0001_experience_tables.sql
-- 꾸로록 Experience 데이터: sources(글) / people(인물) / chunks(조각) + 검색 함수
--
-- 실행: Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여넣고 Run
-- 다시 실행해도 괜찮게 만들었다 (if not exists / create or replace).
--
-- 보안 원칙
-- - 세 테이블 모두 RLS를 켠다. 정책(policy)은 만들지 않으므로 anon·authenticated는 아무것도 못 읽는다.
-- - 백엔드·스크립트가 쓰는 service_role에게만 권한을 명시적으로 준다 (service_role은 RLS를 건너뛴다).
-- - 실명(people.real_name)은 DB에만 두고, 검색 함수 결과에는 별명만 내보낸다.
-- - visibility가 L0인 조각·글은 검색 함수에서 절대 나오지 않는다.
-- =====================================================================

-- 1. 벡터 확장 (pgvector). Supabase 권장대로 extensions 스키마에 설치
create extension if not exists vector with schema extensions;


-- 2. 테이블 ------------------------------------------------------------

-- 글 단위 (원문 출처)
create table if not exists public.sources (
  id            text primary key,                       -- 글번호 (예: 134676010)
  title         text not null,
  url           text not null,
  published_at  date,
  source_type   text not null,                          -- 졸업생 인터뷰 / 졸업생 에세이
  site          text,                                   -- gschool.kr
  visibility    text not null default 'L1'
                check (visibility in ('L0', 'L1', 'L2', 'L3')),
  created_at    timestamptz not null default now()
);

-- 인물 단위 (태그 code는 docs/TAGS.md 기준)
create table if not exists public.people (
  id             text primary key,                      -- 예: p-chashu
  nickname       text not null,
  real_name      text,                                  -- 검색 결과에 내보내지 않음
  speaker_type   text not null,                         -- alumni
  path_summary   text,
  career_paths   text[] not null default '{}',
  path_detail    text[] not null default '{}',
  career_fields  text[] not null default '{}',
  field_detail   text[] not null default '{}',
  organizations  text[] not null default '{}',
  as_of_date     date,                                  -- 진로 정보 기준일 = 인터뷰 게시일
  is_mentor      boolean not null default false,
  source_ids     text[] not null default '{}',
  created_at     timestamptz not null default now()
);

-- 조각 단위 (검색 대상)
create table if not exists public.chunks (
  id               text primary key,                    -- {글번호}-{순서 두 자리}
  source_id        text not null references public.sources(id) on delete cascade,
  person_id        text not null references public.people(id) on delete cascade,
  chunk_index      int  not null,
  question         text not null default '',
  content          text not null,
  embed_text       text not null,                       -- 임베딩에 넣을 글 ([별명 | 경로 | 기관 | 질문] + 답변)
  topics           text[] not null default '{}',
  topic_detail     text[] not null default '{}',
  career_paths     text[] not null default '{}',        -- 인물 태그를 복사 (필터 검색용)
  career_fields    text[] not null default '{}',
  speaker_type     text not null,
  visibility       text not null default 'L1'
                   check (visibility in ('L0', 'L1', 'L2', 'L3')),
  char_count       int,
  embedding        extensions.vector(1536),             -- 다음 단계에서 채움 (지금은 null)
  embedding_model  text,                                -- 예: text-embedding-3-small
  created_at       timestamptz not null default now(),
  unique (source_id, chunk_index)
);


-- 3. 인덱스 (태그·visibility로 빠르게 거르기) -------------------------
create index if not exists chunks_source_id_idx     on public.chunks (source_id);
create index if not exists chunks_person_id_idx     on public.chunks (person_id);
create index if not exists chunks_visibility_idx    on public.chunks (visibility);
create index if not exists chunks_topics_idx        on public.chunks using gin (topics);
create index if not exists chunks_career_paths_idx  on public.chunks using gin (career_paths);
create index if not exists chunks_career_fields_idx on public.chunks using gin (career_fields);
create index if not exists people_career_paths_idx  on public.people using gin (career_paths);
create index if not exists people_career_fields_idx on public.people using gin (career_fields);
-- 벡터 유사도 검색용 (코사인 거리). 비어 있는 칸(null)은 색인에서 빠진다
create index if not exists chunks_embedding_idx
  on public.chunks using hnsw (embedding extensions.vector_cosine_ops);


-- 4. 보안: RLS + 권한 ---------------------------------------------------
alter table public.sources enable row level security;
alter table public.people  enable row level security;
alter table public.chunks  enable row level security;

revoke all on public.sources, public.people, public.chunks from anon, authenticated;
grant select, insert, update, delete on public.sources, public.people, public.chunks to service_role;


-- 5. 검색 함수 match_chunks ----------------------------------------------
-- 입력: 질문 임베딩, 개수, (선택) 경로·분야·주제 태그 필터 (하나라도 겹치면 통과)
-- 출력: 조각 + 출처(title, url) + 별명 + 유사도(1에 가까울수록 비슷)
create or replace function public.match_chunks(
  query_embedding       extensions.vector(1536),
  match_count           int    default 5,
  filter_career_paths   text[] default null,
  filter_career_fields  text[] default null,
  filter_topics         text[] default null
)
returns table (
  chunk_id       text,
  source_id      text,
  person_id      text,
  chunk_index    int,
  question       text,
  content        text,
  topics         text[],
  career_paths   text[],
  career_fields  text[],
  visibility     text,
  title          text,
  url            text,
  published_at   date,
  nickname       text,
  path_summary   text,
  similarity     float
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    c.id, c.source_id, c.person_id, c.chunk_index, c.question, c.content,
    c.topics, c.career_paths, c.career_fields, c.visibility,
    s.title, s.url, s.published_at,
    p.nickname, p.path_summary,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.chunks c
  join public.sources s on s.id = c.source_id
  join public.people  p on p.id = c.person_id
  where c.embedding is not null
    and c.visibility in ('L1', 'L2', 'L3')          -- L0은 절대 내보내지 않음
    and s.visibility in ('L1', 'L2', 'L3')
    and (filter_career_paths  is null or c.career_paths  && filter_career_paths)
    and (filter_career_fields is null or c.career_fields && filter_career_fields)
    and (filter_topics        is null or c.topics        && filter_topics)
  order by c.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 50);
$$;

-- 함수도 기본으로는 누구나(PUBLIC) 실행할 수 있어서, service_role만 쓰게 막는다
revoke execute on function public.match_chunks(extensions.vector, int, text[], text[], text[])
  from public, anon, authenticated;
grant execute on function public.match_chunks(extensions.vector, int, text[], text[], text[])
  to service_role;
