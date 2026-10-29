"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/supabaseBrowser";
import { josa } from "@/lib/korean";

type Row = {
  week: number; format: "audio" | "video"; chapter: string; why: string;
  lead: string | null; ask: string; encore: string | null; hint: string | null;
  replyLead: string | null; replyAsk: string | null; free: boolean; preview: boolean;
};

// 12주 과정 미리보기 → 질문함에 넣기 (아직 안 보낸 질문은 이 과정으로 바뀜)
export default function Pick() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [label, setLabel] = useState("부모님");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    api("/api/me/recommend", { method: "POST" })
      .then((r) => { setRows(r.course); setLabel(r.label || "부모님"); })
      .catch(() => router.replace("/app/family"));
  }, [router]);

  async function save() {
    if (!rows) return;
    setBusy(true);
    const items = rows.map((r) => ({ ...r, half: r.encore, text: r.ask, source: "library" }));
    await api("/api/me/prompts", { method: "POST", body: JSON.stringify({ items, replaceQueued: true }) });
    router.replace("/app");
  }

  if (!rows)
    return (
      <main className="screen center">
        <div className="grow" />
        <p className="serif" style={{ fontSize: 20 }}>12주 과정을 준비하고 있어요…</p>
        <div className="grow" />
      </main>
    );

  let chapter = "";
  return (
    <main className="screen">
      <div className="stack">
        <h1 className="h1">{josa(label, "과/와")} 함께할 12번의 이야기</h1>
        <p className="muted small" style={{ margin: 0 }}>
          화요일과 토요일, 일주일에 두 번 가요. 질문을 누르면 왜 이 질문인지 볼 수 있어요.
        </p>
        {rows.map((r) => {
          const head = r.chapter !== chapter ? (chapter = r.chapter) : null;
          return (
            <div key={r.week} className="stack" style={{ gap: 8 }}>
              {head && <div className="section" style={{ marginTop: 14 }}>{head}</div>}
              <button
                type="button"
                className="card stack"
                style={{ gap: 8, textAlign: "left", width: "100%", font: "inherit", color: "inherit", cursor: "pointer" }}
                onClick={() => setOpen(open === r.week ? null : r.week)}
              >
                <div className="row" style={{ justifyContent: "space-between", width: "100%" }}>
                  <span className="chip">{r.week}회차 · {r.format === "video" ? "영상" : "음성"}</span>
                  <span className="tiny muted">{open === r.week ? "접기" : "이 질문의 의미"}</span>
                </div>
                <p className="serif" style={{ margin: 0, fontSize: 17, lineHeight: 1.55 }}>{r.ask}</p>
                {open === r.week && (
                  <div className="stack" style={{ gap: 8, paddingTop: 10, borderTop: "1px solid rgba(127,127,127,.3)" }}>
                    {r.why && <p className="small" style={{ margin: 0, lineHeight: 1.7 }}>{r.why}</p>}
                    {r.lead && <p className="tiny muted" style={{ margin: 0, whiteSpace: "pre-line" }}>부모님이 먼저 보는 장면 · {r.lead}</p>}
                    {r.encore && <p className="tiny muted" style={{ margin: 0 }}>이날은 하나 더 · {r.encore}</p>}
                    {r.replyAsk && <p className="tiny muted" style={{ margin: 0 }}>이 이야기를 듣고 나도 답장을 남겨요</p>}
                  </div>
                )}
              </button>
            </div>
          );
        })}
        <div style={{ position: "sticky", bottom: 16 }}>
          <button className="btn" onClick={save} disabled={busy}>{busy ? "넣는 중…" : "12번의 이야기 시작하기"}</button>
        </div>
      </div>
    </main>
  );
}
