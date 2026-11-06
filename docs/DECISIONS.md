# 결정 기록

중요한 결정을 내리면 한 줄씩 추가한다. 나중에 "이거 왜 이렇게 했지?"를 찾기 위한 기록이다.
최신 항목을 아래에 추가한다.

| 날짜 | 결정 | 이유 |
|---|---|---|
| 2026-11-06 | 기술 스택: frontend는 Next.js(App Router) + TypeScript + Tailwind CSS로 만들어 Vercel에 배포하고, backend는 Python + FastAPI로 만들어 Render에 배포한다 | 자료가 많고 무료로 배포할 수 있다. Python은 이후 RAG·데이터 작업과 언어가 같다 |
| 2026-11-06 | 스타일은 별도 CSS 파일 대신 Tailwind 클래스로 컴포넌트 안에 쓴다 | 파일 하나에서 구조와 모양을 함께 볼 수 있고, Next.js 예제 대부분이 이 방식이다 |
| 2026-11-06 | 나중에 붙일 것: Supabase(PostgreSQL + pgvector), OpenAI Embedding, Claude API. 지금은 자리만 둔다 | 실제 데이터가 아직 없다. 무료 플랜이 있고 RAG 구성이 단순하다 |
| 2026-11-06 | 실제 데이터를 받기 전까지 `/ask`는 demo 답변을 돌려준다. 응답 형식(answer, sources, has_enough_evidence)은 고정한다 | 프론트와 백엔드가 데이터 없이도 동시에 개발할 수 있다 |
| 2026-11-06 | 패키지 관리는 npm과 pip + venv만 쓴다 (yarn, poetry 등은 쓰지 않음) | 처음 개발하는 팀원도 추가 도구 없이 시작할 수 있다 |
| 2026-11-06 | 멘토 추천은 `/ask`에 넣지 않고 별도 API `POST /mentors/recommend`로 만든다. 지금은 키워드 매칭, 나중에 `services/mentors.recommend_mentors` 안쪽만 임베딩 방식으로 바꾼다 | `/ask` 응답 형식을 고정하기로 했다. 답변과 추천을 따로 개발·교체할 수 있고, 추천이 실패해도 답변은 보여줄 수 있다 |
| 2026-11-06 | 멘토 이메일은 어떤 API 응답에도 넣지 않는다 (응답 스키마 `Mentor`에 email 필드가 없음). 참여 동의가 false인 멘토는 모든 API에서 제외한다 | 학생은 꾸로록을 통해서만 첫 연락을 보내고, 졸업생의 연락처와 동의 범위를 보호한다 |
| 2026-11-06 | `POST /contact-requests`는 지금 실제 메일을 보내지 않고 서버 로그에만 남긴다. 나중에 `services/contact.deliver_contact_request`에 Resend 같은 무료 메일 서비스를 붙인다 | 실제 졸업생에게 메일이 가지 않게 하면서 화면 흐름을 먼저 검증한다 |
| 2026-11-06 | 채팅 대화 내역은 지금 화면 상태(state)에만 둔다. 나중에 `lib/useChat.ts`에서 localStorage 저장을 붙인다 | 서버 DB·로그인 없이 시작한다. 메시지 타입과 상태 관리를 한 곳에 모아 나중에 붙이기 쉽게 했다 |
| 2026-11-06 | 멘토 목록의 진로 탭·검색은 프론트에서 처리한다 (`GET /mentors`는 전체 목록만 준다) | 멘토가 수십 명 수준이라 이게 가장 단순하다. 많아지면 쿼리 파라미터로 옮긴다 |
