//
// 참견이의 편지 — 참견이가 먼저 가져온 말들을 모아보는 작은 우편함.
// "내가 남긴 기록을 찾아보는" 기록/MEMORY 화면과 달리, 여기는 "참견이가 나한테 뭔가 가져온" 것만 있다.
// 목록 → 상세를 이 컴포넌트 안에서 전환한다(page.tsx에는 Step "letters" 하나만 추가).
// 읽음 처리는 목록을 렌더링할 때가 아니라, 상세 화면에 실제로 들어갔을 때만 한다.
// source_type 등 내부 값은 서버가 애초에 내려주지 않으므로 이 화면은 편지 종류와 무관하게 똑같이 그린다.
"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { BRAND, inkAlpha, pageBackground, tactile, TACTILE_PRESS_CLASS } from "@/lib/theme";
import Mascot from "@/components/Mascot";
import type { LetterSummary, LetterDetail } from "@/lib/letters";

interface LettersScreenProps {
  onBack: () => void;
  // Home badge를 실제 DB 상태와 맞추기 위한 콜백. 목록을 불러왔을 때와 편지를 읽었을 때 호출한다.
  onUnreadCountChange?: (count: number) => void;
}

async function authedFetch(path: string, init?: RequestInit): Promise<Response | null> {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return null;
  return fetch(path, {
    ...init,
    headers: { ...(init?.headers || {}), Authorization: `Bearer ${session.access_token}` },
  });
}

