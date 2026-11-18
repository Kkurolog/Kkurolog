"""
선배 아바타 번호 정하기. 답변 카드(app/rag/cards.py)와 멘토 카드(app/services/mentors.py)가 함께 쓴다.

- 그림은 frontend/public/avatars/avatar-01.svg ~ avatar-07.svg (7종)
- 번호는 'avatar-1' ~ 'avatar-7' 로 내보낸다. 화면(frontend/src/lib/avatar.ts)이 파일 이름으로 바꾼다
- 같은 선배는 어느 화면에서든 같은 그림이 나와야 해서, 사람마다 고정된 값(person_id 등)을 해시해서 정한다
  (파이썬 내장 hash() 는 서버를 켤 때마다 값이 달라져서 쓰지 않는다)
- 내부 ID 자체는 밖으로 내보내지 않는다. 번호만 나간다

그림 수를 바꾸면 AVATAR_COUNT 와 frontend/src/lib/avatar.ts 의 AVATAR_COUNT 를 같이 바꾼다.
(이 경우 이미 보이던 선배들의 그림도 바뀐다)
"""

import hashlib

AVATAR_COUNT = 7


def avatar_id_for_key(key: str) -> str:
    """사람마다 고정된 값(key)으로 아바타 번호를 정한다. 예: 'avatar-3'"""
    digest = hashlib.sha256(key.encode("utf-8")).digest()
    return f"avatar-{digest[0] % AVATAR_COUNT + 1}"
