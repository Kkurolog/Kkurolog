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
