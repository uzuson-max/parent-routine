
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
  const [status, setStatus] = useState<"pending" | "done">("pending");

  useEffect(() => {
    const poll = setInterval(async () => {
      const entry = await fetch(`/api/voice/${entryId}`).then((r) => r.json());

      if (entry.call_state === "done") {
        clearInterval(poll);
        setStatus("done");
        // "통화 끝났어"가 실제로 화면에 보일 시간을 준 다음 ResultScreen으로 넘어간다.
        setTimeout(() => onCallEnded(entry), 1300);
        return;
      }
    }, 3000);
    return () => clearInterval(poll);
  }, [entryId, onCallEnded]);

  return (
    <div style={styles.container}>
      {status === "pending" && <span style={styles.stamp}>참견이 전화 중.</span>}
      <p style={styles.copy}>
        {status === "pending" && "번호 저장했다! \n이건 약간,, 전화로 얘기하고 싶은데 \n전화할게 잠깐만 기다려봐~"}
        {status === "done" && "통화 끝!"}
      </p>
      <button style={styles.homeButton} onClick={onHome}>
        홈으로
      </button>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { height: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: "24px" },
  stamp: {
    background: "#E5FF5D",
    color: "#C71585",
    border: "2px solid #111",
    boxShadow: "3px 3px 0px #111",
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.5px",
  },
  copy: { color: "#fff", fontSize: 20, textAlign: "center", whiteSpace: "pre-line" },
  homeButton: { background: "transparent", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.4)", borderRadius: "20px", padding: "10px 20px", fontSize: 14, cursor: "pointer" },
};
