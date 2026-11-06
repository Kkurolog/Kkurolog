@AGENTS.md

# frontend (Next.js + TypeScript + Tailwind)

## 구조
```
frontend/src/
├─ app/
│  ├─ layout.tsx          # 모든 페이지 공통 틀 (html, body)
│  ├─ page.tsx            # 메인 화면 "/": 질문 → 답변·출처 표시
│  └─ globals.css         # 전체 공통 스타일 (Tailwind 불러오기)
├─ components/
│  ├─ QuestionForm.tsx    # 질문 입력창 + 버튼
│  ├─ AnswerView.tsx      # 답변 + 근거 부족 안내 + 출처 목록
│  └─ SourceCard.tsx      # 출처 카드 하나
└─ lib/
   └─ api.ts              # backend 호출 함수 + 응답 타입 (backend/app/schemas.py와 맞춤)
```
- 새 페이지는 `app/폴더명/page.tsx`로 만든다 (예: `app/mentors/page.tsx` → `/mentors`).
- 스타일은 `className`에 Tailwind 클래스로 쓴다.

## 실행
```bash
cd frontend
npm install
cp .env.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev                  # http://localhost:3000
```
- 검사: `npm run lint`, 배포 전 확인: `npm run build`
