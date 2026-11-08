-- 꾸로록 chunk 저장 테이블과 검색 함수 (Supabase SQL Editor 에 붙여넣고 실행)
-- 임베딩: OpenAI text-embedding-3-small (1536차원). 모델을 바꾸면 vector(1536) 숫자도 바꾼다.
-- 글 수십 개(chunk 수백 개) 수준이라 인덱스 없이 전체 비교해도 충분히 빠르다.

create extension if not exists vector;

create table if not exists kkurolog_chunks (
  chunk_id     text primary key,            -- "{post_id}#{chunk_index}"
  post_id      text not null,
  chunk_index  int  not null,
  post_type    text not null check (post_type in ('interview', 'letter', 'essay')),
  title        text not null default '',
  nickname     text not null default '',
  career_tags  text[] not null default '{}',
  date         text,
  url          text,
  visibility   text not null check (visibility in ('L1', 'L2', 'L3')),  -- L0 는 아예 저장하지 않는다
  question     text,
  content      text not null,
  embed_text   text not null,
  embedding    vector(1536) not null,
  unique (post_id, chunk_index)
);

-- 학생 브라우저가 직접 읽지 못하게 RLS 를 켠다. backend 는 서버 전용 키(service_role)로만 접근한다.
alter table kkurolog_chunks enable row level security;

create or replace function match_kkurolog_chunks(query_embedding vector(1536), match_count int)
returns table (
  chunk_id text, post_id text, chunk_index int, post_type text, title text, nickname text,
  career_tags text[], date text, url text, visibility text, question text, content text,
  embed_text text, similarity float
)
language sql stable
as $$
  select chunk_id, post_id, chunk_index, post_type, title, nickname, career_tags, date, url,
         visibility, question, content, embed_text,
         1 - (embedding <=> query_embedding) as similarity
  from kkurolog_chunks
  where visibility <> 'L0'
  order by embedding <=> query_embedding
  limit match_count;
$$;
