// frontend/screens/CallingScreen.jsx
import { useEffect } from "react";

export default function CallingScreen({ entryId, onCallEnded }) {
  useEffect(() => {
    const poll = setInterval(async () => {
      const entry = await fetch(`/api/journal/${entryId}`).then((r) => r.json());
      if (["completed", "no_answer", "failed"].includes(entry.call_status)) {
        clearInterval(poll);
        onCallEnded(entry);
      }
    }, 3000);
    return () => clearInterval(poll);
  }, [entryId, onCallEnded]);

  return (
    <div style={styles.container}>
      <p style={styles.copy}>전화 가고 있어요.{"\n"}받아주세요 📞</p>
    </div>
  );
}

const styles = {
  container: {
    height: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  copy: { color: "#fff", fontSize: 20, textAlign: "center", whiteSpace: "pre-line" },
};
