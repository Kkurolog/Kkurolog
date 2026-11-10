# 팀 작업 가이드 (브랜치 → PR → 리뷰 → merge)

꾸로록 저장소의 `main` 브랜치는 **보호**되어 있다. 아무도 `main`에 바로 올릴 수 없고,
모든 변경은 **브랜치 → PR(Pull Request) → 팀원 승인 → merge** 순서로만 들어간다.
처음 개발하는 사람도 이 문서를 위에서부터 따라 하면 된다.

> **용어 먼저**
> - **브랜치(branch)**: `main`을 복사해 만든 내 작업 공간. 여기서 마음껏 고쳐도 `main`은 그대로다.
> - **커밋(commit)**: 지금까지 고친 내용을 하나의 기록으로 저장하는 것.
> - **push**: 내 컴퓨터의 커밋을 GitHub에 올리는 것.
> - **PR(Pull Request)**: "내 브랜치의 변경을 `main`에 합쳐 주세요"라는 요청. 팀원이 여기서 변경을 보고 댓글·승인을 한다.
> - **merge**: 브랜치의 변경을 `main`에 실제로 합치는 것.

## 저장소 규칙 요약 (GitHub에 설정됨)

| 규칙 | 뜻 |
|---|---|
| `main` 직접 push 금지 | 브랜치를 만들어 PR로만 올린다. 관리자도 예외 없음 |
| 승인(Approve) 1개 필요 | 다른 팀원 1명이 PR을 승인해야 merge할 수 있다. **내 PR은 내가 승인할 수 없다** |
| 새 커밋 → 승인 취소 | 승인받은 뒤 새 커밋을 올리면 승인이 사라지고 다시 받아야 한다 |
| 댓글 모두 해결 | 리뷰 댓글이 전부 "Resolve conversation" 처리돼야 merge할 수 있다 |
| Squash and merge만 사용 | PR의 커밋 여러 개가 `main`에는 커밋 1개로 합쳐져 들어간다 |
| `main` 삭제·force push 금지 | `main`의 기록을 지우거나 덮어쓸 수 없다 |
| 예외 | 저장소 관리자만 **급할 때** 승인 없이 PR을 merge할 수 있다 (직접 push는 관리자도 불가) |

지금은 영역별 담당자(CODEOWNERS)가 없어서 **팀원 누구의 승인이든** 인정된다.

---

## 1. 작업 시작: main 최신으로 받고 브랜치 만들기

```bash
git switch main          # main으로 이동
git pull                 # GitHub의 최신 main을 받아오기
git switch -c feat/mentor-search-tab   # 새 브랜치를 만들고 그 브랜치로 이동
```

**브랜치 이름 규칙**: `종류/짧은-설명` (영어 소문자, 단어 사이는 `-`)

| 종류 | 언제 | 예시 |
|---|---|---|
| `feat/` | 새 기능 | `feat/mentor-search-tab` |
| `fix/` | 버그 고치기 | `fix/ask-empty-answer` |
| `docs/` | 문서만 바꿈 | `docs/github-workflow` |
| `chore/` | 설정·패키지 정리 등 | `chore/update-requirements` |

GitHub 이슈가 있으면 번호를 넣는다: `feat/12-mentor-search-tab`

> Claude Code에게 맡길 때: "main 최신으로 받고 `feat/…` 브랜치 만들어서 시작해줘"

## 2. 작업 후 커밋하고 push하기

```bash
git add .                               # 바뀐 파일을 커밋에 담기
git commit -m "feat: 멘토 찾기에 분야 탭 추가"   # 커밋 만들기
git push -u origin feat/mentor-search-tab      # GitHub에 올리기 (처음 한 번만 -u, 다음부턴 git push)
```

> ⚠️ **push는 "GitHub에 올리기만 한 상태"다. 아직 `main`에 합쳐지지 않았다.**
> 다른 팀원의 화면이나 배포에는 아직 아무 변화가 없다. 다음 단계(PR)를 꼭 해야 한다.

## 3. PR 만들기 (GitHub 화면 기준)

1. GitHub 저장소 페이지로 간다. 방금 push했다면 위쪽에 노란 띠와 **[Compare & pull request]** 버튼이 보인다. 누른다.
   - 노란 띠가 없으면: **Pull requests** 탭 → **New pull request**
