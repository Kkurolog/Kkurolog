@AGENTS.md

# frontend (Next.js + TypeScript + Tailwind)

## 구조
```
frontend/src/
├─ app/
│  ├─ layout.tsx          # 모든 페이지 공통 틀 (html, body, 상단 내비게이션)
│  ├─ page.tsx            # "/": 채팅 화면 (질문 → 답변·출처·추천 멘토)
│  ├─ mentors/page.tsx    # "/mentors": 멘토 찾기 (진로 탭 + 검색은 프론트에서 처리)
│  └─ globals.css         # 전체 공통 스타일 (Tailwind 불러오기)
├─ components/
│  ├─ NavBar.tsx          # 상단 메뉴 (질문하기 / 멘토 찾기) + demo 데이터 안내
│  ├─ QuestionForm.tsx    # 질문 입력창 + 보내기 (Enter 보내기, Shift+Enter 줄바꿈)
│  ├─ ChatMessageView.tsx # 채팅 메시지 하나 (질문/답변 말풍선, 출처, 추천 멘토)
│  ├─ SourceCard.tsx      # 출처 카드 하나
│  ├─ MentorCard.tsx      # 멘토 카드 하나 (목록·채팅 추천 공용, compact 옵션)
│  └─ ContactModal.tsx    # 멘토에게 연락하기 팝업
└─ lib/
   ├─ api.ts              # backend 호출 함수 + 응답 타입 (backend/app/schemas.py와 맞춤)
   ├─ types.ts            # 채팅 메시지 타입 (ChatMessage)
   └─ useChat.ts          # 채팅 대화 상태를 관리하는 훅 (나중에 localStorage 저장을 붙일 곳)
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
