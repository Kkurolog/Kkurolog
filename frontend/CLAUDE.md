@AGENTS.md

# frontend (Next.js + TypeScript + Tailwind)

## 구조
```
frontend/src/
├─ app/
│  ├─ layout.tsx          # 모든 페이지 공통 틀 (html·body·글꼴·배경색만)
│  ├─ (student)/          # 학생 화면 묶음 (괄호 폴더는 주소에 나오지 않는다)
│  │  ├─ layout.tsx       # 왼쪽 사이드바(NavBar) + 페이지 내용. ChatProvider로 대화 상태를 감싼다
│  │  ├─ page.tsx         # "/": 대화 전 인사 화면(캐릭터·스티커) → 대화 중 채팅 화면 + 오른쪽 출처 패널
│  │  └─ mentors/page.tsx # "/mentors": 멘토 찾아보기 (한 줄에 4명씩 카드)
│  ├─ not-found.tsx       # 없는 주소일 때 (거꾸로 매달린 꾸로록)
│  ├─ admin/              # 관리자 화면 (noindex, 학생 화면에서 링크하지 않음). 로그인 전엔 어느 주소든 로그인 창
│  │  ├─ layout.tsx       # noindex + AdminShell(로그인 확인·관리자 사이드바)
│  │  ├─ page.tsx         # "/admin" → "/admin/inquiries" 로 보냄
│  │  ├─ inquiries/       # 문의 목록(숫자 카드·필터·표·쪽 번호·오른쪽 상세 패널), [id]/ 는 상세 전체 화면
│  │  ├─ review/          # 확인필요 목록 (자동 전달 못 한 멘토 답장)
│  │  ├─ mentors/         # 멘토 목록 + 추가·수정 창 (지우기 없음)
│  │  └─ settings/        # 메일 설정 (탭 6개)
│  └─ globals.css         # 전체 공통 스타일 + 디자인 토큰(색·글꼴, @theme) + paper-lines(노트 줄 바탕)
├─ components/
│  ├─ NavBar.tsx          # 사이드바: 닫힘(72px 아이콘 레일 + 툴팁) / 열림(280px 메뉴 + 최근 대화 기록, 대화 지우기)
│  ├─ Logo.tsx            # 꾸로록 로고 (노란 얼굴 + 눈)
│  ├─ Kkuro.tsx           # 꾸로록 캐릭터 '빼꼼 꾸로록' 눈·작은 돔. 표정: 기본/듣는 중/생각 중/찾았다!/거꾸로
│  ├─ QuestionForm.tsx    # 질문 입력창 + 보내기 (Enter 보내기, Shift+Enter 줄바꿈)
│  ├─ ChatMessageView.tsx # 채팅 메시지 하나 (질문 말풍선 / 답변 글 + 출처 링크 / 근거 부족 시 추천 멘토)
│  ├─ GuidePage.tsx       # 메인 화면 오른쪽 아래 접힌 귀퉁이 → 넘기면 나오는 사용 가이드
│  ├─ SourcePanel.tsx     # 출처 링크를 누르면 오른쪽에 열리는 인터뷰 출처 패널
│  ├─ MentorCard.tsx      # 멘토 카드 하나 (아바타·이름·메일 버튼·소개·키워드)
│  ├─ ContactModal.tsx    # 멘토에게 메일 쓰기 창 (작성 → 전송 중 → 완료, 닫기 확인)
│  ├─ ConfirmDialog.tsx   # 확인 창 ("새 채팅을 시작할까요?", "작성을 그만둘까요?")
│  ├─ icons.tsx           # 선 아이콘 모음 (이모지 대신 사용)
│  └─ admin/              # 관리자 화면 조각: AdminShell(틀·사이드바), AdminLogin, InquiryDetailView, MentorFormModal, ui(표·pill·쪽 번호)
└─ lib/
   ├─ api.ts              # backend 호출 함수 + 응답 타입 (backend/app/schemas.py와 맞춤)
   ├─ adminApi.ts         # 관리자 API 호출 + 타입 (backend/app/admin/models.py와 맞춤). token 은 sessionStorage, 401 이면 로그아웃
   ├─ avatar.ts           # 선배 아바타 번호(avatar-1~7) → 그림 주소 (public/avatars/avatar-01~07.svg)
   ├─ types.ts            # 채팅 메시지 타입 (ChatMessage)
   └─ useChat.ts          # 대화 상태 (ChatProvider + useChat 훅). 대화 기록은 이 브라우저 localStorage 에만 저장(최대 30개). 자기소개·인사는 온보딩 답변
```
- 새 학생 페이지는 `app/(student)/폴더명/page.tsx`로 만든다 (예: `app/(student)/mentors/page.tsx` → `/mentors`). 관리자 페이지는 `app/admin/` 아래.
- `next.config`의 `cacheComponents`가 켜져 있다. 주소를 읽는 훅(`usePathname`·`useSearchParams`·`useParams`)을 쓰는 클라이언트 컴포넌트는 `<Suspense>`로 감싼다. 안 감싸면 `npm run build`가 멈춘다 (특히 `[id]` 같은 동적 주소).
- 스타일은 `className`에 Tailwind 클래스로 쓴다.
- 색은 `globals.css`의 `@theme`에 정한 이름을 쓴다 (A안 "종이 위 블루 라인"):
  `brand`(블루: 선·제목·버튼), `accent`(옐로: 큰 도형·스티커 하이라이트, 글자색 금지), `butter`(키워드 pill),
  `sky`(hover·선택·질문 말풍선), `canvas`(크림 바탕), `surface`(흰색 입력창), `line`, `ink`/`body`/`muted`/`placeholder`(글자),
  `danger`(토마토: 오류 표시와 지우기 버튼에만, 한 화면에 한 곳). `gray-500`, `indigo-600` 같은 Tailwind 기본 색을 직접 쓰지 않는다. 색을 바꿀 땐 `@theme`만 고친다.