2. 위쪽 두 칸을 확인한다: **base: `main`** ← **compare: `내 브랜치`**
3. **제목**을 쓴다. 예: `feat: 멘토 찾기에 분야 탭 추가` (merge되면 이 제목이 main의 커밋 제목이 된다)
4. **설명**칸에는 PR 양식(`.github/pull_request_template.md`)이 자동으로 채워져 있다. 각 칸을 채우고 체크리스트에 `[x]` 표시한다.
5. 오른쪽 **Reviewers**에서 리뷰해 줄 팀원을 지정한다.
6. **Create pull request**를 누른다.

> 💡 **웹 Claude Code**(claude.ai/code)에서는 "PR 만들어줘"라고 하면 Claude가 직접 PR을 만들어 준다.
> 이때도 Reviewers 지정은 GitHub 화면에서 한 번 확인하자.

## 4. 리뷰 받기

1. 리뷰어가 남긴 댓글을 PR의 **Files changed** / **Conversation** 탭에서 확인한다.
2. 고칠 게 있으면 **같은 브랜치에서** 고치고 커밋 → `git push` 한다.
   **PR에 자동으로 반영된다. 새 PR을 만들지 않는다.**
3. 고친 댓글은 **Resolve conversation**을 눌러 해결 처리한다 (모두 해결돼야 merge 가능).
4. ⚠️ **이미 승인받은 뒤에 새 커밋을 올리면 승인이 취소된다.** 리뷰어에게 다시 승인을 요청한다
   (PR 오른쪽 Reviewers 옆 🔄 버튼 또는 댓글로 요청).

## 5. merge하기

