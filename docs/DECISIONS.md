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
