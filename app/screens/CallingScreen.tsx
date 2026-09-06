"use client";
import { useEffect, useState } from "react";

export default function CallingScreen({
  entryId,
  onCallEnded,
  onHome,
}: {
  entryId: string;
  onCallEnded: (entry: any) => void;
  onHome: () => void;
}) {
  const [status, setStatus] = useState<"pending" | "awaiting_result" | "done">("pending");

  useEffect(() => {
    const poll = setInterval(async () => {
      const entry = await fetch(`/api/voice/${entryId}`).then((r) => r.json());

      if (entry.call_state === "done") {
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
        {status === "pending" && "번호 저장했어요~\n이건 직접 얘기하는 게 좋을것 같은데! \n전화할게 잠깐만 기다려줘~"}
        {status === "awaiting_result" && "지금 전화하고 있어 📞"}
        {status === "done" && "통화 끝났어."}
      </p>
      <button style={styles.homeButton} onClick={onHome}>
        홈으로
      </button>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { height: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: "24px" },
  copy: { color: "#fff", fontSize: 20, textAlign: "center", whiteSpace: "pre-line" },
  homeButton: { background: "transparent", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.4)", borderRadius: "20px", padding: "10px 20px", fontSize: 14, cursor: "pointer" },
};
