// app/screens/LettersScreen.tsx
// ============================================================================
// 참견이 편지 — "참견이가 나한테 뭘 가져왔지?"
// ----------------------------------------------------------------------------
// 편지 = 참견이가 먼저 꺼낸 말 한 통. 내가 말해서 돌아온 대답(어항 말풍선)은 편지가 아니다.
// 들어오는 것(사용자에게 종류/카테고리는 보여주지 않고 최신순 한 줄로 같은 모양으로 쌓는다):
//   - 알아챈 거      memory_insights (/api/user/insights) — 만들어지는 즉시
//   - 문자로 보낸 참견 letters (lib/intervention/dispatch.ts가 발송 직후 저장)
//   - 어항에서 꺼낸 말 letters (api/user/proactive-line이 홈에 보여줄 때 저장)
//   - 월말 회고      letters (lib/monthlyReflectionEngine.ts)
// 같은 발견이 문자로도 나갔으면 서버(/api/user/insights)가 알아챈 거 쪽을 빼서 한 번만 보인다.
//
// 열면 전문 + "대답하기". 대답하기는 홈 말풍선에 대답할 때와 같은 녹음 흐름(replyTo)을 그대로 쓴다 —
// 편지에서 끝나지 않고 다시 어항으로 돌아가는 길. 알아챈 거는 기존 "카드로 공유"도 그대로 있다.
// 읽음 처리는 목록이 아니라 실제로 열었을 때만(편지). 알아챈 거는 편지 탭을 연 시각으로 "봤음" 처리.
// ============================================================================
"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import PeekMascot from "@/components/PeekMascot";
import { IconShare } from "@/components/icons";
import { BottomNav, WorldTitle, worldPage, stickerCard, INK, YELLOW, WORLD_CSS, type WorldTab } from "@/components/WorldNav";
import type { LetterSummary, LetterDetail } from "@/lib/letters";

interface LettersScreenProps {
  // 하단 탭 이동 (어항 / 지난 어항 / 편지)
  onNavigate: (tab: WorldTab) => void;
  // Home badge를 실제 DB 상태와 맞추기 위한 콜백. 목록을 불러왔을 때와 편지를 읽었을 때 호출한다.
  onUnreadCountChange?: (count: number) => void;
  // 편지에 대답하기 — 그 편지 내용을 replyTo로 들고 녹음 화면으로 간다(page.tsx).
  onReply: (text: string) => void;
}

interface Insight {
  id: number;
  content: string;
  createdAt: string;
  isNew: boolean;
}

type FeedItem =
  | { key: string; kind: "letter"; id: number; title: string; text: string; createdAt: string; unread: boolean }
  | { key: string; kind: "insight"; id: number; title: string; text: string; createdAt: string; unread: boolean };

// 편지 탭을 마지막으로 연 시각 — app/page.tsx가 홈 배지에서 새 "알아챈 거"를 셀 때 같은 키를 읽는다.
const INSIGHTS_SEEN_KEY = "ganseobi_insights_seen_at";

