"use client";

import { useState } from "react";
import { BRAND, inkAlpha, pageBackground } from "@/lib/theme";
import Mascot from "@/components/Mascot";
import { IconHome, IconRecord, IconMemory, IconMic, IconGear } from "@/components/icons";

export interface RecordEntry {
  id: string;
  createdAt: string;
  transcript: string;
  responseText: string | null;
}

// 진행 중인 commitment/goal 하이라이트 — 현재는 데이터 소스(API)가 없어 optional.
// 향후 commitment_memory 요약을 내려주는 엔드포인트가 생기면 page.tsx에서 이 prop을 채워주면 됨.
export interface MemoryHighlight {
  title: string;
  progressLabel: string; // 예: "1 / 3", "진행 중"
}

interface TimelineScreenProps {
  onOpenRecording: () => void;
  onOpenCalendar: () => void;
  onOpenMyPage: () => void;
  entries: RecordEntry[] | null;
  nickname?: string | null;
  memoryHighlight?: MemoryHighlight | null;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const month = d.getMonth() + 1;
  const date = d.getDate();
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${month}월 ${date}일 ${hh}:${mm}`;
}

function truncate(text: string, max: number): string {
  const clean = text.trim();
  return clean.length > max ? clean.slice(0, max) + "…" : clean;
}

export default function TimelineScreen({
  onOpenRecording,
  onOpenCalendar,
  onOpenMyPage,
  entries,
  nickname,
  memoryHighlight,
}: TimelineScreenProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div style={styles.container}>
      {/* TOP — 참견이가 여기서 기다리고 있다는 느낌: 마스코트 + 말풍선 */}
      <div style={styles.topSection}>
        <Mascot pose="말을거는" size={72} />
        <div style={styles.speechBubble}>
          <span style={styles.eyebrow}>{nickname ? `HEY, ${nickname}` : "HEY"}</span>
          <h1 style={styles.greeting}>
            {nickname ? `${nickname}, 오늘은 무슨 얘기해볼까?` : "오늘은 무슨 얘기해볼까?"}
          </h1>
        </div>
      </div>

      {/* MAIN CTA — 화면에서 가장 큰 행동 */}
      <button style={styles.mainCta} onClick={onOpenRecording}>
        <span style={styles.ctaMicWrap}>
          <IconMic style={{ width: 22, height: 22, color: "#fff" }} />
        </span>
        <span style={styles.ctaText}>아무 얘기나 해도 돼</span>
        <span style={styles.ctaLabel}>TALK TO ME~</span>
      </button>

      {/* MEMORY — 데이터 있을 때만 노출 */}
      {memoryHighlight && (
        <div style={styles.memoryCard}>
          <div style={styles.memoryHead}>
            <IconMemory style={{ width: 18, height: 18, color: BRAND.lavenderDeep }} />
            <span style={styles.memoryLabel}>참견이가 기억하고 있어</span>
          </div>
          <p style={styles.memoryTitle}>{memoryHighlight.title}</p>
          <p style={styles.memoryProgress}>{memoryHighlight.progressLabel}</p>
        </div>
      )}

      {/* RECENT */}
      <div style={styles.recentHeader}>
        <span style={styles.sectionEyebrow}>RECENT</span>
        <h2 style={styles.recentTitle}>참견이가 기억하는 거</h2>
      </div>

      <div style={styles.listContainer}>
        {entries === null ? (
          <div style={styles.loadingCard}>
            <p style={styles.loadingText}>불러오는 중...</p>
          </div>
        ) : entries.length === 0 ? (
          <div style={styles.emptyCard}>
            <p style={styles.emptyTitle}>아직 니 얘기가 없어.</p>
            <p style={styles.emptySub}>위에서 아무 말이나 해볼래?</p>
          </div>
        ) : (
          entries.map((entry) => {
            const isOpen = expandedId === entry.id;
            const isLong = entry.transcript.length > 40;
            return (
              <div
                key={entry.id}
                style={styles.card}
                onClick={() => setExpandedId(isOpen ? null : entry.id)}
              >
                <div style={styles.cardTopRow}>
                  <span style={styles.cardDate}>{formatDateTime(entry.createdAt)}</span>
                </div>

                <p style={styles.sectionLabel}>니가 한 말</p>
                <p style={styles.transcriptText}>
                  &ldquo;{isOpen ? entry.transcript : truncate(entry.transcript, 40)}&rdquo;
                </p>

                {entry.responseText && (
                  <>
                    <p style={styles.sectionLabelResponse}>참견이</p>
                    <p style={styles.responseTextStyle}>
                      &ldquo;{isOpen ? entry.responseText : truncate(entry.responseText, 40)}&rdquo;
                    </p>
                  </>
                )}

                {!isOpen && isLong && <p style={styles.expandHint}>누르면 전체 보여</p>}
              </div>
            );
          })
        )}
      </div>

      <div style={{ height: "76px" }} />

      {/* NAVIGATION */}
      <div style={styles.bottomNav}>
        <div style={{ ...styles.navItem, ...styles.navItemActive }}>
          <IconHome style={{ width: 20, height: 20 }} />
          <span style={styles.navText}>HOME</span>
        </div>
        <button style={styles.navItem} onClick={onOpenCalendar}>
          <IconRecord style={{ width: 20, height: 20 }} />
          <span style={styles.navText}>기록</span>
        </button>
        <button
          style={styles.navItem}
          onClick={onOpenCalendar}
          title="Memory 전용 화면은 아직 없어서 우선 캘린더로 연결됨"
        >
          <IconMemory style={{ width: 20, height: 20 }} />
          <span style={styles.navText}>MEMORY</span>
        </button>
        <button style={styles.navItem} onClick={onOpenMyPage}>
          <IconGear style={{ width: 20, height: 20 }} />
          <span style={styles.navText}>MY</span>
        </button>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: "100vh",
    ...pageBackground,
    color: BRAND.ink,
    padding: "24px 20px 0 20px",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  topSection: { display: "flex", alignItems: "flex-end", gap: "10px" },
  speechBubble: {
    position: "relative",
    flex: 1,
    background: BRAND.card,
    border: "2.5px solid #111",
    borderRadius: "18px 18px 18px 4px",
    padding: "12px 16px",
    boxShadow: "3px 4px 0px rgba(30,26,38,0.12)",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  eyebrow: {
    fontSize: "11px",
    fontWeight: "900",
    letterSpacing: "1.5px",
    color: inkAlpha.faint,
  },
  greeting: {
    fontSize: "20px",
    fontWeight: "900",
    margin: 0,
    letterSpacing: "-0.3px",
    lineHeight: 1.3,
  },
  mainCta: {
    width: "100%",
    background: BRAND.lavender,
    color: "#fff",
    border: "3px solid #111",
    boxShadow: "4px 4px 0px #111",
    borderRadius: "18px",
    padding: "20px 16px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    cursor: "pointer",
  },
  ctaMicWrap: {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    background: "rgba(255,255,255,0.2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { fontSize: "18px", fontWeight: "900" },
  ctaLabel: { fontSize: "10px", fontWeight: "900", letterSpacing: "1.5px", opacity: 0.85 },
  memoryCard: {
    background: BRAND.lavenderPale,
    border: `2px solid ${BRAND.lavenderDeep}`,
    borderRadius: "16px",
    padding: "14px 16px",
    boxShadow: "3px 4px 0px rgba(77,63,115,0.16)",
  },
  memoryHead: { display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" },
  memoryLabel: {
    fontSize: "12px",
    fontWeight: "900",
    color: BRAND.lavenderDeep,
    letterSpacing: "0.3px",
  },
  memoryTitle: { fontSize: "15px", fontWeight: "900", color: BRAND.ink, margin: "0 0 2px 0" },
  memoryProgress: { fontSize: "13px", color: BRAND.lavenderDeep, margin: 0, fontWeight: "bold" },
  recentHeader: { display: "flex", flexDirection: "column", gap: "2px", marginTop: "4px" },
  sectionEyebrow: {
    fontSize: "10px",
    fontWeight: "900",
    letterSpacing: "1.5px",
    color: inkAlpha.faint,
  },
  recentTitle: { fontSize: "16px", fontWeight: "900", margin: 0, color: BRAND.ink },
  listContainer: { display: "flex", flexDirection: "column", gap: "12px" },
  loadingCard: {
    background: BRAND.card,
    color: BRAND.ink,
    border: "2px solid #111",
    borderRadius: "16px",
    padding: "24px 20px",
    boxShadow: "3px 4px 0px rgba(30,26,38,0.10)",
    textAlign: "center",
  },
  loadingText: { fontSize: "14px", fontWeight: "bold", margin: 0, color: inkAlpha.faint },
  emptyCard: {
    background: BRAND.card,
    color: BRAND.ink,
    border: "2px solid #111",
    borderRadius: "16px",
    padding: "30px 20px",
    boxShadow: "3px 4px 0px rgba(30,26,38,0.10)",
    textAlign: "center",
  },
  emptyTitle: { fontSize: "18px", fontWeight: "900", margin: "0 0 8px 0" },
  emptySub: { fontSize: "13px", color: inkAlpha.muted, margin: 0, lineHeight: "1.4", fontWeight: "bold" },
  card: {
    background: BRAND.card,
    color: BRAND.ink,
    border: "2px solid #111",
    borderRadius: "16px",
    padding: "16px",
    boxShadow: "3px 4px 0px rgba(30,26,38,0.10)",
    cursor: "pointer",
  },
  cardTopRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "8px",
  },
  cardDate: { fontSize: "11px", fontWeight: "900", color: inkAlpha.faint },
  sectionLabel: {
    fontSize: "11px",
    fontWeight: "900",
    color: BRAND.lavenderDeep,
    margin: "0 0 2px 0",
    letterSpacing: "0.5px",
  },
  sectionLabelResponse: {
    fontSize: "11px",
    fontWeight: "900",
    color: BRAND.lavenderDeep,
    margin: "10px 0 2px 0",
    letterSpacing: "0.5px",
  },
  transcriptText: { fontSize: "14px", color: inkAlpha.soft, margin: 0, lineHeight: "1.5", fontStyle: "italic" },
  responseTextStyle: { fontSize: "14px", color: BRAND.ink, margin: 0, lineHeight: "1.5", fontWeight: "bold" },
  expandHint: { fontSize: "11px", color: inkAlpha.faint, margin: "10px 0 0 0", textAlign: "right" },
  bottomNav: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    background: BRAND.card,
    borderTop: "2.5px solid #111",
    display: "flex",
    zIndex: 100,
  },
  navItem: {
    flex: 1,
    background: "transparent",
    border: "none",
    color: inkAlpha.faint,
    padding: "10px 0 14px 0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "3px",
    cursor: "pointer",
  },
  navItemActive: { color: BRAND.lavenderDeep },
  navText: { fontSize: "10px", fontWeight: "900", letterSpacing: "0.5px" },
};
