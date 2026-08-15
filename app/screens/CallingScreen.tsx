// app/screens/CallingScreen.tsx
"use client";

import { useEffect } from "react";

export default function CallingScreen({
  entryId,
  minutesDelay,
  onCallEnded,
}: {
  entryId: string;
  minutesDelay: number;
  onCallEnded: (entry: any) => void;
}) {
  useEffect(() => {
    const poll = setInterval(async () => {
      const entry = await fetch(`/api/journal/${entryId}`).then((r) => r.json());
      if (["completed", "no_answer", "failed"].includes(entry.call_state)) {
        clearInterval(poll);
        onCallEnded(entry);
      }
    }, 3000);
    return () => clearInterval(poll);
  }, [entryId, onCallEnded]);

  return (
    <div style={styles.container}>
      <p style={styles.copy}>
        {minutesDelay > 0 ? `${minutesDelay}분 뒤에 전화드릴게요.\n기다려주세요 📞` : "전화 가고 있어요.\n받아주세요 📞"}
      </p>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { height: "100vh", display: "flex", justifyContent: "center", alignItems: "center" },
  copy: { color: "#fff", fontSize: 20, textAlign: "center", whiteSpace: "pre-line" },
};
