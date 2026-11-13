@AGENTS.md

# frontend (Next.js + TypeScript + Tailwind)

## 구조
```
frontend/src/
├─ app/
│  ├─ layout.tsx          # 모든 페이지 공통 틀 (왼쪽 사이드바 + 페이지 내용). ChatProvider로 대화 상태를 감싼다
│  ├─ page.tsx            # "/": 대화 전 인사 화면(캐릭터·스티커) → 대화 중 채팅 화면 + 오른쪽 출처 패널
│  ├─ mentors/page.tsx    # "/mentors": 멘토 찾아보기 (한 줄에 4명씩 카드)
│  └─ globals.css         # 전체 공통 스타일 + 디자인 토큰(색·글꼴, @theme) + paper-lines(노트 줄 바탕)
├─ components/
│  ├─ NavBar.tsx          # 사이드바: 닫힘(72px 아이콘 레일 + 툴팁) / 열림(280px 메뉴). 새 채팅 확인 창
│  ├─ Logo.tsx            # 꾸로록 로고 (노란 얼굴 + 눈)
│  ├─ QuestionForm.tsx    # 질문 입력창 + 보내기 (Enter 보내기, Shift+Enter 줄바꿈)
│  ├─ ChatMessageView.tsx # 채팅 메시지 하나 (질문 말풍선 / 답변 글 + 출처 링크 / 근거 부족 시 추천 멘토)
│  ├─ SourcePanel.tsx     # 출처 링크를 누르면 오른쪽에 열리는 인터뷰 출처 패널
│  ├─ MentorCard.tsx      # 멘토 카드 하나 (사진 자리·이름·메일 버튼·소개·키워드)
│  ├─ ContactModal.tsx    # 멘토에게 메일 쓰기 창 (작성 → 전송 중 → 완료, 닫기 확인)
│  ├─ ConfirmDialog.tsx   # 확인 창 ("새 채팅을 시작할까요?", "작성을 그만둘까요?")
│  └─ icons.tsx           # 선 아이콘 모음 (이모지 대신 사용)
└─ lib/
   ├─ api.ts              # backend 호출 함수 + 응답 타입 (backend/app/schemas.py와 맞춤)
   ├─ types.ts            # 채팅 메시지 타입 (ChatMessage)
   └─ useChat.ts          # 대화 상태 (ChatProvider + useChat 훅). 자기소개 질문은 온보딩 답변으로 바로 답한다
```
- 새 페이지는 `app/폴더명/page.tsx`로 만든다 (예: `app/mentors/page.tsx` → `/mentors`).
- 스타일은 `className`에 Tailwind 클래스로 쓴다.
- 색은 `globals.css`의 `@theme`에 정한 이름을 쓴다 (A안 "종이 위 블루 라인"):
  `brand`(블루: 선·제목·버튼), `accent`(옐로: 큰 도형·스티커 하이라이트, 글자색 금지), `butter`(키워드 pill),
  `sky`(hover·선택·질문 말풍선), `canvas`(크림 바탕), `surface`(흰색 입력창), `line`, `ink`/`body`/`muted`/`placeholder`(글자),
  `danger`(토마토: 오류 1곳에만). `gray-500`, `indigo-600` 같은 Tailwind 기본 색을 직접 쓰지 않는다. 색을 바꿀 땐 `@theme`만 고친다.
- 큰 제목은 `font-display`(Jua), 나머지는 기본 `font-sans`(Noto Sans KR).
- 움직임은 `globals.css`의 `--animate-*`에 정해 두고 `motion-safe:animate-이름`으로 쓴다 (예: `motion-safe:animate-pop-in`). `motion-safe:`를 붙이면 '동작 줄이기'를 켠 사람에게는 움직이지 않는다.
- 넓은 화면 기준은 `lg`(1024px). 그보다 좁으면 열린 사이드바·출처 패널이 화면 위에 겹쳐 뜨고, 메인 화면의 스티커는 숨겨진다.

## 실행
```bash
cd frontend
npm install
cp .env.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev                  # http://localhost:3000
```
- 검사: `npm run lint`, 배포 전 확인: `npm run build`
