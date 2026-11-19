# scripts

인터뷰 데이터를 수집·정제(개인정보 제거, chunking)하고 DB에 적재하는 스크립트를 두는 곳. 흐름은 [docs/DATA.md](../docs/DATA.md) 참고.

- 코드는 여기(`scripts/`)에, **수집한 데이터는 `data/`에** 저장한다.
- `data/` 폴더는 통째로 `.gitignore`에 들어 있어 GitHub에 올라가지 않는다. 졸업생 실명과 인터뷰 전문이 들어 있으니 다른 곳에 업로드하지 않는다. (학교 사용 허락 전)
- Python 환경은 backend와 따로 쓴다 (`scripts/.venv`).

## 처음 설치 (한 번만)

```bash
cd scripts
python -m venv .venv

# 가상환경 켜기
source .venv/bin/activate        # macOS / Linux
.venv\Scripts\activate           # Windows (PowerShell, cmd)
source .venv/Scripts/activate    # Windows (Git Bash)

pip install -r requirements.txt
```

Supabase를 쓰는 스크립트(`run_sql.py`, `load_to_supabase.py`)는 접속 정보가 필요하다.
`.env.example`을 `.env`로 복사하고 값을 채운다. **`.env`는 git에 올라가지 않으며, 절대 공유하지 않는다.**

| 항목 | 어디서 찾나 | 쓰는 스크립트 |
|---|---|---|
| `SUPABASE_URL` | 대시보드 → Project Settings → API | load_to_supabase.py |
| `SUPABASE_SECRET_KEY` | 대시보드 → Project Settings → API Keys → Secret key (service_role 권한) | load_to_supabase.py |
| `SUPABASE_DB_URL` | 대시보드 → Connect → **Session pooler** 주소 (`postgresql://...pooler.supabase.com:5432/postgres`) | run_sql.py, embed_chunks.py |
| `OPENAI_API_KEY` | platform.openai.com → API keys (콘솔에서 월 사용 한도도 설정) | embed_chunks.py |

## 전체 순서 한눈에 보기

```bash
python collect_gschool.py      # 1. 수집          → data/raw/
python chunk_gschool.py        # 2. 조각 나누기    → data/processed/base/
#                                3. 태깅: data/processed/tags/batch_*.json (사람이 docs/TAGS.md 기준으로 작성)
python build_dataset.py        # 4. 합치기·검수 CSV → data/processed/
python check_tags.py           # 5. 태그 검사 (문제 없음 ✅ 이어야 다음으로)
python run_sql.py ../supabase/migrations/0001_experience_tables.sql   # 6. 테이블 만들기 (처음 한 번)
python load_to_supabase.py     # 7. 적재 (여러 번 돌려도 중복 없음)
python embed_chunks.py         # 8. 임베딩 채우기 (비어 있는 조각만, OPENAI_API_KEY 필요)
```

## collect_gschool.py — "Exit 오깔" 졸업생 인터뷰 수집

gschool.kr 에세이 게시판에서 라벨이 "Exit 오깔"인 글만 골라 본문을 저장한다.

```bash
cd scripts   # 가상환경을 켠 상태에서
python collect_gschool.py --max-pages 2   # 테스트: 목록 2페이지만
python collect_gschool.py                 # 전체 수집
```

- 결과: `data/raw/gschool_exit_okkal.json` (글마다 `idx, url, title, date, interviewee, nickname, body, collected_at`)
- `body`는 문단마다 줄바꿈되어 있고, 인터뷰 **질문 줄은 앞에 `Q: `** 가 붙어 있다 (원문에서 굵은 글씨인 문단).
  - 2022년 초기 글은 질문이 굵은 글씨가 아니라 `메디 : ...`처럼 말하는 사람 이름으로 구분되어 있다.
- 제목에서 이름·별명을 못 뽑으면 빈 값으로 두고 경고를 출력한다.
- 예의 있게 수집: 요청 사이 1.5초 대기, User-Agent `kkurolog-student-project`, 실패하면 1번만 다시 시도.
- 사이트는 마지막 페이지(2026-11 기준 24페이지)를 넘으면 마지막 페이지를 반복해서 보여주므로, **새 글이 없는 페이지에서 멈춘다**.
- 전체 수집은 요청이 70번쯤이라 2~3분 걸린다. (2026-11 기준 Exit 오깔 글 44개, 2022-03 ~ 2025-01)

## chunk_gschool.py — 조각 나누기

수집한 글을 검색용 조각으로 자른다. 규칙만 쓰므로 같은 입력이면 항상 같은 결과가 나온다.

