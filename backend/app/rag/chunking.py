"""
글(HTML) 하나를 검색용 chunk 여러 개로 자른다.

입력: 크롤링해서 본문 HTML 만 남긴 글 (메뉴·푸터·댓글은 크롤러가 미리 지운다)
규칙 (팀 논의 결과):
  - 졸업생 인터뷰(interview): 굵은 글씨(<strong>/<b>)로만 된 문단을 '질문'으로 보고
    질문-답변 쌍 단위로 자른다. 답변이 길면 문단 단위로 나누되 질문을 앞에 다시 붙인다.
    마무리 편집 노트는 별도 chunk.
  - 코-레터·에세이(letter, essay): 소제목 경계 + 문단 2~4개(약 500~800자) 단위.
    문단 중간에서는 자르지 않는다.
  - 모든 chunk 의 임베딩용 글 앞에 [글 종류 | 이름 | 진로 | 날짜] 머리말을 붙인다.
  - 공개 등급 L0 글은 chunk 를 만들지 않는다.

외부 패키지 없이 Python 기본 html.parser 만 쓴다.
"""

from dataclasses import dataclass
from html.parser import HTMLParser

from app.rag.models import Chunk

TARGET_MIN_CHARS = 500  # 이 길이를 넘기면 다음 문단에서 끊을 수 있다
TARGET_MAX_CHARS = 800  # 이 길이를 넘기지 않게 문단을 모은다 (문단 하나가 더 길면 그대로 둔다)

# 이 말로 시작하는 문단부터는 '편집 노트'로 본다. (실제 글을 보고 고쳐야 할 수 있다)
EDITOR_NOTE_MARKERS = ("편집자", "에디터", "편집 후기", "덧붙임", "※")

POST_TYPE_LABELS = {"interview": "졸업생 인터뷰", "letter": "코-레터", "essay": "에세이"}

