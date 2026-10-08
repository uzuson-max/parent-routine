// components/LegalPage.tsx
// 이용약관 / 개인정보처리방침 공통 틀. 앱(PWA) 안에서 열리므로 돌아가기는 홈("/")으로.
// 문서 자체는 초안이다 — 정식 공개 전에 [대괄호] 자리를 채우고 전문가 검토를 받아야 한다.

export interface LegalSection {
  title: string;
  body: (string | string[])[]; // string = 문단, string[] = 목록
}

const INK = "#1B1630";

export default function LegalPage({ title, updated, sections }: { title: string; updated: string; sections: LegalSection[] }) {
  return (
    <main
      style={{
        minHeight: "100dvh",
        maxWidth: 640,
        margin: "0 auto",
        boxSizing: "border-box",
        padding: "max(20px, calc(env(safe-area-inset-top, 0px) + 14px)) 20px calc(48px + env(safe-area-inset-bottom, 0px))",
        background: "#FFF9E8",
        color: INK,
        fontFamily: "'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
        lineHeight: 1.7,
        fontSize: 15,
      }}
    >
      <a href="/" style={{ display: "inline-block", padding: "8px 0", color: INK, fontWeight: 700, textDecoration: "none" }}>
        ← 참견이로 돌아가기
      </a>
      <h1 style={{ fontSize: 24, margin: "12px 0 4px" }}>{title}</h1>
      <p style={{ margin: "0 0 24px", fontSize: 13, opacity: 0.6 }}>{updated}</p>
      {sections.map((sec) => (
        <section key={sec.title} style={{ marginBottom: 22 }}>
          <h2 style={{ fontSize: 17, margin: "0 0 6px" }}>{sec.title}</h2>
          {sec.body.map((b, i) =>
            Array.isArray(b) ? (
              <ul key={i} style={{ margin: "4px 0 8px", paddingLeft: 20 }}>
                {b.map((li) => (
                  <li key={li}>{li}</li>
                ))}
              </ul>
            ) : (
              <p key={i} style={{ margin: "0 0 8px", wordBreak: "keep-all" }}>
                {b}
              </p>
            )
          )}
        </section>
      ))}
    </main>
  );
}
