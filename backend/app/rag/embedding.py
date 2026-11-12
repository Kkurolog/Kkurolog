"""
글을 벡터(숫자 목록)로 바꾸는 곳. 지금은 OpenAI 임베딩을 쓴다.

다른 임베딩으로 바꾸고 싶으면 embed() 를 가진 클래스를 하나 더 만들면 된다.
"""

import os
from typing import Protocol


class Embedder(Protocol):
    def embed(self, texts: list[str]) -> list[list[float]]: ...


class OpenAIEmbedder:
    """OpenAI 임베딩. OPENAI_API_KEY 환경변수가 필요하다."""

    def __init__(self, model: str, batch_size: int = 100, timeout: float | None = None) -> None:
        from openai import OpenAI  # requirements-rag.txt 를 설치해야 import 된다

        # timeout(초): /ask 에서는 짧게 준다. None 이면 SDK 기본값 (적재 스크립트처럼 오래 걸려도 될 때)
        kwargs = {"timeout": timeout} if timeout is not None else {}
        self._client = OpenAI(api_key=os.environ["OPENAI_API_KEY"], **kwargs)
        self._model = model
        self._batch_size = batch_size

    def embed(self, texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for start in range(0, len(texts), self._batch_size):
            batch = texts[start : start + self._batch_size]
            res = self._client.embeddings.create(model=self._model, input=batch)
            vectors.extend(item.embedding for item in sorted(res.data, key=lambda d: d.index))
        return vectors