- Q&A 인터뷰: `Q:` 줄부터 다음 `Q:` 직전까지 한 조각. 답변이 1,000자를 넘으면 문단 기준으로 나누고 같은 질문을 붙인다.
- 에세이: 문단을 400~800자 정도로 묶는다.
- 버리는 것: 안내문(`*코-레터…`), 반복된 제목 줄, 첫 질문 앞 편집자 소개, 글 끝 "투게덥의 한마디/에디터의 말", 코칭교사 코멘트.
- 제외 글 목록(`EXCLUDE`)과 여러 명 인터뷰(`MULTI_SPEAKERS`)는 파일 위쪽에 있다.
- `python chunk_gschool.py -v`: 글마다 버린 줄을 보여준다.

## build_dataset.py / check_tags.py — 최종 데이터와 태그 검사

- `build_dataset.py`: 조각 + 태깅 결과 + TAGS.md를 합쳐 `sources.json`, `people.json`, `chunks.json`과
  검수용 `review_chunks.csv`, `review_people.csv`(엑셀·구글 시트용 UTF-8 BOM)를 만든다. 끝에 태그별 개수·짧은 조각 등 요약을 출력한다.
- `check_tags.py`: 데이터의 태그가 `docs/TAGS.md`에 맞는지 검사하고, etc 상세 값의 승격 후보를 보여준다. 문제가 있으면 종료 코드 1.

## run_sql.py — Supabase에 SQL 실행

```bash
python run_sql.py --test                                             # 접속만 확인 (select 1)
python run_sql.py ../supabase/migrations/0001_experience_tables.sql  # SQL 파일 실행
python run_sql.py --query "select count(*) from public.chunks"       # 쿼리 한 줄 실행
```

- `.env`의 `SUPABASE_DB_URL`로 접속한다. 비밀번호에 `@ # / %` 같은 특수문자가 있어도 된다.
- 파일은 **한 트랜잭션**으로 실행한다. 중간에 오류가 나면 전부 취소되어 DB는 실행 전 상태 그대로다.
- 오류가 나면 메시지와 SQL 파일의 몇 번째 줄 근처인지 보여준다. 접속 주소·비밀번호는 출력하지 않는다.
- 여러 문장을 한 번에 줄 수 있다 (예: `--query "set local role anon; select count(*) from public.chunks"` → 권한 확인용, 끝나면 역할은 자동으로 원래대로).

## load_to_supabase.py — 적재

- `.env`의 `SUPABASE_URL`, `SUPABASE_SECRET_KEY`로 Supabase API를 통해 넣는다.
- 순서: sources → people → chunks. 모두 `id` 기준 upsert라 다시 돌려도 중복이 생기지 않는다.
- `embedding`은 보내지 않는다 (`embed_chunks.py`가 채움). 끝나면 테이블별 개수와 조각 샘플 2개를 DB에서 다시 읽어 보여준다.

## embed_chunks.py — 임베딩 채우기

조각의 `embed_text`를 OpenAI `text-embedding-3-small`로 벡터(숫자 1536개)로 바꿔 `chunks.embedding`에 저장한다.

```bash
python embed_chunks.py --dry-run   # OpenAI 호출 없이 대상 개수·예상 비용만 (274개 ≈ $0.003)
python embed_chunks.py             # embedding이 비어 있거나 다른 모델로 만든 조각만 채움
python embed_chunks.py --all       # 전부 다시 만들기
```

- `SUPABASE_DB_URL`, `OPENAI_API_KEY`를 쓴다. 벡터를 다 받은 뒤 **한 트랜잭션**으로 저장해서, 중간에 실패하면 DB는 그대로다.
- 끝나면 개수를 다시 세고, 조각 하나의 벡터로 `match_chunks`를 불러 자기 자신이 1등(유사도 ≈ 1.0)으로 나오는지 확인한다.
- 모델은 `backend/app/rag/config.py`의 `embedding_model`과 **같아야 한다** (질문도 같은 모델로 벡터로 바꿔야 비교가 된다).
- ⚠️ `load_to_supabase.py`로 `embed_text`가 바뀐 조각을 다시 올려도 예전 벡터는 남는다.
  진로 요약·기관·질문·답변을 고쳤다면 `--all`로 다시 만든다. 태그만 고쳤다면 필요 없다 (태그는 `embed_text`에 들어가지 않음).

## load_mentors.py — 멘토 프로필 넣기 (메일 자동화)

`backend/app/data/mentors_demo.json`의 멘토 프로필을 Supabase `mentors` 테이블에 넣는다. 테이블은 `0002_mail_tables.sql`로 먼저 만든다.
설계: [apps-script/docs/SUPABASE_PLAN.md](../apps-script/docs/SUPABASE_PLAN.md)

