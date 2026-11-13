# 데이터 구조

> 실제 데이터를 받아 보면서 계속 고친다. 태그 값의 기준은 [TAGS.md](./TAGS.md)다.
> 인터뷰 원문과 개인정보는 **절대 git에 올리지 않는다** (`data/` 폴더 전체가 .gitignore에 포함됨).

## 1. Experience DB (Supabase)

테이블 정의: [`supabase/migrations/0001_experience_tables.sql`](../supabase/migrations/0001_experience_tables.sql).
현재 데이터: gschool.kr "Exit 오깔" 졸업생 인터뷰·에세이 39개 글 → 인물 40명 → 조각 274개 (2026-11-09 적재, 임베딩 전).

```
sources (글) 1 ──< chunks (조각) >── 1 people (인물)
```

### sources: 글 단위 (원문 출처)
| 칸 | 설명 | 예 |
|---|---|---|
| `id` | 글번호 | `134676010` |
| `title`, `url` | 원문 제목과 주소 (출처 표시용) | |
| `published_at` | 게시일 | `2024-12-18` |
| `source_type` | 자료 종류 | `졸업생 인터뷰` / `졸업생 에세이` |
| `site` | 출처 사이트 | `gschool.kr` |
| `visibility` | 공개 등급 (아래 2장) | `L1` |

### people: 인물 단위
| 칸 | 설명 | 예 |
|---|---|---|
| `id` | 별명 기반 ID | `p-chashu` |
| `nickname` | 별명 (화면·검색 결과에는 이것만 쓴다) | `차슈` |
| `real_name` | 실명. DB에만 두고 **검색 결과·화면에 내보내지 않는다** | |
| `speaker_type` | 누가 한 말인가 | `alumni` |
| `path_summary` | 진로 경로를 순서대로 한 줄 | `거캠 엑시트 → 특성화고 재입학 → 졸업 앞두고 취업` |
| `career_paths` / `path_detail` | 경로 태그 / 기타·보충 설명 | `["etc","employment"]` / `["특성화고 재입학"]` |
| `career_fields` / `field_detail` | 분야 태그 / 구체적인 전공 등 | `["humanities_social"]` / `["사회학"]` |
| `organizations` | 학교·기관 이름 (태그 아님) | `["MTA LEINN"]` |
| `as_of_date` | 진로 정보 기준일 = 인터뷰 게시일 | `2024-12-18` |
| `is_mentor` | 멘토로 연결 가능 여부 (지금은 전부 false) | `false` |
| `source_ids` | 나온 글 | `["134676010"]` |

### chunks: 조각 단위 (검색 대상)
| 칸 | 설명 |
|---|---|
| `id` | `{글번호}-{순서 두 자리}` (예: `134676010-03`) |
| `source_id`, `person_id` | 글·인물 외래키 |
| `chunk_index` | 글 안에서의 순서 (1부터) |
| `question` | 인터뷰 질문 (에세이는 빈 값) |
| `content` | 답변 원문 |
| `embed_text` | 임베딩에 넣을 글: `[별명 \| 진로 경로 요약 \| 기관: … \| 질문: …]` + 줄바꿈 + 답변. 실명 없음. 기관·질문이 없으면 그 부분은 뺌 |
| `topics` / `topic_detail` | 주제 태그 1~2개 / 기타일 때 상세 |
| `career_paths`, `career_fields` | 인물 태그를 복사 (필터 검색용) |
| `speaker_type`, `visibility`, `char_count` | |
| `embedding` | `vector(1536)`, `embed_chunks.py`로 채움 |
| `embedding_model` | 예: `text-embedding-3-small` |

### 검색 함수 `match_chunks`
- 입력: 질문 임베딩, 개수(`match_count`, 최대 50), 선택 필터(`filter_career_paths`, `filter_career_fields`, `filter_topics` — 하나라도 겹치면 통과)
- 출력: 조각 + 출처(`title`, `url`, `published_at`) + 별명·경로 요약 + 유사도(`similarity`)
- visibility가 L1~L3인 조각·글만 나온다 (L0은 절대 안 나옴). 실명은 내보내지 않는다.

