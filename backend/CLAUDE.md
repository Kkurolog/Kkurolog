# backend (Python + FastAPI)

## 구조
```
backend/
├─ app/
│  ├─ main.py            # 앱 시작점: CORS 설정, 모든 라우트
│  ├─ schemas.py         # 요청/응답 형식 (Pydantic). 프론트 lib/api.ts 타입과 맞춘다
│  ├─ data/
│  │  └─ mentors_demo.json  # 가짜 멘토 10명 (이메일 포함 = 내부 전용, mt-10은 동의 안 함)
│  └─ services/
│     ├─ answer.py       # 답변 생성 로직. 지금은 demo, 나중에 실제 RAG로 교체할 곳
│     ├─ mentors.py      # 멘토 목록(동의한 멘토만) + 추천 recommend_mentors (나중에 임베딩으로 교체할 곳)
│     └─ contact.py      # 첫 연락 전달 deliver_contact_request (지금은 로그만, 나중에 Resend 등 연결)
├─ tests/                # pytest 테스트 (API마다 하나씩)
├─ pytest.ini            # pytest 설정
├─ requirements.txt      # Python 패키지 목록
└─ .env.example          # 환경변수 예시 (복사해서 .env로)
```

## API
| 주소 | 요청 | 응답 |
|---|---|---|
| `GET /health` | - | `{"status": "ok"}` |
| `POST /ask` | `{question}` | `{answer, sources[], has_enough_evidence}` (형식 고정) |
| `GET /mentors` | - | `Mentor[]` (동의한 멘토만. `email`, `consent` 필드 없음) |
| `POST /mentors/recommend` | `{question}` | `{recommendations: [{mentor, reason}], is_fallback}` 최대 3명, 연락 가능한 멘토만 |
| `POST /contact-requests` | `{mentor_id, sender_name, reply_email, subject, message}` | 201 `{status: "delivered", message}` / 404 없는 멘토 / 409 연락 불가 / 422 입력 오류 |

## 실행
```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload    # http://localhost:8000/docs
pytest                           # 테스트
```

## 규칙
- 응답 형식(`schemas.py`)을 바꾸면 `frontend/src/lib/api.ts`도 같이 바꾼다.
- 데모 데이터가 아닌 실제 인터뷰 원문이나 API 키는 코드에 넣지 않는다 (.env 사용).
- 멘토를 밖으로 내보낼 때는 항상 `services/mentors.py`의 함수를 거친다 (동의 필터 + 이메일 제거).
- 새 API를 만들면 `tests/`에 테스트를 하나 추가한다.
