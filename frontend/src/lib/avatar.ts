// 선배 아바타 번호 → 그림 주소.
// backend 가 'avatar-1'~'avatar-7' 를 보내면 public/avatars/avatar-01.svg ~ avatar-07.svg 를 쓴다.
// 번호는 backend(app/avatars.py)가 정한다. 같은 선배는 어느 화면에서든 같은 번호다.
// 그림 수를 바꾸면 여기 AVATAR_COUNT 와 backend/app/avatars.py 의 AVATAR_COUNT 를 같이 바꾼다.
const AVATAR_COUNT = 7;

// 모르는 값(비었거나 범위 밖)이면 null → 화면은 원래 자리 표시(순번·이름 첫 글자)를 보여준다.
export function avatarSrc(avatarId: string | null | undefined): string | null {
  const match = /^avatar-(\d+)$/.exec(avatarId ?? "");
  if (!match) return null;
  const n = Number(match[1]);
  if (n < 1 || n > AVATAR_COUNT) return null;
  return `/avatars/avatar-${String(n).padStart(2, "0")}.svg`;
}
