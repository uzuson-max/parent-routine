"use client";
import { useEffect, useRef, useState } from "react";
import { browserClient } from "@/lib/supabaseBrowser";
import { Baby, Envelope, LP, Mic, MomOnSofa } from "@/components/Illust";
import { quietAmbient, startAmbient, stopAmbient, toggleMute } from "@/lib/ambient";
import { koDate } from "@/lib/time";
import { josa } from "@/lib/korean";
import { mmss, useRecorder, type Kind } from "@/lib/useRecorder";

type Reaction = { about: string; text: string | null; audioUrl: string | null };
type Info = {
  text: string;
  lead: string | null;
  hint: string | null;
  format: Kind;
  answered: boolean;
  honorific: string;
  childName: string;
  unsealAt: string | null;
  childAudioUrl: string | null;
  photoUrl: string | null;
  reactions: Reaction[];
  next?: { day: string; lead: string | null } | null;
};
type Phase = "loading" | "error" | "intro" | "ask" | "review" | "sending" | "thinking" | "host" | "done" | "later";

const MAX_TURNS = 2;

// 장면은 한 문장씩, 이 간격(초)으로 천천히 떠오른다
const BEAT = 2.8;

// 한 글자짜리 낱말(해 질 녘, 다 버거운…)은 뒤 낱말과 붙여서 그 사이에서 줄이 바뀌지 않게
function glue(t: string) {
  const w = t.split(" ");
  return w.reduce((acc, cur, i) => (i === 0 ? cur : acc + (w[i - 1].length === 1 ? "\u00a0" : " ") + cur), "");
}

function splitLead(lead: string) {
  return lead.replace(/([.?!요])\s+/g, "$1\n").split("\n").map((x) => x.trim()).filter(Boolean).map(glue);
} // 첫 대답 뒤 이어 말하기 최대 2번

