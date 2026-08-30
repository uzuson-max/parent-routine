
"use client";

import { useState } from "react";

export default function NicknameScreen({
  onSubmit,
  onSkip,
}: {
  onSubmit: (nickname: string) => void;
  onSkip: () => void;
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
      <button style={styles.skipButton} onClick={onSkip}>나중에</button>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { height: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "0 32px" },
  headline: { color: "#fff", fontSize: 22, fontWeight: 700, textAlign: "center", margin: "0 0 24px" },
  input: { width: "100%", maxWidth: 320, padding: "14px 16px", borderRadius: 12, border: "1px solid #333", background: "#1a1a1f", color: "#fff", fontSize: 16, textAlign: "center" },
  button: { marginTop: 16, width: "100%", maxWidth: 320, padding: "14px 16px", borderRadius: 12, border: "none", background: "#ff5f6d", color: "#fff", fontSize: 16, fontWeight: 600 },
  skipButton: { marginTop: 10, padding: "8px 16px", border: "none", background: "transparent", color: "#666", fontSize: 14 },
};