- 큰 제목은 `font-display`(Jua), 나머지는 기본 `font-sans`(Noto Sans KR).
- 움직임은 `globals.css`의 `--animate-*`에 정해 두고 `motion-safe:animate-이름`으로 쓴다 (예: `motion-safe:animate-pop-in`). `motion-safe:`를 붙이면 '동작 줄이기'를 켠 사람에게는 움직이지 않는다.
- 넓은 화면 기준은 `lg`(1024px). 그보다 좁으면 열린 사이드바·출처 패널이 화면 위에 겹쳐 뜨고, 메인 화면의 스티커는 숨겨진다.
- 휴대폰 기준은 `sm`(640px) 미만. 왼쪽 레일 대신 위쪽 막대(메뉴·로고·새 채팅), 출처 패널·메일 창은 아래에서 올라오는 시트, 멘토는 한 줄에 2명.
  - 손가락으로 누르는 버튼은 최소 44px(`size-11`). 아이폰 노치·홈 막대는 `env(safe-area-inset-*)` 여백으로 피한다.
  - CSS 만으로 못 바꾸는 것(입력창 안내 문구 등)은 `lib/useMediaQuery.ts`, 키보드가 올라왔는지는 `lib/useKeyboardOpen.ts`로 확인한다.

## 관리자 화면 규칙
- 비밀번호는 코드·`.env`·Vercel 환경변수(특히 `NEXT_PUBLIC_`)에 넣지 않는다. 화면에서 입력받아 `POST /admin/login` 으로 보내기만 한다.
- token 은 `sessionStorage` 에만 두고 요청마다 `Authorization: Bearer` 로 보낸다. 401 이면 token 을 지우고 로그인 창('다시 로그인해 주세요.')으로.
- 학생(미성년자) 이름·메일은 필요한 곳에만 보여주고 `console.log` 로 찍지 않는다.
- 학생용 사이드바(NavBar)는 `/admin` 에서 스스로 숨는다. 학생 화면에 `/admin` 링크를 두지 않는다.
- 진짜 보안은 backend(`require_admin`)가 지킨다. 화면에서 막는 건 보여주기만이다.

## 실행
```bash
cd frontend
npm install
cp .env.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev                  # http://localhost:3000
```
- 검사: `npm run lint`, 배포 전 확인: `npm run build`