export default function ParentPage({ params }: { params: { token: string } }) {
  const log = (kind: string, detail?: any) => {
    try {
      const body = JSON.stringify({ kind, detail });
      if (kind === "leave" && navigator.sendBeacon) navigator.sendBeacon(`/api/s/${params.token}/event`, new Blob([body], { type: "application/json" }));
      else fetch(`/api/s/${params.token}/event`, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
    } catch {}
  };
  const [info, setInfo] = useState<Info | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [err, setErr] = useState("");
  const [unsealAt, setUnsealAt] = useState<string | null>(null);
  const [turn, setTurn] = useState(0);
  const [kind, setKind] = useState<Kind>("audio");
  const [asked, setAsked] = useState("");
  const [host, setHost] = useState<{ react: string; followup: string | null; video?: boolean; song?: boolean } | null>(null);
  const [ready, setReady] = useState(false);
  const r = useRecorder();
  const live = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    fetch(`/api/s/${params.token}`)
      .then((res) => res.json().then((j) => ({ ok: res.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) throw new Error(j.error);
        setInfo(j);
        setUnsealAt(j.unsealAt);
        setKind(j.format);
        setAsked(j.text);
        setPhase(j.answered ? "done" : "intro");
        log("open", { answered: !!j.answered });
        // 빌드업을 한 줄씩 천천히 보여준 뒤 질문과 버튼이 나온다 (시간여행)

      })
      .catch((e) => {
        setErr(e.message || "링크를 열 수 없어요");
        setPhase("error");
      });
  }, [params.token]);

  useEffect(() => {
    if (live.current && r.stream && kind === "video") {
      live.current.srcObject = r.stream;
      live.current.play().catch(() => {});
    }
  }, [r.stream, kind]);

  useEffect(() => {
    if (r.blob && !r.recording) setPhase("review");
  }, [r.blob, r.recording]);

  // 녹음이 끊겼는데 담긴 게 없으면: 보내기 대신 다시 녹음하도록
  useEffect(() => {
    if (r.failed && !r.recording && !r.blob) {
      setErr("녹음이 중간에 끊겨서 저장되지 않았어요. 한 번만 다시 눌러주세요.");
      setPhase("ask");
    } else if (r.failed && r.blob) {
      setErr("녹음이 중간에 끊겼어요. 여기까지 담긴 걸 보내거나, 다시 녹음할 수 있어요.");
    }
  }, [r.failed, r.recording, r.blob]);

  // 녹음하는 동안은 음악을 완전히 내려 목소리에 섞이지 않게
  // 녹음 시작·끝·실패 기록
  const recRef = useRef(false);
  useEffect(() => {
    if (r.recording && !recRef.current) log("rec_start", { turn, kind });
    if (!r.recording && recRef.current) log("rec_stop", { turn, sec: r.sec });
    recRef.current = r.recording;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.recording]);
  useEffect(() => {
    if (r.failed) log("rec_fail", { turn, sec: r.sec, hasBlob: !!r.blob });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.failed]);
  // 창을 닫거나 다른 앱으로 갈 때 마지막 단계
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") log("leave", { phase: phaseRef.current }); };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 음악은 장면을 읽는 동안에만. 녹음이 시작되면 바로 끄고 다시 틀지 않는다 (목소리·다시 듣기에 섞이지 않게)
  useEffect(() => {
    if (r.recording) quietAmbient(0);
  }, [r.recording]);

  const [soundOff, setSoundOff] = useState(false);

  // "이야기 시작하기": 이 누름이 있어야 휴대폰이 소리를 허락한다
  function begin(withSound: boolean) {
    if (withSound) startAmbient();
    log(withSound ? "begin" : "begin_silent");
    setPhase("ask");
    const n = info?.lead ? splitLead(info.lead).length : 0;
    setTimeout(() => setReady(true), n ? (0.6 + n * BEAT + 1.6) * 1000 : 400);
  }

  const limit = turn === 0 ? (kind === "video" ? 180 : 900) : kind === "video" ? 90 : 300;

  async function start() {
    setErr("");
    quietAmbient(0); // 녹음 버튼을 누르는 순간 바로 끈다
    try {
      await r.start(kind, limit);
    } catch {
      setErr("마이크(카메라) 사용을 허용해 주셔야 해요. 화면 위쪽 알림에서 '허용'을 눌러주세요.");
    }
  }

  async function send() {
    if (!r.blob || !r.blob.size) {
      setErr("녹음이 비어 있어요. 다시 녹음해 주세요.");
      setPhase("ask");
      return;
    }
    const blob = r.blob;
    log("send", { turn, sec: r.sec, bytes: blob.size });
    setPhase("sending");
    setErr("");
    try {
      const u = await fetch(`/api/s/${params.token}/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mime: blob.type }),
      }).then((x) => x.json());
      if (!u.path) throw new Error(u.error);
      const { error } = await browserClient()
        .storage.from("vf-media")
        .uploadToSignedUrl(u.path, u.uploadToken, blob, { contentType: blob.type });
      if (error) throw error;
      const c = await fetch(`/api/s/${params.token}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: u.path, mime: blob.type, duration: r.sec, turn, asked, kind }),
      }).then((x) => x.json());
      if (c.empty) {
        setErr("녹음이 제대로 올라가지 않았어요. 한 번만 다시 녹음해 주세요.");
        r.reset();
        setPhase("ask");
        return;
      }
      if (!c.ok) throw new Error(c.error);
      setUnsealAt(c.unsealAt);
      log("sent", { turn });
      r.reset();

      // 진행자 한마디 + 이어지는 질문
      setPhase("thinking");
      const h = await fetch(`/api/s/${params.token}/next`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answerId: c.answerId }),
      })
        .then((x) => x.json())
        .catch(() => ({ react: "말씀 잘 들었어요.", followup: null }));
      if (h.followup && turn < MAX_TURNS) {
        setHost(h);
        setPhase("host");
      } else {
        setHost(h);
        finish();
      }
    } catch {
      setErr("보내지 못했어요. 인터넷 연결을 확인하고 다시 눌러주세요.");
      setPhase("review");
    }
  }

  function continueTalk() {
    setReady(true);
    if (!host?.followup) return;
    setAsked(host.followup);
    setKind(host.video ? "video" : "audio");
    setTurn((t) => t + 1);
    setPhase("ask");
  }

  function finish() {
    stopAmbient(5);
    log("finish", { turn });
    fetch(`/api/s/${params.token}/finish`, { method: "POST" }).catch(() => {});
    setPhase("done");
  }

  async function later() {
    log("later");
    await fetch(`/api/s/${params.token}/later`, { method: "POST" }).catch(() => {});
    setPhase("later");
  }

  if (phase === "loading") return <main className="screen center"><p className="muted">잠시만요…</p></main>;
  if (phase === "error" || !info)
    return (
      <main className="screen center">
        <div className="grow" />
        <p className="serif q">{err || "링크를 열 수 없어요"}</p>
        <div className="grow" />
      </main>
    );

  const c = info.childName;
  const isVideo = kind === "video";
  const toChild = `${c}에게 바로 전해져요`; // 이야기 열리는 날 기능은 뺐음

  if (phase === "intro")
    return (
      <main className="screen center boxed" style={{ paddingTop: 96 }}>
        <LP size={92} className="intro-lp" />
        <p className="tiny muted" style={{ margin: "28px 0 0", letterSpacing: "0.12em" }}>우리집 레코드</p>
        <h1 className="serif" style={{ margin: "14px 0 0", fontSize: 26, lineHeight: 1.5 }}>
          {josa(info.childName, "이/가")} 보낸
          <br />
          이번 주 질문이 도착했어요
        </h1>
        <p className="muted" style={{ margin: "18px 0 0", fontSize: 16, lineHeight: 1.7 }}>
          조용한 곳에서 소리를 켜고 들어주세요.
          <br />
          잔잔한 음악과 함께 천천히 시작해요.
        </p>
        <div className="grow" />
        <button className="btn" onClick={() => begin(true)}>이야기 시작하기</button>
        <button className="link" style={{ marginTop: 6 }} onClick={() => begin(false)}>음악 없이 시작할게요</button>
        <p className="tiny muted" style={{ margin: "10px 0 0", lineHeight: 1.6 }}>
          남겨주신 이야기는 가족에게만 전해져요. <a href="/privacy">개인정보처리방침</a>
        </p>
      </main>
    );

  if (phase === "done")
    return (
      <main className="screen center" style={{ paddingTop: 48 }}>
        <div style={{ transform: "scale(.72)", transformOrigin: "center top", marginBottom: -40 }}>
          <Envelope />
        </div>
        {host?.react && <p className="muted" style={{ margin: "8px 0 0", fontSize: 17 }}>{host.react}</p>}
        <h1 className="serif" style={{ margin: "10px 0 0", fontSize: 28 }}>오늘 이야기, 잘 담았어요.</h1>
        <p className="muted" style={{ margin: "10px 0 0", fontSize: 18, lineHeight: 1.6 }}>
          {info.honorific}의 이야기는 {toChild}.
        </p>
        {info.next ? (
          <div
            className="card stack"
            style={{ gap: 14, textAlign: "left", width: "100%", marginTop: 36, padding: "26px 22px", border: "2px solid var(--accent)" }}
          >
            <div className="row" style={{ gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.04em" }}>다음 이야기</span>
              <span style={{ fontSize: 22, fontWeight: 800 }}>{info.next.day}</span>
              <span style={{ fontSize: 17 }}>에 문자로 와요</span>
            </div>
            {info.next.lead ? (
              <p className="serif" style={{ margin: 0, fontSize: 22, lineHeight: 1.6, whiteSpace: "pre-line", wordBreak: "keep-all" }}>
                {info.next.lead}
              </p>
            ) : (
              <p style={{ margin: 0, fontSize: 20, lineHeight: 1.6 }}>{info.childName}의 다음 질문이 준비돼 있어요.</p>
            )}
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6, opacity: 0.8 }}>그날까지 천천히 떠올려 두세요.</p>
          </div>
        ) : (
          <p style={{ marginTop: 32, fontSize: 18 }}>{info.childName}에게 이야기가 잘 전해졌어요</p>
        )}
        <div className="grow" />
      </main>
    );

  if (phase === "later")
    return (
      <main className="screen center" style={{ paddingTop: 110 }}>
        <MomOnSofa />
        <h1 className="serif" style={{ margin: "32px 0 0", fontSize: 26 }}>괜찮아요.</h1>
        <p className="muted" style={{ fontSize: 17, lineHeight: 1.7 }}>
          편하실 때 같은 링크를 다시 눌러주세요.
          <br />
          이따가 한 번 더 알려드릴게요.
        </p>
      </main>
    );

  if (phase === "thinking")
    return (
      <main className="screen center" style={{ paddingTop: 140 }}>
        <span className="rec-dot pulse" />
        <p className="serif" style={{ margin: "28px 0 0", fontSize: 22, lineHeight: 1.6 }}>
          {info.honorific}의 이야기를
          <br />
          귀 기울여 듣고 있어요
        </p>
        <p className="small muted" style={{ marginTop: 14 }}>잠깐이면 돼요</p>
      </main>
    );

  if (phase === "host" && host)
    return (
      <main className="screen center" style={{ paddingTop: 90 }}>
        <p className="muted" style={{ margin: 0, fontSize: 18, lineHeight: 1.6 }}>{host.react}</p>
        <h1 className="serif q" style={{ marginTop: 26 }}>{splitLead(host.followup || "").map((line, i) => <span key={i} className="qline">{line}</span>)}</h1>
        <div className="grow" style={{ minHeight: 28 }} />
        <button className="btn" onClick={continueTalk}>
          {host.video ? <span className="rec-dot" /> : <Mic />}
          {host.video ? "얼굴 보며 들려주기" : host.song ? "불러주기" : "하나 더 남기기"}
        </button>
        <button className="link" style={{ marginTop: 6 }} onClick={finish}>오늘은 여기까지 할게요</button>
      </main>
    );

  const first = turn === 0;
  return (
    <main className="screen center">
      <button
        className="sound-toggle"
        aria-label={soundOff ? "음악 켜기" : "음악 끄기"}
        onClick={() => setSoundOff(toggleMute())}
      >
        {soundOff ? "음악 켜기" : "음악 끄기"}
      </button>
      {first && info.reactions.length > 0 && (
        <div className="card redpen" style={{ width: "100%", textAlign: "left", marginBottom: 22 }}>
          <div className="tiny" style={{ color: "var(--accent)", fontWeight: 700 }}>
            {josa(c, "이/가")} 보낸 답장 · &lsquo;{info.reactions[0].about}&rsquo; 이야기를 듣고
          </div>
          {info.reactions.map((x, i) => (
            <div key={i} style={{ marginTop: 8 }}>
              {x.text && <p className="hand" style={{ margin: 0 }}>{x.text}</p>}
              {x.audioUrl && <audio src={x.audioUrl} controls style={{ marginTop: 8 }} />}
            </div>
          ))}
        </div>
      )}

      {first ? (
        isVideo ? (
          <span className="pill">조금 특별한 질문이에요</span>
        ) : (
          <p className="small muted" style={{ margin: 0, fontWeight: 500 }}>{josa(c, "이/가")} 보낸 이번 주 질문</p>
        )
      ) : (
        <p className="small muted" style={{ margin: 0, fontWeight: 500 }}>조금만 더 들려주세요</p>
      )}

      {r.recording && isVideo ? (
        <video ref={live} className="preview" muted playsInline style={{ marginTop: 24 }} />
      ) : phase === "review" && r.blob ? (
        <div style={{ marginTop: 28, width: "100%" }}>
          {isVideo ? (
            <video src={URL.createObjectURL(r.blob)} controls playsInline style={{ aspectRatio: "3/4", background: "#173a38" }} />
          ) : (
            <audio src={URL.createObjectURL(r.blob)} controls />
          )}
        </div>
      ) : first && info.photoUrl ? (
        <img src={info.photoUrl} alt="" className="photo" style={{ marginTop: 24 }} />
      ) : (
        <div style={{ marginTop: isVideo ? 20 : 32 }}>{isVideo ? <Baby /> : <MomOnSofa />}</div>
      )}

      {first && info.lead && phase === "ask" && !r.recording && (
        <div className="lead" style={{ marginTop: 26 }}>
          {splitLead(info.lead).map((line, i, arr) => (
            <p
              key={i}
              style={{
                animation:
                  `rise 1.6s ease ${0.6 + i * BEAT}s forwards` +
                  (i < arr.length - 1 ? `, dim 1.4s ease ${0.6 + (i + 1) * BEAT}s forwards` : ""),
              }}
            >
              {line}
            </p>
          ))}
        </div>
      )}

      <h1
        className={`serif q${first && info.lead && phase === "ask" && !r.recording ? " reveal" : ""}`}
        style={{ marginTop: 22, animationDelay: info.lead ? `${0.6 + splitLead(info.lead).length * BEAT + 0.2}s` : "0s" }}
      >
        {splitLead(asked).map((line, i) => (
          <span key={i} className="qline">{line}</span>
        ))}
      </h1>

      {first && ready && info.childAudioUrl && phase === "ask" && !r.recording && (
        <div style={{ width: "100%", marginTop: 16 }}>
          <p className="small muted" style={{ margin: "0 0 6px" }}>{josa(c, "이/가")} 직접 물어봤어요</p>
          <audio src={info.childAudioUrl} controls />
        </div>
      )}

      {first && info.hint && phase === "ask" && ready && !r.recording && (
        <p className="small muted" style={{ margin: "12px 0 0", lineHeight: 1.6 }}>{info.hint}</p>
      )}

      {phase === "ask" && ready && !r.recording && !(first && (info.lead || info.hint)) && (
        <p className="muted" style={{ margin: "12px 0 0", fontSize: 16, lineHeight: 1.6 }}>
          {isVideo ? "얼굴을 보며 들려주세요. 가족만 볼 수 있어요." : "생각나는 대로, 편하게 말씀해 주세요."}
        </p>
      )}

      <div className="grow" style={{ minHeight: 28 }} />
      {err && <p className="err">{err}</p>}

      {phase === "ask" && !r.recording && !ready && (
        <button className="link" onClick={() => setReady(true)}>바로 대답할게요</button>
      )}

      {phase === "ask" && ready && !r.recording && (
        <>
          <button className="btn" onClick={start}>
            {isVideo ? <span className="rec-dot" /> : <Mic />}
            {isVideo ? "눌러서 녹화하기" : "눌러서 말하기"}
          </button>
          <p className="small muted" style={{ marginTop: 12 }}>
            {isVideo ? "영상" : "음성"} · 최대 {Math.round(limit / 60) || 1}분 · {toChild}
          </p>
          {first ? (
            <button className="link" onClick={later}>지금은 어려워요</button>
          ) : (
            <button className="link" onClick={finish}>오늘은 여기까지 할게요</button>
          )}
        </>
      )}

      {r.recording && (
        <>
          <p className="row" style={{ justifyContent: "center", fontSize: 20, fontWeight: 700, margin: "0 0 16px" }}>
            <span className="rec-dot pulse" /> {mmss(r.sec)}
            <span className="small muted" style={{ fontWeight: 400 }}>/ {mmss(limit)}</span>
          </p>
          <button className="btn" onClick={r.stop}>다 말했어요</button>
        </>
      )}

      {(phase === "review" || phase === "sending") && (
        <>
          <button className="btn" onClick={send} disabled={phase === "sending"}>
            {phase === "sending" ? "보내는 중이에요…" : `${c}에게 보내기`}
          </button>
          <button className="link" onClick={() => { r.reset(); setPhase("ask"); }} disabled={phase === "sending"}>
            다시 하기
          </button>
        </>
      )}
    </main>
  );
}
