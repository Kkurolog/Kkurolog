"""
관리자 페이지 '인터뷰 넣기' (txt 업로드 → AI 초안 → 관리자 검토 → 공개).

| 파일          | 하는 일                                                                       |
| tags.py      | 쓸 수 있는 태그 (docs/TAGS.md 와 같아야 한다)                                     |
| models.py    | 초안(draft)·API 요청·응답 형식                                                   |
| text.py      | 원문 줄 번호, 말머리(Q:, 이름:) 떼기, 긴 답변 나누기, 개인정보 규칙                     |
| draft.py     | AI 결과 → 초안 만들기, 공개 전 검사, 공개할 데이터(sources·people·chunks) 만들기        |
| analyzer.py  | Claude 로 말한 사람·조각·태그·개인정보 의심 부분 초안 받기                              |
| store.py     | Supabase 읽기·쓰기 (import_files, people, publish_import 함수)                    |

models·text·draft 는 pydantic 만 쓴다 (FastAPI·httpx 없이 테스트할 수 있게).
API 주소는 app/admin/imports.py 에 있다.
"""
