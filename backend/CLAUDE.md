# backend (Python + FastAPI)

## 구조
```
backend/
├─ app/
│  ├─ main.py            # 앱 시작점: CORS 설정, /health, /ask 라우트
│  ├─ schemas.py         # 요청/응답 형식 (Pydantic). 프론트 lib/api.ts 타입과 맞춘다
│  └─ services/
│     └─ answer.py       # 답변 생성 로직. 지금은 demo, 나중에 실제 RAG로 교체할 곳
├─ requirements.txt      # Python 패키지 목록
└─ .env.example          # 환경변수 예시 (복사해서 .env로)
```

## 실행
```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload    # http://localhost:8000/docs
```

## 규칙
- 응답 형식(`schemas.py`)을 바꾸면 `frontend/src/lib/api.ts`도 같이 바꾼다.
- 데모 데이터가 아닌 실제 인터뷰 원문이나 API 키는 코드에 넣지 않는다 (.env 사용).