1. **승인 1개 이상 + 댓글 모두 해결**이면 초록색 **Squash and merge** 버튼이 켜진다. 누른다.
2. 커밋 메시지를 확인하고 **Confirm squash and merge**. (함께 작업한 사람이 있으면 → [7번](#7-커밋에-내-이름-남기기) 참고)
3. **Delete branch** 버튼을 눌러 GitHub의 브랜치를 지운다 (다 쓴 브랜치는 정리).
4. 내 컴퓨터에서 main으로 돌아가 최신을 받는다.

```bash
git switch main
git pull
git branch -D feat/mentor-search-tab   # (선택) 다 쓴 로컬 브랜치 지우기
```

> Squash and merge는 커밋을 새로 만들어 합치기 때문에, `git branch -d`(소문자)는 "아직 안 합쳐졌다"고 거절할 수 있다.
> merge가 끝난 브랜치라면 `-D`(대문자)로 지워도 된다.

## 6. 리뷰어가 할 일

리뷰 요청을 받으면 PR의 **Files changed**를 보고 아래를 확인한다.

- [ ] **동작 확인**: PR 설명의 "확인하는 방법"대로 직접 눌러 봤다 (필요하면 그 브랜치를 받아서 실행: `git fetch` → `git switch 브랜치이름`)
- [ ] **비밀 정보 없음**: API 키, 비밀번호, `.env` 파일 내용이 커밋에 없다
- [ ] **개인정보 없음**: 졸업생 실명, 인터뷰 원문, 이메일·전화번호가 커밋에 없다 (`data/` 폴더 파일이 올라오면 안 된다)
- [ ] **CLAUDE.md 규칙**: 멘토 이메일이 API 응답에 없다, 동의(`consent`) 안 한 멘토가 노출되지 않는다, 태그는 `docs/TAGS.md`에 있는 것만 쓴다
- [ ] **형식 일치**: API 요청·응답 형식을 바꿨다면 `backend/app/schemas.py`와 `frontend/src/lib/api.ts`가 함께 바뀌었다
- [ ] **테스트**: backend를 바꿨다면 `pytest`, frontend를 바꿨다면 `npm run lint && npm run build`가 통과한다
- [ ] **문서**: 중요한 결정이 있으면 `docs/DECISIONS.md`에 적혔다

문제가 없으면 **Review changes → Approve → Submit review**.
고칠 게 있으면 해당 줄에 댓글을 남기고 **Request changes** (또는 그냥 Comment).

## 7. 커밋에 내 이름 남기기

커밋에 내 GitHub 계정이 연결돼야 "누가 무엇을 했는지"가 기록에 남는다. 작업 환경에 따라 방법이 다르다.

### 방법 A: 내 컴퓨터(로컬)에서 Claude Code를 쓸 때

터미널에서 **한 번만** 설정하면 이후 모든 커밋에 내 이름이 들어간다.

```bash
git config --global user.name "내 GitHub 이름"
git config --global user.email "내 이메일"
git config --global user.email     # 확인: 방금 넣은 이메일이 나오면 성공
```

- 이메일은 **GitHub 계정에 등록된 이메일**이어야 내 계정으로 연결된다.
- 이메일을 공개하기 싫으면 GitHub **Settings → Emails**에 나오는 noreply 주소(`숫자+아이디@users.noreply.github.com`)를 쓴다.

### 방법 B: 웹 Claude Code(claude.ai/code)를 쓸 때

웹에서는 커밋 작성자가 내 이름으로 기록되지 않을 수 있다. 그래서 커밋 메시지 맨 끝에 아래 줄을 넣는다.

```
Co-authored-by: 내 GitHub 이름 <내 이메일>
```

작업을 시작할 때 Claude에게 이렇게 말해 두면 된다.

> "이번 작업의 모든 커밋 메시지 끝에 `Co-authored-by: 홍길동 <12345678+gildong@users.noreply.github.com>` 줄을 넣어줘."

### 이미 이름 없이 올라간 커밋이 있다면

PR을 merge할 때 고칠 수 있다. **Squash and merge**를 누르면 나오는 커밋 메시지 칸의 **맨 아래**에 한 줄 띄우고
`Co-authored-by: 이름 <이메일>` 줄을 추가한 뒤 Confirm 한다. 여러 명이면 한 줄씩 여러 번 쓴다.

## 8. 자주 막히는 상황 Q&A

**Q. `main`에 push했더니 거절됐어요 (`protected branch`, `GH013` 같은 메시지)**
A. 정상이다. `main`은 직접 push가 막혀 있다. 지금 커밋을 브랜치로 옮겨서 올리면 된다.
```bash
git switch -c feat/내-작업-이름     # 지금 상태 그대로 새 브랜치 만들기
git push -u origin feat/내-작업-이름
```
그다음 내 컴퓨터의 main을 GitHub와 같게 되돌린다: `git switch main` → `git reset --hard origin/main`
(⚠️ 새 브랜치를 만든 **뒤에** 해야 작업이 사라지지 않는다. 헷갈리면 Claude Code에 "main에 커밋해 버렸어. 브랜치로 옮겨줘"라고 요청한다.)

**Q. merge 버튼이 회색이에요 / "Review required"라고 나와요**
A. 다른 팀원의 승인이 아직 없다. Reviewers에 팀원을 지정하고 승인을 요청한다. 내 PR은 내가 승인할 수 없다.

**Q. 승인받았는데 다시 승인이 필요하다고 나와요**
A. 승인 뒤에 새 커밋을 올려서 승인이 취소된 것이다. 리뷰어에게 다시 승인을 요청한다.

**Q. "Unresolved conversations" 때문에 merge가 안 돼요**
A. 리뷰 댓글 중 해결 처리 안 된 것이 있다. Conversation 탭에서 각 댓글의 **Resolve conversation**을 누른다.

**Q. "This branch has conflicts" (충돌) 표시가 나와요**
A. 내가 작업하는 동안 다른 사람이 `main`의 같은 부분을 고친 것이다. 내 브랜치에 최신 main을 받아와서 합친다.
```bash
git switch 내-브랜치
git fetch origin
git merge origin/main      # 충돌 난 파일이 표시된다 → 파일을 열어 <<<<<<< ======= >>>>>>> 부분을 정리
git add .
git commit                 # 합친 결과 저장
git push
```
Claude Code에 이렇게 요청해도 된다:
> "내 브랜치에 최신 main을 merge해서 충돌을 해결해줘. 어느 쪽 내용을 남겼는지 설명해 주고, 끝나면 push해줘."

(force push가 필요한 `rebase` 대신 `merge`를 쓴다. 이미 승인받은 PR이면 이 커밋 때문에 승인이 다시 필요하다.)
