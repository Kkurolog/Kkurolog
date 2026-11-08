# scripts

인터뷰 데이터를 수집·정제(개인정보 제거, chunking)하고 DB에 적재하는 스크립트를 두는 곳. 흐름은 [docs/DATA.md](../docs/DATA.md) 참고.

- 코드는 여기(`scripts/`)에, **수집한 데이터는 `data/`에** 저장한다.
- `data/` 폴더는 통째로 `.gitignore`에 들어 있어 GitHub에 올라가지 않는다. 졸업생 실명과 인터뷰 전문이 들어 있으니 다른 곳에 업로드하지 않는다. (학교 사용 허락 전)
- Python 환경은 backend와 따로 쓴다 (`scripts/.venv`).

## 처음 설치 (한 번만)

```bash
cd scripts
python -m venv .venv

# 가상환경 켜기
source .venv/bin/activate        # macOS / Linux
.venv\Scripts\activate           # Windows (PowerShell, cmd)
source .venv/Scripts/activate    # Windows (Git Bash)

pip install -r requirements.txt
```

## collect_gschool.py — "Exit 오깔" 졸업생 인터뷰 수집

gschool.kr 에세이 게시판에서 라벨이 "Exit 오깔"인 글만 골라 본문을 저장한다.

```bash
cd scripts   # 가상환경을 켠 상태에서
python collect_gschool.py --max-pages 2   # 테스트: 목록 2페이지만
python collect_gschool.py                 # 전체 수집
```

- 결과: `data/raw/gschool_exit_okkal.json` (글마다 `idx, url, title, date, interviewee, nickname, body, collected_at`)
- `body`는 문단마다 줄바꿈되어 있고, 인터뷰 **질문 줄은 앞에 `Q: `** 가 붙어 있다 (원문에서 굵은 글씨인 문단).
  - 2022년 초기 글은 질문이 굵은 글씨가 아니라 `메디 : ...`처럼 말하는 사람 이름으로 구분되어 있다.
- 제목에서 이름·별명을 못 뽑으면 빈 값으로 두고 경고를 출력한다.
- 예의 있게 수집: 요청 사이 1.5초 대기, User-Agent `kkurolog-student-project`, 실패하면 1번만 다시 시도.
- 사이트는 마지막 페이지(2026-11 기준 24페이지)를 넘으면 마지막 페이지를 반복해서 보여주므로, **새 글이 없는 페이지에서 멈춘다**.
- 전체 수집은 요청이 70번쯤이라 2~3분 걸린다. (2026-11 기준 Exit 오깔 글 44개, 2022-03 ~ 2025-01)
