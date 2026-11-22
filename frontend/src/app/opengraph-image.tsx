// 링크 미리보기 이미지 (og:image). 카카오톡·슬랙 등에 꾸로록 주소를 붙이면 이 그림이 뜬다.
// next build 때 한 번 그려서 PNG로 저장한다. 같은 그림이 트위터(X) 카드에도 쓰인다.
// 이 그림 안에서는 CSS 변수·Tailwind를 못 써서 색을 직접 적었다. (globals.css @theme 값과 같게 맞춤)
// 한글을 그리려면 글꼴 파일이 필요해서 assets/fonts/Jua-Regular.ttf (OFL 라이선스)를 읽어 쓴다.
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "꾸로록: 한 사람의 경험이 다음 학생의 선택지가 되도록";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const C = {
  brand: "#0056c7",
  accent: "#f7de5f",
  butter: "#fff3b8",
  canvas: "#fffbea",
  surface: "#ffffff",
  line: "#d6e3f5",
  ink: "#0b2559",
  body: "#2f4470",
};

export default async function Image() {
  const jua = await readFile(join(process.cwd(), "assets/fonts/Jua-Regular.ttf"));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          fontFamily: "Jua",
          color: C.ink,
          backgroundColor: C.canvas,
          // 노트 줄 바탕 (화면의 paper-lines와 같은 느낌)
          backgroundImage: `repeating-linear-gradient(180deg, transparent 0px, transparent 51px, ${C.line} 51px, ${C.line} 53px)`,
          overflow: "hidden",
        }}
      >
        {/* 왼쪽 여백선 */}
        <div style={{ position: "absolute", left: 64, top: 0, bottom: 0, width: 3, backgroundColor: C.brand, opacity: 0.18 }} />

        <div style={{ display: "flex", flexDirection: "column", padding: "72px 0 0 112px" }}>
          {/* 로고 + 이름 */}
          <div style={{ display: "flex", alignItems: "center" }}>
            <svg width="72" height="72" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="16.5" fill={C.accent} stroke={C.brand} strokeWidth="2.2" />
              <ellipse cx="13" cy="16" rx="3.4" ry="4.6" fill="#fff" stroke={C.brand} strokeWidth="1.6" />
              <ellipse cx="23" cy="16" rx="3.4" ry="4.6" fill="#fff" stroke={C.brand} strokeWidth="1.6" />
              <circle cx="13.4" cy="14.6" r="1.7" fill={C.brand} />
              <circle cx="23.4" cy="14.6" r="1.7" fill={C.brand} />
            </svg>
            <div style={{ marginLeft: 20, fontSize: 56, color: C.brand }}>꾸로록</div>
          </div>

          {/* 슬로건 */}
          <div style={{ display: "flex", flexDirection: "column", marginTop: 64, fontSize: 76, lineHeight: 1.25 }}>
            <div>한 사람의 경험이</div>
            <div style={{ display: "flex" }}>
              <span>다음 학생의&nbsp;</span>
              {/* 형광펜 밑줄 */}
              <span style={{ display: "flex", position: "relative" }}>
                <span
                  style={{
                    position: "absolute",
                    left: -6,
                    right: -6,
                    bottom: 8,
                    height: 34,
                    backgroundColor: C.butter,
                    borderRadius: 8,
                  }}
                />
                {/* position: relative: 글자를 형광펜보다 위에 그린다 (안 그러면 형광펜이 글자를 가림) */}
                <span style={{ color: C.brand, position: "relative" }}>선택지</span>
              </span>
              <span>가 되도록</span>
            </div>
          </div>

          <div style={{ marginTop: 36, fontSize: 34, color: C.body }}>거꾸로캠퍼스 선배들의 이야기로 답하는 진로 상담</div>
        </div>

        {/* 오른쪽 아래: 화면 밖에서 눈만 빼꼼 내민 꾸로록 */}
        <svg
          width="400"
          height="200"
          viewBox="0 0 400 200"
          style={{ position: "absolute", right: 72, bottom: 0 }}
        >
          <path d="M0 200A200 200 0 0 1 400 200Z" fill={C.accent} />
          <ellipse cx="148" cy="118" rx="34" ry="46" fill={C.surface} stroke={C.brand} strokeWidth="6" />
          <ellipse cx="252" cy="118" rx="34" ry="46" fill={C.surface} stroke={C.brand} strokeWidth="6" />
          <circle cx="148" cy="100" r="15" fill={C.brand} />
          <circle cx="252" cy="100" r="15" fill={C.brand} />
        </svg>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Jua", data: jua, style: "normal", weight: 400 }],
    },
  );
}
