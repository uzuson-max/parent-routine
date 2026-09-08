
"use client";
import { useEffect, useState } from "react";
import { BRAND, inkAlpha, pageBackground } from "@/lib/theme";
import { IconPhone } from "@/components/icons";

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
      <div style={styles.iconWrap}>
        <IconPhone style={{ width: 32, height: 32, color: "#fff" }} />
      </div>
      {status === "pending" && <span style={styles.stamp}>참견이 전화 중.</span>}
      <p style={styles.copy}>
        {status === "pending" && "번호 저장했어.\n이건 좀 전화로 얘기하고 싶은데.\n잠깐만. 전화할게."}
        {status === "done" && "통화 끝!"}
      </p>
      <button style={styles.homeButton} onClick={onHome}>
        홈으로
      </button>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { minHeight: "100vh", ...pageBackground, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: "20px", padding: "24px" },
  iconWrap: {
    width: "72px",
    height: "72px",
    borderRadius: "50%",
    border: "3px solid #111",
    background: BRAND.lavender,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "4px 4px 0px #111",
  },
  stamp: {
    background: BRAND.yellow,
    color: BRAND.ink,
    border: "2px solid #111",
    boxShadow: "3px 3px 0px #111",
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.5px",
  },
  copy: { color: BRAND.ink, fontSize: 20, textAlign: "center", whiteSpace: "pre-line", fontWeight: 900, lineHeight: 1.5 },
  homeButton: { background: "transparent", color: inkAlpha.muted, border: `1.5px solid ${inkAlpha.hairline}`, borderRadius: "20px", padding: "10px 22px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
};
