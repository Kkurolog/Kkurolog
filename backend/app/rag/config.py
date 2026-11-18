"""
RAG 설정값. 성능 측정(scripts/eval_ask.py) 결과를 보면서 바꾼다.

.env 에 KKUROLOG_ 로 시작하는 환경변수를 넣으면 그 값을 쓴다. 예: KKUROLOG_TOP_K=10
⚠️ 아래 기본값은 '제안' 값이다. 특히 similarity_floor 는 실제 데이터로 측정한 뒤 정한다.

호출 횟수 제한은 여기가 아니라 app/config.py (구현은 app/rate_limit.py) 에 있다.
"""

import os
from dataclasses import dataclass, fields


@dataclass
class RagSettings:
    # ---- 검색 ----
    top_k: int = 8  # 처음에 몇 개 chunk 를 찾을지
    # 이보다 유사도가 낮은 chunk 는 버린다. 2026-11-18 측정(docs/proposals/answer-quality-audit.md 0장)으로 0.3 → 0.2:
    # 0.3 은 무관한 질문이 아니라 '짧은 질문'을 걸러서, 메인 화면 추천 질문까지 근거 부족으로 떨어졌다.
    # 근거가 충분한지는 이 숫자가 아니라 Claude 가 판단한다 (근거 부족 질문도 0.35~0.44 가 나온다).
    similarity_floor: float = 0.2
    neighbor_window: int = 1  # 검색된 chunk 앞뒤로 몇 개씩 붙일지
    max_posts: int = 3  # Claude 에게 넘길 글 최대 개수
    classify_when_no_hits: bool = True  # 검색 결과가 없어도 Claude 로 위기·무관 질문인지 분류할지

    # ---- 태그 우선 검색 ----
    # "창업한 선배 있어?" 처럼 '어떤 길을 간 선배'를 찾는 질문은, 글자가 비슷한 글보다 그 길을 실제로 간 선배의 글이
    # 먼저 나와야 한다. 의도 분석이 질문에서 경로·분야 태그를 뽑으면, 그 태그가 있는 선배의 chunk 만 따로 한 번 더
    # 찾아서 글 자리 중 tag_reserved_posts 개를 먼저 채운다. (왜: docs/proposals/answer-quality-audit.md 0-3)
    tag_reserved_posts: int = 2  # 태그가 맞는 선배의 글에 먼저 주는 자리 수. 0 이면 태그 검색을 하지 않는다
    tag_top_k: int = 8  # 태그가 맞는 chunk 를 몇 개 찾을지
    tag_similarity_floor: float = 0.0  # 태그가 맞는 chunk 에 쓰는 유사도 하한 (태그가 이미 관련성의 근거라 낮게 둔다)

    # ---- 모델 ---- (팀 논의 항목: 모델 선택과 비용)
    embedding_model: str = "text-embedding-3-small"  # 1536차원. 바꾸면 supabase/migrations 의 vector(1536)도 바꾼다
    claude_model: str = "claude-opus-5-5"
    claude_effort: str = "medium"  # low | medium | high | xhigh | max
    claude_max_tokens: int = 16000
    claude_use_fallbacks: bool = True  # Claude Haiku 5.5 를 쓰면 false (fallback 미지원)

    # ---- 1차 의도 분석 (app/rag/intent.py) ----
    intent_enabled: bool = True  # false 면 예전처럼 모든 질문을 바로 검색·답변 생성으로 보낸다
    intent_model: str = "claude-haiku-5-5"  # 인사인지 질문인지만 가르므로 작고 빠른 모델
    intent_timeout_seconds: float = 10.0  # 넘기면 분석을 건너뛰고 기존 흐름으로 간다

    # ---- 대기 시간 상한 (초) ----
    # SDK 기본값은 10분이라, 학생이 답을 너무 오래 기다리지 않게 줄인다.
    # SDK 는 실패하면 기본 2번 다시 시도하므로 최악의 대기 시간은 이 값의 약 3배다.
    embedding_timeout_seconds: float = 15.0
    claude_timeout_seconds: float = 60.0

    @classmethod
    def from_env(cls) -> "RagSettings":
        """KKUROLOG_필드이름(대문자) 환경변수가 있으면 그 값으로 바꾼다."""
        values = {}
        for f in fields(cls):
            raw = os.getenv(f"KKUROLOG_{f.name.upper()}")
            if raw is None:
                continue
            if f.type in (bool, "bool"):
                values[f.name] = raw.strip().lower() in {"1", "true", "yes"}
            elif f.type in (int, "int"):
                values[f.name] = int(raw)
            elif f.type in (float, "float"):
                values[f.name] = float(raw)
            else:
                values[f.name] = raw
        return cls(**values)
