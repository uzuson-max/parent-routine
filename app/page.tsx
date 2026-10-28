"use client";

// ============================================================================
// 참견이 — 내레이터 버전 (2026-10-28)
// 첫 화면: 수달과 마주 보는 대화창(HeroScreen) / 두 번째 탭: 지난 이야기(ChronicleScreen).
// 어항·심해·소라 징검다리·편지·걱정 병 화면은 이 흐름에서 뺐다(파일은 보관 — ARCHIVE.md).
// 온보딩·필수 체크리스트(로그인)·MY 설정 시트는 그대로 쓴다.
// ============================================================================
import { useEffect, useRef, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { handleOAuthReturn, isProtectedUser } from "@/lib/socialAuthClient";
import OnboardingScreen from "./screens/OnboardingScreen";
import OnboardingChecklistScreen from "./screens/OnboardingChecklistScreen";
import MyPageScreen, { prefetchMyPage } from "./screens/MyPageScreen";
import HeroScreen, { type NarratorLine, type HeroAction } from "./screens/HeroScreen";
import ChronicleScreen from "./screens/ChronicleScreen";
import SplashScreen from "@/components/SplashScreen";
import type { CloseUpExpression } from "@/components/OtterCloseUp";
import { releaseMicStream } from "@/lib/micStream";

const ONBOARDING_KEY = "ganseobi_onboarding_completed";
const LINE_CACHE_KEY = "narrator_line_v1";
const LINE_TTL_MS = 3 * 60 * 60 * 1000; // 3시간 안에 다시 열면 GPT 없이 마지막 해설을 그대로 보여준다
const EXPRESSIONS: CloseUpExpression[] = ["stare", "smug", "wow", "hmm", "soft"];

type Step = "onboarding" | "setup_checklist" | "hero" | "chronicle";

const asExpression = (e: unknown): CloseUpExpression => (EXPRESSIONS.includes(e as CloseUpExpression) ? (e as CloseUpExpression) : "stare");

function readCache(): { line: NarratorLine; chapter: number | null } | null {
  try {
    const raw = localStorage.getItem(LINE_CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (!c?.line?.text || Date.now() - Number(c.at) > LINE_TTL_MS) return null;
    return { line: { ...c.line, key: Date.now() }, chapter: c.chapter ?? null };
  } catch {
    return null;
  }
}

function writeCache(line: NarratorLine, chapter: number | null) {
  try {
    localStorage.setItem(LINE_CACHE_KEY, JSON.stringify({ at: Date.now(), line, chapter }));
  } catch {
    /* 저장 못 해도 그만 */
  }
}

export default function Home() {
  const [step, setStep] = useState<Step>("hero");
  const [myOpen, setMyOpen] = useState(false);
  const [chapter, setChapter] = useState<number | null>(null);
  const [line, setLine] = useState<NarratorLine | null>(null);
  const [heard, setHeard] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [action, setAction] = useState<HeroAction>(null);
  const [pending, setPending] = useState<Blob | string | null>(null); // 다시 보내기 / "맞아?" 확인 대기 중인 녹음
  const uploadSeq = useRef(0);
  const chapterRef = useRef<number | null>(null);
  chapterRef.current = chapter;

  const showLine = (l: Omit<NarratorLine, "key">) => {
    const full = { ...l, key: Date.now() };
    setLine(full);
    writeCache(full, chapterRef.current);
  };

  // ---- 앱을 켰을 때 참견이가 먼저 하는 해설 -------------------------------
  const loadOpening = async () => {
    const cached = readCache();
    if (cached) {
      setLine(cached.line);
      setChapter(cached.chapter);
      return;
    }
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/narrator/opening", { headers: { Authorization: `Bearer ${session.access_token}` } });
      const body = await res.json();
      if (!body.success) throw new Error(body.error);
      const d = body.data;
      setChapter(d.chapter ?? null);
      chapterRef.current = d.chapter ?? null;
      showLine({ text: d.line, expression: asExpression(d.expression), recalled: d.recalled ?? null });
    } catch (e) {
      console.error("[Home] opening failed:", e);
      setLine({ text: "주인공이 돌아왔다. 참견이는 조개를 내려놓았다.", expression: "stare", key: Date.now() });
    }
  };

  useEffect(() => {
    (async () => {
      const fromOAuth = new URL(window.location.href).searchParams.has("auth");
      if (await handleOAuthReturn()) return;
      if (fromOAuth && sessionStorage.getItem("ganseobi_first_run") === "1") setStep("setup_checklist");

      const onboardingDone = localStorage.getItem(ONBOARDING_KEY);
      if (!onboardingDone) setStep("onboarding");

      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      if (!session) {
        const { error } = await supabaseClient.auth.signInAnonymously();
        if (error) console.error("[auth] 익명 로그인 실패:", error.message);
      }
      loadOpening();
      setTimeout(prefetchMyPage, 2000);

      if (onboardingDone) {
        const {
          data: { user },
        } = await supabaseClient.auth.getUser();
        if (!isProtectedUser(user)) setStep("setup_checklist");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (step !== "hero") releaseMicStream();
  }, [step]);

  // ---- 말(녹음/글) 보내기 -------------------------------------------------
  const upload = async (input: Blob | string, speechConfirmed = false) => {
    const seq = ++uploadSeq.current;
    const isCurrent = () => seq === uploadSeq.current;
    let heardDone = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    setAction(null);
    setHeard(null);
    setThinking(true);
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      if (!session) throw new Error("no session");
      const form = new FormData();
      if (typeof input === "string") form.append("text", input);
      else form.append("audio", input, "recording.webm");
      form.append("phone", localStorage.getItem("ganseobi_phone") || "");
      form.append("persona", "coach");
      if (line?.text) form.append("topic", line.text); // 방금 참견이가 한 해설에 대한 대답
      if (speechConfirmed) form.append("speech_confirmed", "1");

      const res = await fetch("/api/voice/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "x-upload-stream": "1" },
        body: form,
        signal: controller.signal,
      });
      const { status, body } = await readUploadResponse(res, (t) => {
        heardDone = true;
        if (isCurrent()) setHeard(t.transcript);
      });
      if (!isCurrent()) return;
      if (status >= 400 || !body?.success) throw new Error(body?.error || `upload ${status}`);

      if (body.data?.no_speech) {
        showLine({ text: "주인공은 입을 열었으나, 아무 소리도 나지 않았다.", expression: "hmm" });
        return;
      }
      if (body.data?.needs_confirm) {
        setPending(input);
        setAction({ kind: "confirm", text: String(body.data.transcript || "") });
        return;
      }
      const r = body.data?.response;
      showLine({
        text: r?.response || "주인공은 무언가를 말했다. 참견이는 일단 들어두었다.",
        expression: asExpression(r?.expression),
        recalled: r?.recalled ? { quote: r.recalled.quote, at: r.recalled.at } : null,
      });
    } catch (e: any) {
      console.error("[Home] upload failed:", e?.message);
      releaseMicStream();
      if (!isCurrent()) return;
      if (heardDone) {
        showLine({ text: "참견이는 분명 들었다. 그런데 붓이 부러졌다. 조금 뒤에 다시 말을 걸어보자.", expression: "hmm" });
      } else {
        setPending(input);
        setLine({ text: "주인공의 말이 참견이에게 닿지 못했다. 녹음은 그대로 남아 있다.", expression: "hmm", key: Date.now() });
        setAction({ kind: "retry" });
      }
    } finally {
      clearTimeout(timeout);
      if (isCurrent()) {
        setThinking(false);
        setHeard(null);
      }
    }
  };

  return (
    <div style={{ minHeight: "100dvh", backgroundColor: "#13321F" }}>
      <SplashScreen />

      {step === "onboarding" && (
        <OnboardingScreen
          onComplete={() => {
            localStorage.setItem(ONBOARDING_KEY, "1");
            sessionStorage.setItem("ganseobi_first_run", "1");
            setStep("setup_checklist");
          }}
        />
      )}

      {step === "setup_checklist" && (
        <OnboardingChecklistScreen
          onDone={() => {
            sessionStorage.removeItem("ganseobi_first_run");
            setStep("hero");
          }}
        />
      )}

      {step === "hero" && (
        <HeroScreen
          chapter={chapter}
          line={line}
          heard={heard}
          thinking={thinking}
          action={action}
          onSend={(input) => upload(input)}
          onConfirm={(yes) => {
            const p = pending;
            setPending(null);
            setAction(null);
            if (yes && p) upload(p, true);
            else showLine({ text: "주인공은 방금 한 말을 거두었다. 없던 일이 되었다.", expression: "stare" });
          }}
          onRetry={() => {
            const p = pending;
            setPending(null);
            setAction(null);
            if (p) upload(p);
          }}
          onOpenMy={() => {
            releaseMicStream();
            setMyOpen(true);
          }}
          onOpenChronicle={() => {
            setMyOpen(false);
            setStep("chronicle");
            window.scrollTo(0, 0);
          }}
        />
      )}

      {step === "hero" && myOpen && (
        <MyPageScreen
          asSheet
          onBack={() => setMyOpen(false)}
          onOpenRecords={() => {
            setMyOpen(false);
            setStep("chronicle");
          }}
        />
      )}

      {step === "chronicle" && (
        <ChronicleScreen
          onHero={() => {
            setStep("hero");
            window.scrollTo(0, 0);
          }}
        />
      )}
    </div>
  );
}

// 업로드 응답 읽기 — 서버가 2단계(NDJSON)로 보내면 받아쓰기 줄을 먼저 넘기고, 마지막 줄의 결과를 돌려준다.
async function readUploadResponse(
  res: Response,
  onTranscript: (t: { transcript: string; entry_id: string }) => void
): Promise<{ status: number; body: any }> {
  const ctype = res.headers.get("content-type") || "";
  if (!ctype.includes("ndjson") || !res.body) {
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let final: { status: number; body: any } | null = null;
  const handle = (raw: string) => {
    if (!raw.trim()) return;
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg?.stage === "transcript" && typeof msg.transcript === "string") onTranscript(msg);
    else if (msg?.stage === "final") final = { status: Number(msg.status) || 500, body: msg.body };
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      handle(buf.slice(0, i));
      buf = buf.slice(i + 1);
    }
  }
  handle(buf);
  if (!final) throw new Error("응답이 중간에 끊겼어");
  return final;
}