async function authedFetch(path: string, init?: RequestInit): Promise<Response | null> {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
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

export default function LettersScreen({ onNavigate, onUnreadCountChange, onReply }: LettersScreenProps) {
  const [letters, setLetters] = useState<LetterSummary[] | null>(null);
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [open, setOpen] = useState<FeedItem | null>(null);
  // 이번에 열기 전까지 "봤던" 시각 — 그 뒤에 생긴 알아챈 거만 새 것으로 표시한다.
  const seenBefore = useRef<number>(0);

  useEffect(() => {
    try {
      seenBefore.current = Number(localStorage.getItem(INSIGHTS_SEEN_KEY) || 0);
      localStorage.setItem(INSIGHTS_SEEN_KEY, String(Date.now()));
    } catch {
      /* 저장 못 하면 배지가 한 번 더 보일 뿐 */
    }
    (async () => {
      const [lr, ir] = await Promise.all([
        authedFetch("/api/user/letters").catch(() => null),
        authedFetch("/api/user/insights").catch(() => null),
      ]);
      const lb = lr ? await lr.json().catch(() => null) : null;
      const ib = ir ? await ir.json().catch(() => null) : null;
      if (!lb?.success && !ib?.success) setLoadFailed(true);
      setLetters(lb?.success ? (lb.data as LetterSummary[]) : []);
      setInsights(ib?.success ? (ib.data as Insight[]) : []);
    })();
    // 마운트 시 한 번만 — 콜백 identity 변화로 다시 부르지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 홈 배지: 안 읽은 편지 수. 알아챈 거는 지금 이 화면을 열었으니 봤음 처리됐다.
  useEffect(() => {
    if (letters === null) return;
    onUnreadCountChange?.(letters.filter((l) => l.isUnread).length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letters]);

  const handleRead = (id: number) => {
    setLetters((prev) => (prev ? prev.map((l) => (l.id === id ? { ...l, isUnread: false } : l)) : prev));
  };

  const loading = letters === null || insights === null;
  const feed: FeedItem[] = loading
    ? []
    : [
        ...letters!.map<FeedItem>((l) => ({
          key: `l${l.id}`,
          kind: "letter",
          id: l.id,
          title: l.title,
          text: l.preview,
          createdAt: l.createdAt,
          unread: l.isUnread,
        })),
        ...insights!.map<FeedItem>((i) => ({
          key: `i${i.id}`,
          kind: "insight",
          id: i.id,
          title: "참견이가 알아챈 거",
          text: i.content,
          createdAt: i.createdAt,
          unread: new Date(i.createdAt).getTime() > seenBefore.current,
        })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (open?.kind === "letter") {
    return <LetterDetailView letterId={open.id} onBack={() => setOpen(null)} onRead={handleRead} onReply={onReply} />;
  }
  if (open?.kind === "insight") {
    return <InsightDetailView item={open} onBack={() => setOpen(null)} onReply={onReply} />;
  }

  const unreadNow = letters ? letters.filter((l) => l.isUnread).length : 0;

  return (
    <div style={worldPage}>
      <style dangerouslySetInnerHTML={{ __html: WORLD_CSS }} />
      <WorldTitle>편지</WorldTitle>

      {loading ? (
        <p style={styles.loadingText}>잠깐만.</p>
      ) : feed.length === 0 ? (
        <div style={{ ...stickerCard, ...styles.emptyWrap }}>
          <PeekMascot expression={loadFailed ? "tilt" : "base"} size={60} />
          <p style={styles.emptyTitle}>{loadFailed ? "편지함이 잘 안 열리네." : "아직 넣어둔 편지 없어."}</p>
          <p style={styles.emptySub}>{loadFailed ? "조금 있다 다시 열어볼래?" : "뭐 생각나면 여기다 슬쩍 넣어둘게."}</p>
        </div>
      ) : (
        <div style={styles.feed}>
          {feed.map((item) => (
            <button key={item.key} className="wn-sticker" style={{ ...stickerCard, ...styles.card }} onClick={() => setOpen(item)}>
              <span style={styles.cardTop}>
                <span style={styles.cardTitle}>
                  {item.unread && <span style={styles.unreadDot} aria-hidden />}
                  {item.title}
                </span>
                <span style={styles.dateText}>{formatListDate(item.createdAt)}</span>
              </span>
              <span style={styles.cardText}>&ldquo;{item.text}&rdquo;</span>
              {item.unread && <span style={styles.srOnly}>새 편지</span>}
            </button>
          ))}
        </div>
      )}

      <BottomNav active="letters" onNavigate={onNavigate} unreadLetterCount={unreadNow} />
    </div>
  );
}

// ---- 상세: 편지 ----------------------------------------------------------------
function LetterDetailView({
  letterId,
  onBack,
  onRead,
  onReply,
}: {
  letterId: number;
  onBack: () => void;
  onRead: (id: number) => void;
  onReply: (text: string) => void;
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
    <DetailShell onBack={onBack}>
      {failed ? (
        <div style={styles.emptyWrap}>
          <p style={styles.emptyTitle}>이 편지가 안 열리네.</p>
          <p style={styles.emptySub}>목록으로 돌아가서 다시 눌러볼래?</p>
        </div>
      ) : !letter ? (
        <p style={styles.loadingText}>잠깐만.</p>
      ) : (
        <DetailBody eyebrow={letter.title} date={letter.createdAt} text={letter.content} onReply={() => onReply(letter.content)} />
      )}
    </DetailShell>
  );
}

// ---- 상세: 알아챈 거 ---------------------------------------------------------------
function InsightDetailView({ item, onBack, onReply }: { item: FeedItem; onBack: () => void; onReply: (text: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 카드로 공유 — 기존 동작 그대로(서버 app/api/insight-card가 이미지를 그림, 파일명/제목도 기존 값 유지).
  const share = async () => {
    setBusy(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      if (!session) throw new Error("로그인 세션이 없어.");
      const res = await fetch("/api/insight-card", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ insightId: item.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "카드를 만들지 못했어.");
      }
      const blob = await res.blob();
      const fileName = `참견이_${item.id}.png`;
      const file = new File([blob], fileName, { type: "image/png" });
      if (typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "참견이가 알아챈 거" });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return; // 공유 시트를 그냥 닫은 것
      console.error("[LettersScreen] 공유 실패:", e);
      setError(e.message || "카드를 만들지 못했어.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DetailShell onBack={onBack}>
      <DetailBody
        eyebrow={item.title}
        date={item.createdAt}
        text={item.text}
        onReply={() => onReply(item.text)}
        extra={
          <>
            <button className="wn-sticker" style={styles.shareBtn} onClick={share} disabled={busy}>
              <IconShare style={{ width: 15, height: 15 }} />
              {busy ? "만드는 중..." : "카드로 공유"}
            </button>
            {error && <p style={styles.errorText}>{error}</p>}
          </>
        }
      />
    </DetailShell>
  );
}

function DetailShell({ onBack, children }: { onBack: () => void; children: React.ReactNode }) {
  return (
    <div style={{ ...worldPage, paddingBottom: "calc(40px + env(safe-area-inset-bottom, 0px))" }}>
      <style dangerouslySetInnerHTML={{ __html: WORLD_CSS + DETAIL_CSS }} />
      <WorldTitle onBack={onBack}>편지</WorldTitle>
      {children}
    </div>
  );
}

function DetailBody({
  eyebrow,
  date,
  text,
  onReply,
  extra,
}: {
  eyebrow: string;
  date: string;
  text: string;
  onReply: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <article className="ganseobi-letter-in" style={styles.letterWrap}>
      <div style={styles.letterMeta}>
        <span style={styles.letterEyebrow}>{eyebrow}</span>
        <span style={styles.letterDate}>{formatDetailDate(date)}</span>
      </div>
      <div style={{ ...stickerCard, ...styles.letterPaper }}>
        <p style={styles.letterContent}>{text}</p>
      </div>
      <div style={styles.actions}>
        <button className="wn-sticker" style={styles.replyBtn} onClick={onReply}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
            <rect x="8.5" y="3" width="7" height="12" rx="3.5" fill="#FFFFFF" stroke={INK} strokeWidth={2.2} />
            <path d="M5.5 11.5 C5.5 15.5 8.5 18 12 18 C15.5 18 18.5 15.5 18.5 11.5" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
          </svg>
          대답하기
        </button>
        {extra}
      </div>
      <div style={styles.letterFooter}>
        <PeekMascot expression="base" size={52} />
      </div>
    </article>
  );
}

const DETAIL_CSS = `
@keyframes ganseobiLetterIn { 0% { opacity: 0; transform: translateY(6px); } 100% { opacity: 1; transform: translateY(0); } }
.ganseobi-letter-in { animation: ganseobiLetterIn 0.28s ease-out; }
@media (prefers-reduced-motion: reduce) { .ganseobi-letter-in { animation: none; } }
`;

const styles: { [key: string]: React.CSSProperties } = {
  loadingText: { fontSize: 15, color: "rgba(27,22,48,.55)", margin: "24px 0 0", textAlign: "center" },

  emptyWrap: { padding: "28px 16px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 },
  emptyTitle: { fontSize: 18, color: INK, margin: "6px 0 0" },
  emptySub: { fontSize: 14, color: "rgba(27,22,48,.6)", margin: 0, lineHeight: 1.5 },

  feed: { display: "flex", flexDirection: "column", gap: 12 },
  card: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "14px 16px",
    textAlign: "left",
    cursor: "pointer",
    color: INK,
    position: "relative",
  },
  cardTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
  cardTitle: { display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "#4D3F73" },
  unreadDot: { width: 8, height: 8, borderRadius: "50%", background: "#FF5B4A", border: `1.5px solid ${INK}`, flexShrink: 0 },
  dateText: { fontSize: 12, color: "rgba(27,22,48,.5)", flexShrink: 0 },
  cardText: {
    fontSize: 16,
    lineHeight: 1.45,
    wordBreak: "keep-all",
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  srOnly: { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" },

  letterWrap: { display: "flex", flexDirection: "column", gap: 14, marginTop: 4 },
  letterMeta: { display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0 4px" },
  letterEyebrow: { fontSize: 14, color: "#4D3F73" },
  letterDate: { fontSize: 13, color: "rgba(27,22,48,.5)" },
  letterPaper: { padding: "26px 22px" },
  letterContent: { fontSize: 17, lineHeight: 1.75, color: INK, margin: 0, whiteSpace: "pre-line", wordBreak: "keep-all" },
  actions: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 },
  replyBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    minHeight: 46,
    padding: "0 18px",
    borderRadius: 999,
    border: `3px solid ${INK}`,
    background: YELLOW,
    boxShadow: `3px 3px 0 ${INK}`,
    fontSize: 16,
    color: INK,
    cursor: "pointer",
  },
  shareBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    minHeight: 46,
    padding: "0 16px",
    borderRadius: 999,
    border: `3px solid ${INK}`,
    background: "#FFFFFF",
    boxShadow: `3px 3px 0 ${INK}`,
    fontSize: 15,
    color: INK,
    cursor: "pointer",
  },
  errorText: { width: "100%", margin: 0, fontSize: 13, color: "#C24444" },
  letterFooter: { display: "flex", justifyContent: "flex-end", paddingRight: 6 },
};
