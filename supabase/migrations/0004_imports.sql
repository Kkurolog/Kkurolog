-- =====================================================================
-- 0004_imports.sql
-- 관리자 페이지 '인터뷰 넣기': 올린 txt 파일을 검토하는 동안 머무는 임시 저장 테이블 + 공개 함수
--
-- 흐름 (backend/app/ingest/)
--   1. 관리자가 txt 를 올린다 → import_files 에 원문과 status='analyzing' 으로 저장
--   2. AI(Claude)가 말한 사람·조각·태그·개인정보 의심 부분 초안을 만든다 → draft, status='review'
--   3. 관리자가 검토 화면에서 고치고 확인한다 → draft 저장
--   4. 공개: backend 가 임베딩을 만든 뒤 publish_import() 한 번으로 sources·people·chunks 에 넣는다
--      (함수 안이라 한 트랜잭션: 중간에 하나라도 실패하면 아무것도 안 들어간다)
--      공개하면 원문(raw_text)은 지운다. 조각은 chunks 에 남는다.
--
-- 실행:  cd scripts && python run_sql.py ../supabase/migrations/0004_imports.sql
-- 다시 실행해도 괜찮다 (if not exists / create or replace).
--
-- 보안: 원문에 실명·개인정보가 있을 수 있다. RLS 를 켜고 service_role(backend)만 읽고 쓴다.
-- =====================================================================

create table if not exists public.import_files (
  id            text primary key,                       -- 예: imp-20261125-a1b2
  filename      text not null,
  status        text not null default 'analyzing'
                check (status in ('analyzing', 'review', 'published', 'failed')),
  raw_text      text not null default '',               -- 올린 원문 (공개하면 '' 로 지움)
  draft         jsonb,                                  -- AI 초안 + 관리자 수정 (backend/app/ingest/models.py ImportDraft)
  summary       jsonb,                                  -- 목록에 보여줄 개수 (사람·조각·확인한 조각). draft 를 저장할 때 같이 갱신
  error         text,                                   -- 분석 실패 이유 (개인정보·원문 없이 짧게)
  source_id     text,                                   -- 공개 후 sources.id
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  analyzed_at   timestamptz,
  published_at  timestamptz
);

create index if not exists import_files_created_at_idx on public.import_files (created_at desc);

alter table public.import_files enable row level security;
revoke all on public.import_files from anon, authenticated;
grant select, insert, update, delete on public.import_files to service_role;


-- 공개 함수 --------------------------------------------------------------
-- p_source: {id, title, url, published_at, source_type, site, visibility}
-- p_people: [{id, is_new, nickname, real_name, speaker_type, path_summary, career_paths, path_detail,
--             career_fields, field_detail, organizations, as_of_date}]
--           is_new=false 이면 이미 있는 인물: 이 글 번호만 source_ids 에 더한다 (다른 칸은 그대로)
-- p_chunks: [{id, person_id, chunk_index, question, content, embed_text, topics, topic_detail,
--             career_paths, career_fields, speaker_type, char_count, embedding("[0.1, ...]"), embedding_model}]
-- 오류: KK001 = 검토 상태가 아님(이미 공개했거나 분석 중), 23505 = 같은 id 가 이미 있음
create or replace function public.publish_import(
  p_import_id text,
  p_source    jsonb,
  p_people    jsonb,
  p_chunks    jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_status text;
  v_source_id text := p_source->>'id';
  v_visibility text := coalesce(p_source->>'visibility', 'L1');
  p jsonb;
  c jsonb;
  v_people int := 0;
  v_chunks int := 0;
begin
  select status into v_status from public.import_files where id = p_import_id for update;
  if v_status is distinct from 'review' then
    raise exception 'import % is not in review (status=%)', p_import_id, coalesce(v_status, 'missing')
      using errcode = 'KK001';
  end if;

  insert into public.sources (id, title, url, published_at, source_type, site, visibility)
  values (
    v_source_id,
    p_source->>'title',
    coalesce(p_source->>'url', ''),
    nullif(p_source->>'published_at', '')::date,
    p_source->>'source_type',
    p_source->>'site',
    v_visibility
  );

  for p in select * from jsonb_array_elements(p_people) loop
    if (p->>'is_new')::boolean then
      insert into public.people (id, nickname, real_name, speaker_type, path_summary,
                                 career_paths, path_detail, career_fields, field_detail, organizations,
                                 as_of_date, is_mentor, source_ids)
      values (
        p->>'id',
        p->>'nickname',
        nullif(p->>'real_name', ''),
        p->>'speaker_type',
        p->>'path_summary',
        array(select jsonb_array_elements_text(p->'career_paths')),
        array(select jsonb_array_elements_text(p->'path_detail')),
        array(select jsonb_array_elements_text(p->'career_fields')),
        array(select jsonb_array_elements_text(p->'field_detail')),
        array(select jsonb_array_elements_text(p->'organizations')),
        nullif(p->>'as_of_date', '')::date,
        false,
        array[v_source_id]
      );
    else
      update public.people
         set source_ids = array(select distinct unnest(source_ids || array[v_source_id]))
       where id = p->>'id';
      if not found then
        raise exception 'person % not found', p->>'id' using errcode = 'KK002';
      end if;
    end if;
    v_people := v_people + 1;
  end loop;

  for c in select * from jsonb_array_elements(p_chunks) loop
    insert into public.chunks (id, source_id, person_id, chunk_index, question, content, embed_text,
                               topics, topic_detail, career_paths, career_fields, speaker_type,
                               visibility, char_count, embedding, embedding_model)
    values (
      c->>'id',
      v_source_id,
      c->>'person_id',
      (c->>'chunk_index')::int,
      coalesce(c->>'question', ''),
      c->>'content',
      c->>'embed_text',
      array(select jsonb_array_elements_text(c->'topics')),
      array(select jsonb_array_elements_text(c->'topic_detail')),
      array(select jsonb_array_elements_text(c->'career_paths')),
      array(select jsonb_array_elements_text(c->'career_fields')),
      c->>'speaker_type',
      v_visibility,
      (c->>'char_count')::int,
      (c->>'embedding')::extensions.vector,
      c->>'embedding_model'
    );
    v_chunks := v_chunks + 1;
  end loop;

  update public.import_files
     set status = 'published', source_id = v_source_id, raw_text = '',
         published_at = now(), updated_at = now()
   where id = p_import_id;

  return jsonb_build_object('source_id', v_source_id, 'people', v_people, 'chunks', v_chunks);
end;
$$;

revoke execute on function public.publish_import(text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant  execute on function public.publish_import(text, jsonb, jsonb, jsonb) to service_role;