### 보안
- 세 테이블 모두 RLS를 켰고 정책은 없다 → anon·authenticated는 읽기·쓰기 불가.
- service_role(백엔드·스크립트)에게만 권한을 명시적으로 준다. `match_chunks` 실행 권한도 service_role만.

## 2. 공개 등급

| 등급 | 의미 | 답변 근거로 사용 | 원문 구간 노출 | 실명·멘토 연결 |
|---|---|---|---|---|
| **L0** | 사용 불가 | ✗ | ✗ | ✗ |
| **L1** | 익명으로 답변 근거만 | ○ | ✗ | ✗ |
| **L2** | 익명 원문 구간 노출 | ○ | ○ (익명) | ✗ |
| **L3** | 실명·멘토 프로필 연결 | ○ | ○ | ○ |

- 등급은 인터뷰 대상자의 동의 범위에 따라 정한다. 확실하지 않으면 더 낮은 등급으로 둔다.
- gschool.kr 데이터는 학교 사용 허락 전이라 전부 **L1**이다.

## 3. Mentor/Profile DB: 멘토 프로필

**참여에 동의한 졸업생만** 저장하고 노출한다.

| 필드 | 설명 |
|---|---|
| 이름 또는 별명 | 공개할 이름 |
| 엑시트 연도 | 졸업 연도 |
| 진로 경로 | 진학 / 취업 / 창업 / 기타 (여러 개 가능) |
| 주요 경험 태그 | 예: `해외 대학`, `디자인`, `창업 후 진학` |
| 답변 가능 주제 | 예: 포트폴리오, 갭이어, 해외 지원 |
| 멘토 참여 동의 | 예/아니오 (아니오면 노출하지 않음) |
| 연락 가능 여부 | 지금 연락을 받을 수 있는지 |

- 연락처(이메일)는 학생에게 직접 보여주지 않는다. 꾸로록이 첫 연락을 전달한다.
- demo 데이터(`backend/app/data/mentors_demo.json`)의 필드 이름: `id`, `name`, `exit_year`, `career_paths`,
  `path_summary`(경로 한 줄 요약), `summary`(경험 요약), `tags`, `topics`, `consent`, `available`, `email`(내부 전용).
  `career_paths` 값은 지금 `대학 진학 / 해외 대학 / 취업 / 창업 / 디자인·예술 / 개발 / 기타 경로` 중에서 고른다 (멘토 찾기 탭과 같음).
  → TAGS.md code로 바꾸고 경로·분야를 나누는 일은 DECISIONS.md "나중에 할 일"에 있다.

## 4. 최소 사실 데이터
기본 진로 경로, 인터뷰 시점, 주요 프로젝트, 출처 정보. 정량 정보는 핵심이 아니므로 최소한으로만 둔다.

## 5. 처리 흐름 (`scripts/`, 자세한 실행법은 scripts/README.md)

| 단계 | 스크립트 | 결과 |
|---|---|---|
| 1. 수집 | `collect_gschool.py` | `data/raw/gschool_exit_okkal.json` |
| 2. 조각 나누기 | `chunk_gschool.py` (규칙 기반, 같은 입력 → 같은 결과) | `data/processed/base/` |
| 3. 태깅 | 사람이 TAGS.md 기준으로 작성 | `data/processed/tags/batch_*.json` |
| 4. 합치기·검수 CSV | `build_dataset.py` | `data/processed/{sources,people,chunks}.json`, `review_*.csv` |
| 5. 태그 검사 | `check_tags.py` | 문제 목록, 승격 후보 |
| 6. 테이블 만들기 | `run_sql.py` + `supabase/migrations/*.sql` | Supabase 테이블·함수 |
| 7. 적재 | `load_to_supabase.py` (id 기준 upsert) | Supabase 데이터 |
| 8. 임베딩 | `embed_chunks.py` (OpenAI `text-embedding-3-small`, 비어 있는 조각만) | `chunks.embedding`, `chunks.embedding_model` |
