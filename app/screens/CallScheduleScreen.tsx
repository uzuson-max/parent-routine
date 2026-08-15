"use client";

const OPTIONS = [
  { label: "지금 전화하기", minutes: 0 },
  { label: "3분 뒤", minutes: 3 },
  { label: "10분 뒤", minutes: 10 },
];

export default function CallScheduleScreen({ onSelect }: { onSelect: (minutes: number) => void }) {
  return (
    <div style={styles.container}>
      <p style={styles.headline}>좋아. 언제 전화할까?</p>
      <div style={styles.optionCol}>
        {OPTIONS.map((opt) => (
          <button key={opt.minutes} style={styles.optionButton} onClick={() => onSelect(opt.minutes)}>
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { height: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "0 32px" },
  headline: { color: "#fff", fontSize: 22, fontWeight: 700, marginBottom: 32 },
  optionCol: { display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 320 },
  optionButton: { padding: "16px 8px", borderRadius: 12, border: "1px solid #333", background: "#1a1a1f", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" },
};
