"""
인터뷰 넣기에서 쓸 수 있는 태그. 기준은 docs/TAGS.md 다 (TAGS.md 를 바꾸면 여기도 같이 바꾼다).

경로(career_path)·분야(career_field) 목록은 질문 의도 분석(app/rag/intent.py)과 같은 것을 가져다 쓰고,
여기서는 '기타(etc)'만 더한다. 주제(topic)는 조각에만 붙는다.
"""

from app.rag.intent import CAREER_FIELD_TAGS, CAREER_PATH_TAGS

TOPIC_TAGS = {
    "choice_reason": "선택 이유",
    "worry": "고민",
    "failure": "실패",
    "turning_point": "전환점",
    "what_helped": "도움된 것",
    "advice": "조언",
    "current_status": "근황",
    "campus_experience": "거캠 경험",
    "future_plan": "앞으로 계획",
    "values": "가치관",
    "etc": "기타",
}

PATH_TAGS = {**CAREER_PATH_TAGS, "etc": "기타"}
FIELD_TAGS = {**CAREER_FIELD_TAGS, "etc": "기타"}

# AI 에게 줄 짧은 정의 (TAGS.md '정의'·'붙이지 않는 경우' 열을 줄인 것)
TOPIC_GUIDE = {
    "choice_reason": "어떤 길을 고른 이유·계기·기준 (입학, 엑시트 시점, 진학·취업·창업 결정). 이유 없이 무엇을 골랐는지만 있으면 current_status",
    "worry": "결정 전의 망설임·불안·두려움, 비교하던 선택지. 지나간 실패는 failure",
    "failure": "잘 안 된 일, 시행착오, 힘들었던 시기, 후회, 그만둔 경험 (구체적인 경험이 있을 때)",
    "turning_point": "생각이나 진로 방향이 바뀐 계기가 된 사건·만남·경험",
    "what_helped": "졸업 후 대학·일·창업에서 실제로 도움이 된 역량·경험·사람",
    "advice": "재학생·후배에게 직접 건네는 말, 권하는 행동",
    "current_status": "인터뷰 시점에 무엇을 하며 지내는지 (학교, 직장, 활동 소개)",
    "campus_experience": "재학 중에 한 일: 프로젝트·수업·생활·관계와 그때 느낀 변화",
    "future_plan": "미래 계획, 목표, 꿈 (이미 하고 있는 일은 current_status)",
    "values": "삶의 키워드, 중요하게 여기는 가치, 삶을 대하는 태도",
    "etc": "위 어디에도 맞지 않을 때만. topic_detail 에 주제를 적는다",
}
