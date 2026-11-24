-- gschool.kr 공개 글(Exit 오깔 인터뷰·에세이)의 공개 등급을 L1(익명, 근거로만) → L3(별명·제목·원문 링크·원문 구간 공개)로 올린다.
--
-- 근거: 2026-11-18, 교장선생님이 "웹에 공개된 글이고 재학생의 진로에 도움이 되라고 쓴 글이니 모두 사용해도 된다"고 허락
--       (백엔드 담당이 전달. 팀 기록: docs/proposals/visibility-l3.md → 확정되면 docs/DECISIONS.md 에 옮긴다)
--
-- ⚠️ 실행 순서를 꼭 지킨다 (docs/proposals/visibility-l3.md):
--   1. 제목 끝의 실명 표기를 지우는 코드(backend/app/rag/pipeline.py 의 strip_author)가 배포된 뒤에 실행한다.
--      그 전에 실행하면 "제목 - 실명 [별명]" 모양의 제목 20개가 실명과 함께 화면·답변에 나갈 수 있다.
--   2. 배포된 사이트가 같은 DB 를 쓰므로, 실행하는 즉시 실제 사용자에게 반영된다.
--
-- 실행:  cd scripts && python run_sql.py ../supabase/migrations/0003_gschool_visibility_l3.sql
-- 여러 번 실행해도 결과가 같다.

update public.sources
   set visibility = 'L3'
 where site = 'gschool.kr'
   and visibility = 'L1';

update public.chunks c
   set visibility = 'L3'
  from public.sources s
 where s.id = c.source_id
   and s.site = 'gschool.kr'
   and c.visibility = 'L1';

-- 되돌리기 (문제가 생기면 아래 두 문장을 실행한다. 다시 익명으로 돌아간다)
--   update public.chunks c set visibility = 'L1' from public.sources s
--    where s.id = c.source_id and s.site = 'gschool.kr' and c.visibility = 'L3';
--   update public.sources set visibility = 'L1' where site = 'gschool.kr' and visibility = 'L3';
