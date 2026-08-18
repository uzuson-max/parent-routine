"use client";
import { useEffect, useState } from "react";

export default function CallingScreen({
  entryId,
  onCallEnded,
}: {
  entryId: string;
  onCallEnded: (entry: any) => void;
}) {
  const [status, setStatus] = useState<"pending" | "awaiting_result" | "done">("pending");

  useEffect(() => {
    const poll = setInterval(async () => {
      const entry = await fetch(`/api/voice/${entryId}`).then((r) => r.json());
      if (["completed", "no_answer", "call_failed"].includes(entry.call_state)) {
        clearInterval(poll);
        setStatus("done");
        onCallEnded(entry);
        return;
      }
      if (entry.call_state === "awaiting_result") {
        setStatus("awaiting_result");
      }
    }, 3000);
    return () => clearInterval(poll);
  }, [entryId, onCallEnded]);

  return (
    <div style={styles.container}>
      <p style={styles.copy}>
        {status === "pending" && "곧 전화드릴게요.\n기다려주세요 📞"}
        {status === "awaiting_result" && "지금 전화하고 있어요 📞"}
        {status === "done" && "통화가 끝났어요."}
      </p>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { height: "100vh", display: "flex", justifyContent: "center", alignItems: "center" },
  copy: { color: "#fff", fontSize: 20, textAlign: "center", whiteSpace: "pre-line" },
};