BLOCK_TAGS = {"p", "li", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6", "div", "section", "article"}
HEADING_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6"}
BOLD_TAGS = {"strong", "b"}
SKIP_TAGS = {"script", "style", "noscript", "iframe"}


@dataclass
class Block:
    """HTML 에서 뽑은 문단 하나."""

    text: str
    is_bold: bool  # 문단 글자가 전부 굵은 글씨인지 (인터뷰 질문 후보)
    is_heading: bool


class _BlockParser(HTMLParser):
    """HTML 을 문단(Block) 목록으로 바꾼다."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.blocks: list[Block] = []
        self._bold_depth = 0
        self._skip_depth = 0
        self._heading_depth = 0
        self._parts: list[tuple[str, bool]] = []  # (글자, 굵은 글씨인지)

    def _flush(self) -> None:
        text = " ".join("".join(t for t, _ in self._parts).split())
        if text:
            visible = [(t, b) for t, b in self._parts if t.strip()]
            is_bold = bool(visible) and all(b for _, b in visible)
            self.blocks.append(Block(text=text, is_bold=is_bold, is_heading=self._heading_depth > 0))
        self._parts = []

    def handle_starttag(self, tag, attrs):
        if tag in SKIP_TAGS:
            self._skip_depth += 1
        elif tag in BLOCK_TAGS:
            self._flush()
            if tag in HEADING_TAGS:
                self._heading_depth += 1
        elif tag == "br":
            self._parts.append(("\n", self._bold_depth > 0))
        elif tag in BOLD_TAGS:
            self._bold_depth += 1

    def handle_endtag(self, tag):
        if tag in SKIP_TAGS:
            self._skip_depth = max(0, self._skip_depth - 1)
        elif tag in BLOCK_TAGS:
            self._flush()
            if tag in HEADING_TAGS:
                self._heading_depth = max(0, self._heading_depth - 1)
        elif tag in BOLD_TAGS:
            self._bold_depth = max(0, self._bold_depth - 1)

    def handle_data(self, data):
        if self._skip_depth == 0:
            self._parts.append((data, self._bold_depth > 0))

    def close(self):
        super().close()
        self._flush()


def parse_blocks(html: str) -> list[Block]:
    parser = _BlockParser()
    parser.feed(html)
    parser.close()
    return parser.blocks


def group_paragraphs(paragraphs: list[str], min_chars=TARGET_MIN_CHARS, max_chars=TARGET_MAX_CHARS) -> list[str]:
    """문단을 약 500~800자 묶음으로 모은다. 문단 중간에서는 자르지 않는다."""
    groups: list[list[str]] = []
    current: list[str] = []
    length = 0
    for p in paragraphs:
        if current and (length + len(p) > max_chars) and length >= min_chars // 2:
            groups.append(current)
            current, length = [], 0
        current.append(p)
        length += len(p)
        if length >= min_chars and length <= max_chars:
            groups.append(current)
            current, length = [], 0
    if current:
        # 마지막 묶음이 너무 짧으면 앞 묶음에 붙인다.
        # 단, 붙였을 때 max_chars 를 넘으면 붙이지 않는다 (긴 문단 뒤에 붙어 chunk 가 너무 커지는 것 방지)
        previous_length = sum(len(p) for p in groups[-1]) if groups else 0
        if groups and length < min_chars // 2 and previous_length + length <= max_chars:
            groups[-1].extend(current)
        else:
            groups.append(current)
    return ["\n\n".join(g) for g in groups]


def make_header(post: dict) -> str:
    """[글 종류 | 이름 | 진로 | 날짜] 머리말. L3 가 아니면 이름은 '익명'."""
    label = POST_TYPE_LABELS.get(post["post_type"], post["post_type"])
    name = post.get("nickname") if post.get("visibility") == "L3" and post.get("nickname") else "익명"
    careers = ", ".join(post.get("career_tags") or []) or "진로 미상"
    date = post.get("date") or "날짜 미상"
    return f"[{label} | {name} | {careers} | {date}]"


def _is_editor_note(text: str) -> bool:
    return text.startswith(EDITOR_NOTE_MARKERS)


def _interview_sections(blocks: list[Block]) -> list[tuple[str | None, list[str]]]:
    """
    인터뷰를 (질문, 답변 문단들) 목록으로 나눈다. 질문 앞 도입부·편집 노트는 질문 None.

    편집 노트는 '마지막 질문보다 뒤'에 있을 때만 노트로 본다.
    글 앞쪽의 "※ 이 인터뷰는 2020년에 진행했어요" 같은 문단을 노트로 보면,
    그 뒤의 질문-답변이 전부 노트 하나로 묶여 버리기 때문이다.
    """
    sections: list[tuple[str | None, list[str]]] = []
    question: str | None = None
    answer: list[str] = []
    in_note = False
    question_positions = [i for i, b in enumerate(blocks) if b.is_bold or b.is_heading]
    last_question = question_positions[-1] if question_positions else -1

    def close():
        if answer or question:
            sections.append((question, list(answer)))

    for position, block in enumerate(blocks):
        if not in_note and position > last_question and _is_editor_note(block.text):
            close()
            question, answer, in_note = None, [], True
            answer.append(block.text)
            continue
        if not in_note and (block.is_bold or block.is_heading):
            close()
            question, answer = block.text, []
            continue
        answer.append(block.text)
    close()
    return [(q, a) for q, a in sections if a]  # 답이 없는 질문은 버린다


def chunk_post(post: dict) -> list[Chunk]:
    """
    글 하나 → chunk 목록.

    post 에 필요한 값: post_id, post_type(interview|letter|essay), html, visibility(L0~L3)
    있으면 쓰는 값: title, nickname, career_tags, date, url
    """
    if post.get("visibility", "L0") == "L0":
        return []

    blocks = parse_blocks(post["html"])
    header = make_header(post)

    pieces: list[tuple[str | None, str]] = []  # (질문, 본문)
    if post["post_type"] == "interview":
        for question, answer in _interview_sections(blocks):
            for body in group_paragraphs(answer):
                pieces.append((question, body))
    else:
        section: list[str] = []
        for block in blocks:
            if block.is_heading and section:
                pieces.extend((None, body) for body in group_paragraphs(section))
                section = []
            section.append(block.text)
        pieces.extend((None, body) for body in group_paragraphs(section))

    chunks = []
    for index, (question, body) in enumerate(pieces):
        embed_parts = [header] + ([f"Q. {question}"] if question else []) + [body]
        chunks.append(
            Chunk(
                chunk_id=f"{post['post_id']}#{index}",
                post_id=post["post_id"],
                chunk_index=index,
                post_type=post["post_type"],
                title=post.get("title", ""),
                nickname=post.get("nickname", ""),
                career_tags=post.get("career_tags") or [],
                date=post.get("date"),
                url=post.get("url"),
                visibility=post["visibility"],
                question=question,
                content=body,
                embed_text="\n".join(embed_parts),
            )
        )
    return chunks
