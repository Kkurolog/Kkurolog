# 실제 RAG 켜기 안내 (Claude 연결 담당용)

> 2026-11-13 기준. 데이터 쪽 준비(조각 274개 적재, 임베딩 채우기, 검색 측정)는 끝났다.
> 남은 일은 **Claude 키를 연결해 실제 답변을 확인하고, 설정값을 정하는 것**이다.
> 구조 설명: [proposals/ask-plan.md](./proposals/ask-plan.md) · 코드: `backend/app/rag/`

## 지금 상태

| 항목 | 상태 |
|---|---|
| Supabase `sources`/`people`/`chunks` | 39 / 40 / 274개 적재됨 |
| `chunks.embedding` | 274개 모두 채움 (`text-embedding-3-small`, `scripts/embed_chunks.py`) |
| 검색 (`match_chunks`) | 동작 확인. 측정 결과는 아래 |
| Claude 답변 생성 | 코드는 있음 (`generator.py`). **실제 키로는 한 번도 안 돌려봄** |
| `/ask` | 기본은 demo 답변 (`RAG_ENABLED=false`) |

## 모델과 역할

| 역할 | 모델 | 필요한 키 |
|---|---|---|
| 질문 → 벡터 | OpenAI `text-embedding-3-small` (조각과 **같은 모델**이어야 함) | `OPENAI_API_KEY` |
| 비슷한 조각 찾기 | Supabase pgvector `match_chunks` | `SUPABASE_URL`, `SUPABASE_KEY` |
| 답변 쓰기 | Claude (기본 `claude-opus-5-5`, effort `medium`) | `ANTHROPIC_API_KEY` |

## 할 일 순서

### 1. Python 3.11 이상 확인
`supabase` 패키지(2.34 이상)는 Python 3.11 이상에서만 설치된다. `python --version`이 3.10이면
3.11 이상을 설치하고 `backend/.venv`를 다시 만든다 (README의 처음 설치 참고).

```bash
cd backend
pip install -r requirements-rag.txt
```

### 2. Anthropic 키 만들기
- console.anthropic.com → API Keys → 새 키 생성
- **Billing → 월 사용 한도(spend limit)를 꼭 설정한다.** 로그인 없이 누구나 `/ask`를 부를 수 있다
  (서버에도 하루 2000회 상한이 있지만 이중 안전장치)

### 3. `backend/.env` 채우기 (git에 올라가지 않음)
```bash
RAG_ENABLED=true
SUPABASE_URL=            # scripts/.env 와 같은 값
SUPABASE_KEY=            # scripts/.env 의 SUPABASE_SECRET_KEY 와 같은 값 (이름만 다름)
OPENAI_API_KEY=          # 데이터 담당에게 받기 (scripts/.env 와 같은 값)
ANTHROPIC_API_KEY=       # 2번에서 만든 키
```
키는 팀 채팅방에 그대로 붙여넣지 말고 1:1로 전달한다.

### 4. 실제 답변 확인
```bash
uvicorn app.main:app --reload    # → http://localhost:8000/docs 에서 /ask 실행, 또는 frontend 화면에서 질문
```
- 답변 아래 출처가 나오는지, 근거가 부족한 질문(예: "서울대 수시 내신 몇 등급?")에 지어내지 않는지 본다.
- 오류가 나면 학생에게는 "잠깐 문제가 생겼어요" 안내가 나가고, 원인은 **uvicorn 터미널 로그**에 찍힌다.

### 5. 전체 측정 (질문 29개 × Claude 1번씩 → 비용 발생)
```bash
python ../scripts/eval_ask.py ../scripts/eval/questions.json
```
`answer_type` 정확도, 출처 적중률이 나온다. 아래 "정할 것"을 바꿀 때마다 다시 돌려 숫자로 비교한다.

### 6. 정할 것 (팀 논의)
코드를 고치지 않고 `.env`에 넣어서 바꿀 수 있다 (`backend/app/rag/config.py`).

| 설정 | 지금 | 검토 이유 |
|---|---|---|
| `KKUROLOG_CLAUDE_MODEL` | `claude-opus-5-5` | 가장 비싼 등급. `claude-sonnet-5-5` 등과 품질·비용 비교. Haiku 5.5를 쓰면 `KKUROLOG_CLAUDE_USE_FALLBACKS=false`도 함께 |
| `KKUROLOG_SIMILARITY_FLOOR` | 0.3 | 아래 측정에서 정답 글이 0.22~0.28로 잘린 경우가 있다. 0.2 정도로 낮추고 Claude 판단에 맡기는 것을 제안 |
| `KKUROLOG_MAX_POSTS` / `KKUROLOG_TOP_K` | 3 / 8 | 정답 글이 4~6등인 질문이 있다. 5 / 15 정도를 비교해 볼 만하다 (근거가 길어져 비용 증가) |

위기 단어 목록과 안내 문구(`backend/app/services/answer.py`)는 아직 초안이라 **코치진 확인이 필요**하다.

### 7. Render 배포 (backend)
Render 대시보드 → 서비스 → Environment에 아래를 넣는다. **frontend(Vercel)에는 키를 절대 넣지 않는다** (학생 브라우저에 보인다).

| 이름 | 값 |
|---|---|
| `RAG_ENABLED` | `true` |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | 각 키 |
| `SUPABASE_URL`, `SUPABASE_KEY` | 3번과 같음 |
| `FRONTEND_ORIGINS` | Vercel 주소 |
| `TRUST_PROXY_HEADERS` | `true` (IP별 호출 제한이 제대로 동작하려면 필요) |
| `PYTHON_VERSION` | `3.11` 이상 (예: `3.12.8`) |

배포 후 로그에 학생 IP가 제대로 찍히는지 한 번 확인한다 (`TRUSTED_PROXY_COUNT`, 기본 1).

## 검색 측정 결과 (2026-11-13, Claude 호출 없음)

`python ../scripts/eval_ask.py ../scripts/eval/questions.json --retrieval-only`
질문 세트: `scripts/eval/questions.json` (답할 수 있는 질문 22개, 근거 부족 3개, 무관 2개, 위기 2개. 정답 글번호는 초안이라 데이터 담당이 검수 중)

| 지표 | 결과 |
|---|---|
| 정답 글이 검색 결과 8개 안에 있음 (하한 0.3 이상) | 17/22 |
| 정답 글이 Claude에게 넘어가는 상위 3개 글 안에 있음 | 15/22 |
| 근거 부족 질문의 1등 유사도 | 0.35~0.44 |
| 답할 수 있는 질문의 1등 유사도 | 0.27~0.56 |

- 근거 부족 질문과 답할 수 있는 질문의 유사도가 겹친다 → **유사도 하한으로는 둘을 가를 수 없고, 최종 판단은 Claude가 해야 한다** (원래 설계대로).
- 놓친 질문: 자퇴 경험(q05, 정답 글이 30위 안에 없음), 디자인 계기(q06, 0.28로 잘림), 자존감(q16, 0.22), 엑시트 시기(q17), 해외 의대(q18). q05는 정답 라벨 자체도 다시 확인한다.
