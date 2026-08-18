"use client";
import { useState } from "react";

export default function GoalInputScreen({ onSubmit }: { onSubmit: (goal: string) => void }) {
  const [goal, setGoal] = useState("");

  return (
    <div style={styles.container}>
      <p style={styles.title}>이번엔 무슨 약속을 할까?</p>
      <p style={styles.subtitle}>비워두면 오늘 한 말만 참고해서 반응할게.</p>
      <textarea
        style={styles.textarea}
        placeholder="예: 이번 주에는 꼭 운동해야겠다"
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
      />
      <button style={styles.button} onClick={() => onSubmit(goal.trim())}>
        다음
      </button>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { minHeight: "100vh", padding: 24, display: "flex", flexDirection: "column", justifyContent: "center", gap: 12 },
  title: { color: "#fff", fontSize: 20, textAlign: "center" },
  subtitle: { color: "#999", fontSize: 13, textAlign: "center", marginBottom: 12 },
  textarea: { minHeight: 100, borderRadius: 12, padding: 14, background: "#1a1a1f", color: "#fff", border: "1px solid #333", fontSize: 15 },
  button: { marginTop: 16, padding: 14, borderRadius: 12, border: "none", background: "#ff5f6d", color: "#fff", fontSize: 16 },
};
