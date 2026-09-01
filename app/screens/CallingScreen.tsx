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
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { height: "100vh", display: "flex", justifyContent: "center", alignItems: "center" },
  copy: { color: "#fff", fontSize: 20, textAlign: "center", whiteSpace: "pre-line" },
};
