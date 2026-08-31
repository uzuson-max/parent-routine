interface TimelineScreenProps {
  onOpenRecording: () => void;
  onOpenCalendar: () => void;   // 추가
  entries: RecordEntry[] | null;
}

export default function TimelineScreen({ onOpenRecording, onOpenCalendar, entries }: TimelineScreenProps) {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <span style={styles.badge}>GANSEOBI_ARCHIVE</span>
          <h1 style={styles.headerTitle}>요즘 뭐 하고 살지?</h1>
        </div>
        <button style={styles.calendarBtn} onClick={onOpenCalendar}>📅</button>
      </div>
      {/* ...나머지 그대로... */}
