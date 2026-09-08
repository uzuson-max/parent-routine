
"use client";

import { useState } from "react";
import { BRAND, inkAlpha, pageBackground } from "@/lib/theme";

export default function NicknameScreen({
  onSubmit,
  onSkip,
}: {
  onSubmit: (nickname: string) => void;
  // 온보딩 체크리스트에서 쓸 때는 닉네임이 완전히 필수라 이 prop을 아예 안 넘긴다 —
  // 그러면 "나중에" 버튼 자체가 안 보여서 입력하지 않고는 빠져나갈 수 없다.
  // 기존 "닉네임" 단독 스텝(page.tsx, 첫 기록 이후 물어보는 경우)에서는 계속 넘겨서 스킵 가능하게 둔다.
  onSkip?: () => void;
}) {
  const [nickname, setNickname] = useState("");

  return (
    <div style={styles.container}>
      <p style={styles.headline}>근데 너 뭐라고 부르면 돼?</p>

      <input
        style={styles.input}
        placeholder="닉네임"
        value={nickname}
        maxLength={20}
        onChange={(e) => setNickname(e.target.value)}
      />

      <button style={styles.button} disabled={!nickname.trim()} onClick={() => onSubmit(nickname.trim())}>
        이걸로 해
      </button>
      {onSkip && <button style={styles.skipButton} onClick={onSkip}>나중에</button>}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { minHeight: "100vh", ...pageBackground, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "0 32px" },
  headline: { color: BRAND.ink, fontSize: 22, fontWeight: 900, textAlign: "center", margin: "0 0 24px" },
  input: { width: "100%", maxWidth: 320, padding: "14px 16px", borderRadius: 16, border: "2px solid #111", background: BRAND.card, color: BRAND.ink, fontSize: 16, textAlign: "center", boxShadow: "3px 3px 0px rgba(30,26,38,0.10)" },
  button: { marginTop: 16, width: "100%", maxWidth: 320, padding: "14px 16px", borderRadius: 18, border: "3px solid #111", boxShadow: "4px 4px 0px #111", background: BRAND.lavender, color: "#fff", fontSize: 16, fontWeight: 900, cursor: "pointer" },
  skipButton: { marginTop: 10, padding: "8px 16px", border: "none", background: "transparent", color: inkAlpha.faint, fontSize: 14, cursor: "pointer" },
};