```bash
python load_mentors.py --dry-run          # 무엇을 넣을지 보기만 (DB 변경 없음)
python load_mentors.py                    # 없는 멘토만 새로 넣기 (있는 멘토는 그대로)
python load_mentors.py --update-profiles  # (주의) 있는 멘토의 프로필도 JSON 으로 덮어쓰기
```

- 처음 넣는 멘토는 **메일 주소 없이, 연락 가능(available)=false**로 들어간다. 실제 메일 주소와 연락 가능은 Supabase 대시보드 Table Editor에서 직접 채운다 (메일 주소가 파일·git에 남지 않게).
- 기본으로는 **이미 있는 멘토를 건드리지 않는다.** 처음 넣은 뒤로는 Supabase(대시보드·관리자 페이지)가 기준이라, 대시보드에서 고친 이름·메일·연락 가능이 되돌아가지 않는다.
- `--update-profiles`는 있는 멘토의 프로필 칸(이름·연도·진로·요약·태그·주제·참여 동의)을 JSON으로 덮어쓴다. `email`·`available`·`person_id`는 그대로지만 **대시보드에서 고친 이름은 JSON 이름으로 돌아간다.**
- `SUPABASE_DB_URL`(run_sql.py와 같음)로 접속하고, 한 트랜잭션으로 실행한다. 메일 주소는 화면에 출력하지 않는다 (있음/없음만).

## eval_ask.py — 답변 품질 측정

검색 설정·지시문·검색 방법을 바꿀 때마다 돌려서 **전후를 숫자로 비교**한다. 왜 필요한지와 처음 측정한 결과는 [docs/proposals/answer-quality-audit.md](../docs/proposals/answer-quality-audit.md).

다른 스크립트와 달리 **backend 폴더에서, backend 가상환경으로** 실행한다 (`backend/.env`의 키를 쓴다).

```bash
cd backend   # backend 가상환경을 켠 상태에서

# 1) 검색만: 답변 모델을 부르지 않는다. 비용이 거의 없다
python ../scripts/eval_ask.py ../scripts/eval/questions.json ../scripts/eval/probes.json --retrieval-only
python ../scripts/eval_ask.py ../scripts/eval/questions.json ../scripts/eval/probes.json --retrieval-only --sweep      # 설정 조합 비교
python ../scripts/eval_ask.py ../scripts/eval/questions.json ../scripts/eval/probes.json --retrieval-only --no-intent  # 태그 우선 검색 없이

# 2) 의도 분류만: 작은 분류 모델만 부른다
python ../scripts/eval_ask.py --intent ../scripts/eval/intent_cases.json

# 3) 전체: ⚠️ 질문마다 답변 모델을 부른다. 실제 비용이 나간다 (--confirm-cost 가 없으면 실행되지 않는다)
python ../scripts/eval_ask.py ../scripts/eval/questions.json --confirm-cost
```

| 파일 | 내용 |
|---|---|
| `eval/questions.json` | 평가 질문 29개와 정답 글번호 (정답표는 초안, 데이터 담당 검수 중) |
| `eval/probes.json` | 확인용 질문 34개: 꾸로록이 권하는 질문, 창업 질문 9가지 표현, 경로·분야별 질문, 짧은 질문. `expected_tags`에 "이 태그가 있는 선배의 글이 나와야 한다"를 적는다 |
| `eval/intent_cases.json` | 의도 분류 시험 문장 69개와 기대하는 갈래·측면·태그 |

- 지표: **하나라도 전달**(정답 글 중 하나라도 답변 모델에게 전달된 질문 수), **전달률**(정답 글이 들어갈 자리 중 실제로 들어간 비율), **태그 일치율**(전달된 글 중 기대 태그가 있는 선배의 글의 비율).
- 질문 임베딩과 의도 분석 결과는 `data/eval/cache/`에 저장해 두고 다시 쓴다. 같은 질문을 여러 번 돌려도 유료 호출은 처음 한 번뿐이다 (분류 지시문을 고치면 의도 분석만 새로 부른다).
- 결과는 `data/eval/`에 저장된다 (git에 올라가지 않는다). 전체 모드는 답변 문장도 저장하니 밖에 올리지 않는다.
- **꾸로록이 권하는 질문을 바꿀 때는**(`backend/app/rag/intent.py`의 `Q_*`, `frontend/src/app/page.tsx`의 추천 질문) `probes.json`에도 넣고 검색만 측정으로 맞는 글이 전달되는지 확인한다.
- 분류 지시문(`intent.py`)을 고친 뒤에는 2)를 돌린다. 예시 하나를 더하면 옆 문장의 분류가 바뀌는 일이 실제로 있었다.