function formatListDate(iso: string): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return sameYear ? `${d.getMonth() + 1}.${d.getDate()}` : `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

function formatDetailDate(iso: string): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return sameYear ? `${d.getMonth() + 1}월 ${d.getDate()}일` : `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export default function LettersScreen({ onBack, onUnreadCountChange }: LettersScreenProps) {
  const [letters, setLetters] = useState<LetterSummary[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await authedFetch("/api/user/letters");
        const body = res ? await res.json() : null;
        if (body?.success) {
          const list: LetterSummary[] = body.data;
          setLetters(list);
        } else {
          setLoadFailed(true);
          setLetters([]);
        }
      } catch (e) {
        console.error("[LettersScreen] fetch letters failed:", e);
        setLoadFailed(true);
        setLetters([]);
      }
    })();
    // 마운트 시 한 번만 — 콜백 identity 변화로 다시 부르지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 목록을 실제로 불러온 뒤(실패 제외)와 읽음 처리 뒤에 Home badge 개수를 목록 기준으로 맞춘다.
  // 추가 요청 없이, 방금 서버에서 받은 실제 상태에서 센다.
  useEffect(() => {
    if (letters === null || loadFailed) return;
    onUnreadCountChange?.(letters.filter((l) => l.isUnread).length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letters, loadFailed]);

  // 상세 화면에서 읽음 처리가 끝나면 목록의 unread 표시를 뗀다(badge는 위 effect가 따라 맞춘다).
  const handleRead = (id: number) => {
    setLetters((prev) => (prev ? prev.map((l) => (l.id === id ? { ...l, isUnread: false } : l)) : prev));
  };

  if (openId !== null) {
    return <LetterDetailView letterId={openId} onBack={() => setOpenId(null)} onRead={handleRead} />;
  }

  return (
    <div style={styles.container}>
      <button className={TACTILE_PRESS_CLASS} style={styles.backButton} onClick={onBack}>← 뒤로</button>

      <div style={styles.topSection}>
        <Mascot pose="기본" size={56} />
        <h1 style={styles.headline}>참견이의 편지</h1>
      </div>

      {letters === null ? (
        <p style={styles.loadingText}>잠깐만.</p>
      ) : letters.length === 0 ? (
        <div style={styles.emptyWrap}>
          <p style={styles.emptyTitle}>{loadFailed ? "편지함이 잘 안 열리네." : "아직 넣어둔 편지 없어."}</p>
          <p style={styles.emptySub}>
            {loadFailed ? "조금 있다 다시 열어볼래?" : "뭐 생각나면 여기다 슬쩍 넣어둘게."}
          </p>
        </div>
      ) : (
        <div style={styles.list}>
          {letters.map((letter, i) => (
            <button
              key={letter.id}
              className={TACTILE_PRESS_CLASS}
              style={{ ...styles.row, ...(i > 0 ? styles.rowDivider : null) }}
              onClick={() => setOpenId(letter.id)}
            >
              <span style={{ ...styles.unreadDot, ...(letter.isUnread ? null : styles.unreadDotHidden) }} aria-hidden />
              <span style={styles.rowBody}>
                <span style={styles.rowTop}>
                  <span style={letter.isUnread ? styles.titleUnread : styles.titleRead}>{letter.title}</span>
                  <span style={styles.dateText}>{formatListDate(letter.createdAt)}</span>
                </span>
                {letter.preview && <span style={styles.previewText}>{letter.preview}</span>}
              </span>
              {letter.isUnread && <span style={styles.srOnly}>안 읽은 편지</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LetterDetailView({
  letterId,
  onBack,
  onRead,
}: {
  letterId: number;
  onBack: () => void;
  onRead: (id: number) => void;
}) {
  const [letter, setLetter] = useState<LetterDetail | null>(null);
  const [failed, setFailed] = useState(false);
  // StrictMode 이중 effect 등으로 같은 편지에 읽음 요청이 두 번 나가지 않게.
  const markedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch(`/api/user/letters/${letterId}`);
        const body = res ? await res.json() : null;
        if (cancelled) return;
        if (!body?.success) {
          setFailed(true);
          return;
        }
        const detail: LetterDetail = body.data;
        setLetter(detail);

        // 실제 상세 화면에 편지가 떠 있는 상태 = 읽음. 이미 읽은 편지면 요청하지 않는다.
        if (detail.isUnread && !markedRef.current) {
          markedRef.current = true;
          const readRes = await authedFetch(`/api/user/letters/${letterId}`, { method: "POST" });
          const readBody = readRes ? await readRes.json().catch(() => null) : null;
          if (readBody?.success) onRead(letterId);
          else markedRef.current = false;
        }
      } catch (e) {
        console.error("[LettersScreen] fetch letter failed:", e);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letterId]);

  return (
    <div style={styles.container}>
      <button className={TACTILE_PRESS_CLASS} style={styles.backButton} onClick={onBack}>← 뒤로</button>

      {failed ? (
        <div style={styles.emptyWrap}>
          <p style={styles.emptyTitle}>이 편지가 안 열리네.</p>
          <p style={styles.emptySub}>목록으로 돌아가서 다시 눌러볼래?</p>
        </div>
      ) : !letter ? (
        <p style={styles.loadingText}>잠깐만.</p>
      ) : (
        <article className="ganseobi-letter-in" style={styles.letterWrap}>
          <style>{`
            @keyframes ganseobiLetterIn {
              0% { opacity: 0; transform: translateY(6px); }
              100% { opacity: 1; transform: translateY(0); }
            }
            .ganseobi-letter-in { animation: ganseobiLetterIn 0.28s ease-out both; }
            @media (prefers-reduced-motion: reduce) { .ganseobi-letter-in { animation: none; } }
          `}</style>
          <div style={styles.letterMeta}>
            <span style={styles.letterEyebrow}>참견이의 편지</span>
            <span style={styles.letterDate}>{formatDetailDate(letter.createdAt)}</span>
          </div>
          <div style={styles.letterPaper}>
            <p style={styles.letterContent}>{letter.content}</p>
          </div>
          <div style={styles.letterFooter}>
            <Mascot pose="기억남" size={52} />
          </div>
        </article>
      )}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    ...pageBackground,
    color: BRAND.ink,
    boxSizing: "border-box",
    maxWidth: "480px",
    marginLeft: "auto",
    marginRight: "auto",
    paddingTop: "max(32px, calc(env(safe-area-inset-top, 0px) + 24px))",
    paddingRight: 20,
    paddingBottom: "calc(40px + env(safe-area-inset-bottom, 0px))",
    paddingLeft: 20,
  },
  backButton: {
    ...tactile.ghostButton,
    border: "none",
    fontSize: 14,
    fontWeight: 600,
    padding: "10px 12px 10px 0",
    margin: "-10px 0 6px -4px",
  },
  topSection: { display: "flex", alignItems: "center", gap: 12, marginBottom: 20 },
  headline: { color: BRAND.ink, fontSize: 20, fontWeight: 800, margin: 0 },
  loadingText: { fontSize: 14, color: inkAlpha.faint, fontWeight: 500, margin: "24px 0 0 0", textAlign: "center" },

  // 빈 상태 — 카드 없이 담백하게.
  emptyWrap: { padding: "48px 12px", textAlign: "center" },
  emptyTitle: { fontSize: 16, fontWeight: 700, color: inkAlpha.soft, margin: "0 0 8px 0" },
  emptySub: { fontSize: 13, fontWeight: 500, color: inkAlpha.faint, margin: 0, lineHeight: 1.5 },

  // 목록 — 카드를 여러 장 쌓지 않고, 표면 하나 안에 얇은 구분선으로만 나눈다.
  list: { ...tactile.card, padding: "4px 0", overflow: "hidden" },
  row: {
    width: "100%",
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "14px 16px",
    background: "transparent",
    border: "none",
    textAlign: "left",
    cursor: "pointer",
    color: BRAND.ink,
    position: "relative",
  },
  rowDivider: { borderTop: `1px solid ${inkAlpha.hairline}` },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: BRAND.lavender,
    flexShrink: 0,
    marginTop: 7,
  },
  unreadDotHidden: { background: "transparent" },
  rowBody: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 },
  rowTop: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 },
  titleUnread: { fontSize: 15, fontWeight: 800, color: BRAND.ink, lineHeight: 1.4 },
  titleRead: { fontSize: 15, fontWeight: 600, color: inkAlpha.soft, lineHeight: 1.4 },
  dateText: { fontSize: 11, fontWeight: 600, color: inkAlpha.faint, flexShrink: 0 },
  previewText: {
    fontSize: 13,
    fontWeight: 500,
    color: inkAlpha.faint,
    lineHeight: 1.45,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  },

  // 상세 — 편지지 질감/빈티지 장식 없이, 표면 하나 위에 글만.
  letterWrap: { display: "flex", flexDirection: "column", gap: 14, marginTop: 8 },
  letterMeta: { display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0 4px" },
  letterEyebrow: { fontSize: 12, fontWeight: 700, color: BRAND.lavenderDeep, letterSpacing: "0.02em" },
  letterDate: { fontSize: 12, fontWeight: 600, color: inkAlpha.faint },
  letterPaper: { ...tactile.card, padding: "26px 22px" },
  letterContent: {
    fontSize: 16,
    fontWeight: 500,
    lineHeight: 1.75,
    color: BRAND.ink,
    margin: 0,
    whiteSpace: "pre-line",
    wordBreak: "keep-all",
  },
  letterFooter: { display: "flex", justifyContent: "flex-end", paddingRight: 6 },
};
