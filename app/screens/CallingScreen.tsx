"use client";

import { useEffect, useRef, useState } from "react";

export default function CallingScreen({
  entryId,
  minutesDelay,
  onCallEnded,
}: {
  entryId: string;
  minutesDelay: number;
  onCallEnded: (entry: any) => void;
}) {
  const [status, setStatus] = useState<"preparing" | "ringing" | "playing_tts">("preparing");
  const spokenRef = useRef(false);

  useEffect(() => {
    const poll = setInterval(async () => {
      const entry = await fetch(`/api/journal/${entryId}`).then((r) => r.json());

      if (["completed", "no_answer", "failed"].includes(entry.call_state)) {
        clearInterval(poll);
        onCallEnded(entry);
        return;
      }

      if (entry.call_state === "ringing") {
        setStatus("ringing");
        return;
      }

      if (entry.call_state === "fallback_ready" && !spokenRef.current && entry.call_message) {
        spokenRef.current = true;
        clearInterval(poll);
        setStatus("playing_tts");

        const utterance = new SpeechSynthesisUtterance(entry.call_message);
        utterance.lang = "ko-KR";
        utterance.onend = async () => {
          await fetch(`/api/journal/${entryId}/mark-completed`, { method: "POST" }).catch(() => {});
          onCallEnded({ ...entry, call_state: "completed" });
        };
        window.speechSynthesis.speak(utterance);
      }
    }, 1500);

    return () => clearInterval(poll);
  }, [entryId, onCallEnded]);

  return (
    <div style={styles.container}>
      <p style={styles.copy}>
        {status === "preparing" && "전화 연결 준비 중..."}
        {status === "ringing" && (minutesDelay > 0 ? `${minutesDelay}분 뒤에 전화드릴게요.\n기다려주세요 📞` : "전화 가고 있어요.\n받아주세요 📞")}
        {status === "playing_tts" && "지금 바로 들려드릴게요 🔊"}
      </p>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { height: "100vh", display: "flex", justifyContent: "center", alignItems: "center" },
  copy: { color: "#fff", fontSize: 20, textAlign: "center", whiteSpace: "pre-line" },
};
