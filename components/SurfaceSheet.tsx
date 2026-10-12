// components/SurfaceSheet.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import OtterCueView from "@/components/OtterCueView";
import { decideCue, loadOtterMemory, saveOtterMemory, type OtterCue, type OtterEvent } from "@/lib/otterCues";
import { likelyChannel, notesApi, remindersApi, type Delivery, type NoteItem, type ReminderItem } from "@/lib/deskClient";
import {
  REMINDER_TITLE_MAX,
  failureText,
  isOverdue,
  kstInputParts,
  kstInputToIso,
  kstLabel,
  quickPicks,
} from "@/lib/reminders/rules";
import { notificationPermission, pushSupport, subscribePush } from "@/lib/pushClient";
import { playFx } from "@/lib/fx";

// ============================================================================
// 물 위 — 바다 위에 적어두는 메모와 알람. 홈(바다) 위로 올라오는 시트라 어항을 떠나지 않는다.
// ----------------------------------------------------------------------------
// 메모 : 쓰고 바로 띄우기. 카테고리/태그/날짜를 묻지 않는다. 쪽지가 물 위에 떠 있는 모양.
// 알람 : 무엇을 + 언제(한국 시간). 실제로 알려줄 수단(앱 알림/문자)이 있는지 숨기지 않고 보여준다.
// 두 기능은 따로 쓴다. 메모에서 [알람 걸기]를 누르면 알람 탭으로 넘어가 그 내용을 채워줄 뿐.
// 참견이 반응은 lib/otterCues.ts가 정한다(처음 한 번만 말하고, 그 뒤엔 끄덕이기만).
// ============================================================================

export type SurfaceTab = "notes" | "alarms";

export interface AlarmPrefill {
  title: string;
  remindAt?: string | null;
  noteId?: number | null;
}

export interface DeskState {
  notes: NoteItem[] | null; // null = 아직 못 불러옴
  reminders: ReminderItem[] | null;
  delivery: Delivery | null;
  notesError: string | null; // 불러오기 실패(준비 안 됨 포함) — 화면에 그대로
  remindersError: string | null;
}

const INK = "#1B1630";
const DRAFT_KEY = "ganseobi_note_draft";
const NOTE_MAX = 1000;

export default function SurfaceSheet({
  open,
  initialTab = "notes",
  prefill = null,
  desk,
  onDeskChange,
  onReload,
  onClose,
}: {
  open: boolean;
  initialTab?: SurfaceTab;
  prefill?: AlarmPrefill | null;
  desk: DeskState;
  onDeskChange: (patch: Partial<DeskState>) => void;
  onReload: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<SurfaceTab>(initialTab);
  const [cue, setCue] = useState<{ cue: OtterCue | null; key: number }>({ cue: null, key: 0 });
  const cueTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const react = (ev: OtterEvent) => {
    const { cue: c, next } = decideCue(ev, loadOtterMemory());
    saveOtterMemory(next);
    if (!c) return;
    setCue({ cue: c, key: Date.now() });
    if (cueTimer.current) clearTimeout(cueTimer.current);
    cueTimer.current = setTimeout(() => setCue((x) => ({ ...x, cue: null })), c.ms);
  };
  useEffect(() => () => {
    if (cueTimer.current) clearTimeout(cueTimer.current);
  }, []);

  // 열릴 때마다 탭/채움값을 맞추고 최신으로 다시 불러온다.
  const [alarmSeed, setAlarmSeed] = useState<AlarmPrefill | null>(null);
  useEffect(() => {
    if (!open) return;
    setTab(prefill ? "alarms" : initialTab);
    setAlarmSeed(prefill);
    onReload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 시트가 떠 있는 동안 뒤 바다가 같이 스크롤되지 않게 + Esc로 닫기
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // 실패한 알람이 있으면 참견이가 한 번(알람마다 한 번) 말해준다
  useEffect(() => {
    if (!open || !desk.reminders) return;
    const seen = loadOtterMemory().failedSeen ?? [];
    const failed = desk.reminders.find((r) => r.status === "failed" && !seen.includes(r.id));
    if (failed) react({ type: "reminder_failed", id: failed.id, title: failed.title });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, desk.reminders]);

  if (!open) return null;

  const goAlarmFromNote = (n: NoteItem) => {
    const firstLine = n.body.split("\n")[0].trim();
    setAlarmSeed({ title: firstLine.slice(0, REMINDER_TITLE_MAX), noteId: n.id });
    setTab("alarms");
  };

  return (
    <div className="ss-wrap" role="dialog" aria-modal="true" aria-label="물 위 — 메모와 알람">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="ss-panel">
        <header className="ss-head">
          <div className="ss-otter">
            <OtterCueView cue={cue.cue} cueKey={cue.key} size={50} />
          </div>
          <button
            className="ss-x"
            aria-label="닫기"
            onClick={() => {
              playFx("buttonPress");
              onClose();
            }}
          >
            <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden>
              <path d="M3 3 L11 11 M11 3 L3 11" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
            </svg>
          </button>
        </header>

        {/* 수면 — 여기 위에 적어둔 것들이 떠 있다 */}
        <svg className="ss-surface" viewBox="0 0 480 14" preserveAspectRatio="none" aria-hidden>
          <path d="M0 8 Q30 1 60 8 T120 8 T180 8 T240 8 T300 8 T360 8 T420 8 T480 8" fill="none" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" />
        </svg>
        <div className="ss-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "notes"} className={tab === "notes" ? "ss-tab ss-tab-on" : "ss-tab"} onClick={() => setTab("notes")}>
            메모
          </button>
          <button role="tab" aria-selected={tab === "alarms"} className={tab === "alarms" ? "ss-tab ss-tab-on" : "ss-tab"} onClick={() => setTab("alarms")}>
            알람
          </button>
        </div>

        <div className="ss-body">
          {tab === "notes" ? (
            <NotesPane desk={desk} onDeskChange={onDeskChange} onReload={onReload} react={react} onAlarm={goAlarmFromNote} />
          ) : (
            <AlarmsPane
              key={alarmSeed ? `seed-${alarmSeed.noteId ?? ""}-${alarmSeed.title}` : "plain"}
              desk={desk}
              onDeskChange={onDeskChange}
              onReload={onReload}
              react={react}
              seed={alarmSeed}
              clearSeed={() => setAlarmSeed(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// 메모
// =============================================================================
function NotesPane({
  desk,
  onDeskChange,
  onReload,
  react,
  onAlarm,
}: {
  desk: DeskState;
  onDeskChange: (p: Partial<DeskState>) => void;
  onReload: () => void;
  react: (ev: OtterEvent) => void;
  onAlarm: (n: NoteItem) => void;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  // 쓰다 만 메모는 기기에 잠깐 남겨둔다(시트를 닫았다 열어도 그대로)
  useEffect(() => {
    try {
      const d = localStorage.getItem(DRAFT_KEY);
      if (d) setText(d);
    } catch {
      /* 없으면 빈칸 */
    }
  }, []);
  const changeText = (v: string) => {
    setText(v);
    setErr(null);
    try {
      if (v) localStorage.setItem(DRAFT_KEY, v);
      else localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* 못 남겨도 그만 */
    }
  };

  const save = async () => {
    const body = text.trim();
    if (!body || saving) return;
    setSaving(true);
    setErr(null);
    const r = await notesApi.create(body);
    setSaving(false);
    if (!r.ok) {
      setErr(r.error); // 적은 글은 그대로 둔다
      return;
    }
    playFx("buttonPress");
    changeText("");
    onDeskChange({ notes: [r.data.note, ...(desk.notes ?? [])], notesError: null });
    setJustSaved(r.data.note.id);
    react({ type: "note_saved" });
  };

  const notes = desk.notes;
  const shown = useMemo(() => {
    if (!notes) return null;
    const term = q.trim().toLowerCase();
    return term ? notes.filter((n) => n.body.toLowerCase().includes(term)) : notes;
  }, [notes, q]);

  return (
    <div>
      <div className="ss-compose">
        <label htmlFor="ss-note" className="ss-sr">
          메모
        </label>
        <textarea
          id="ss-note"
          className="ss-ta"
          value={text}
          maxLength={NOTE_MAX}
          rows={3}
          placeholder="떠오른 거, 사고 싶은 거, 물어볼 거… 여기 띄워도 돼."
          onChange={(e) => changeText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
          }}
        />
        <div className="ss-row ss-row-end">
          {text.length > NOTE_MAX * 0.8 && <span className="ss-muted">{text.length}/{NOTE_MAX}</span>}
          <button className="ss-btn ss-btn-main" disabled={!text.trim() || saving} onClick={save}>
            {saving ? "띄우는 중…" : "띄우기"}
          </button>
        </div>
        {err && (
          <p className="ss-err" role="alert">
            {err}
          </p>
        )}
      </div>

      {desk.notesError && (
        <div className="ss-err-box" role="alert">
          <span>{desk.notesError}</span>
          <button className="ss-btn" onClick={onReload}>
            다시 불러오기
          </button>
        </div>
      )}

      {notes && notes.length >= 6 && (
        <div className="ss-search">
          <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden>
            <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke={INK} strokeWidth={2.4} />
            <path d="M13 13 L18 18" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
          </svg>
          <input className="ss-search-in" value={q} onChange={(e) => setQ(e.target.value)} placeholder="쪽지 찾기" aria-label="메모 찾기" />
          {q && (
            <button className="ss-link" onClick={() => setQ("")}>
              지우기
            </button>
          )}
        </div>
      )}

      {shown === null && !desk.notesError && <p className="ss-muted ss-center">물 위를 보는 중…</p>}

      {shown && shown.length === 0 && !q && (
        <div className="ss-empty">
          <svg width="120" height="56" viewBox="0 0 120 56" aria-hidden>
            <path d="M6 40 Q21 30 36 40 T66 40 T96 40 T120 40" fill="none" stroke="#fff" strokeWidth={4} strokeLinecap="round" opacity={0.9} />
            <path d="M40 34 L60 18 L80 34 Z" fill="#fff" stroke={INK} strokeWidth={2.6} strokeLinejoin="round" />
            <path d="M60 18 V34" stroke={INK} strokeWidth={2} />
          </svg>
          <p>아직 아무것도 안 떠 있어.</p>
        </div>
      )}
      {shown && shown.length === 0 && q && <p className="ss-muted ss-center">“{q}” 들어간 쪽지가 없어.</p>}

      <ul className="ss-list">
        {(shown ?? []).map((n, i) => (
          <NoteSlip
            key={n.id}
            note={n}
            tilt={i % 2 ? 0.8 : -0.8}
            fresh={justSaved === n.id}
            open={openId === n.id}
            onToggle={async () => {
              if (openId === n.id) {
                setOpenId(null);
                return;
              }
              setOpenId(n.id);
              const r = await notesApi.opened(n.id);
              if (r.ok) {
                react({ type: "note_reopened", createdAt: n.createdAt, previousOpenedAt: r.data.previousOpenedAt });
                onDeskChange({ notes: (desk.notes ?? []).map((x) => (x.id === n.id ? r.data.note : x)) });
              }
            }}
            onSaved={(note) => onDeskChange({ notes: (desk.notes ?? []).map((x) => (x.id === note.id ? note : x)) })}
            onDeleted={() => {
              setOpenId(null);
              onDeskChange({ notes: (desk.notes ?? []).filter((x) => x.id !== n.id) });
            }}
            onAlarm={() => onAlarm(n)}
          />
        ))}
      </ul>
    </div>
  );
}

function NoteSlip({
  note,
  tilt,
  fresh,
  open,
  onToggle,
  onSaved,
  onDeleted,
  onAlarm,
}: {
  note: NoteItem;
  tilt: number;
  fresh: boolean;
  open: boolean;
  onToggle: () => void;
  onSaved: (n: NoteItem) => void;
  onDeleted: () => void;
  onAlarm: () => void;
}) {
  const [edit, setEdit] = useState(note.body);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (open) {
      setEdit(note.body);
      setErr(null);
      setConfirmDel(false);
      setSaved(false);
    }
  }, [open, note.body]);

  const changed = edit.trim() !== note.body.trim();
  return (
    <li className={`ss-slip ${fresh ? "ss-slip-in" : ""}`} style={{ transform: `rotate(${open ? 0 : tilt}deg)` }}>
      {!open ? (
        <button className="ss-slip-btn" onClick={onToggle} aria-expanded={false}>
          <span className="ss-slip-text">{note.body}</span>
          <span className="ss-slip-when">{agoLabel(note.createdAt)}</span>
        </button>
      ) : (
        <div className="ss-slip-open">
          <textarea
            className="ss-ta ss-ta-edit"
            value={edit}
            maxLength={NOTE_MAX}
            rows={Math.min(10, Math.max(3, edit.split("\n").length + 1))}
            onChange={(e) => {
              setEdit(e.target.value);
              setErr(null);
              setSaved(false);
            }}
            aria-label="메모 고치기"
          />
          <div className="ss-row">
            <span className="ss-muted">{agoLabel(note.createdAt)} 띄움{note.updatedAt !== note.createdAt ? " · 고친 적 있음" : ""}</span>
          </div>
          {err && (
            <p className="ss-err" role="alert">
              {err}
            </p>
          )}
          {saved && !changed && <p className="ss-ok" role="status">고쳐뒀어.</p>}
          {!confirmDel ? (
            <div className="ss-row ss-wrap-row">
              <button
                className="ss-btn ss-btn-main"
                disabled={!changed || !edit.trim() || busy}
                onClick={async () => {
                  setBusy(true);
                  const r = await notesApi.update(note.id, edit);
                  setBusy(false);
                  if (!r.ok) return setErr(r.error);
                  setSaved(true);
                  onSaved(r.data.note);
                }}
              >
                {busy ? "저장 중…" : "고친 거 저장"}
              </button>
              <button className="ss-btn" onClick={onAlarm}>
                알람 걸기
              </button>
              <button className="ss-btn ss-btn-ghost" onClick={() => setConfirmDel(true)}>
                지우기
              </button>
              <button className="ss-link ss-push-right" onClick={onToggle}>
                접기
              </button>
            </div>
          ) : (
            <div className="ss-row ss-wrap-row" role="group" aria-label="지울지 확인">
              <span className="ss-ask">지우면 다시 못 꺼내. 지울까?</span>
              <button
                className="ss-btn ss-btn-danger"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const r = await notesApi.remove(note.id);
                  setBusy(false);
                  if (!r.ok) {
                    setConfirmDel(false);
                    return setErr(r.error);
                  }
                  onDeleted();
                }}
              >
                {busy ? "지우는 중…" : "응, 지워"}
              </button>
              <button className="ss-btn" onClick={() => setConfirmDel(false)}>
                아니
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

// =============================================================================
// 알람
// =============================================================================
function AlarmsPane({
  desk,
  onDeskChange,
  onReload,
  react,
  seed,
  clearSeed,
}: {
  desk: DeskState;
  onDeskChange: (p: Partial<DeskState>) => void;
  onReload: () => void;
  react: (ev: OtterEvent) => void;
  seed: AlarmPrefill | null;
  clearSeed: () => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(!!seed);
  const delivery = desk.delivery;
  const channel = likelyChannel(delivery);
  const reminders = desk.reminders;
  const now = new Date();

  const upcoming = (reminders ?? []).filter((r) => r.status === "scheduled" || r.status === "sending");
  const failed = (reminders ?? []).filter((r) => r.status === "failed");
  const sent = (reminders ?? []).filter((r) => r.status === "sent").reverse();

  const replace = (r: ReminderItem) => {
    const list = reminders ?? [];
    const exists = list.some((x) => x.id === r.id);
    const next = (exists ? list.map((x) => (x.id === r.id ? r : x)) : [...list, r]).sort(
      (a, b) => new Date(a.remindAt).getTime() - new Date(b.remindAt).getTime()
    );
    onDeskChange({ reminders: next });
  };

  return (
    <div>
      <DeliveryLine delivery={delivery} onChanged={onReload} />

      {desk.remindersError && (
        <div className="ss-err-box" role="alert">
          <span>{desk.remindersError}</span>
          <button className="ss-btn" onClick={onReload}>
            다시 불러오기
          </button>
        </div>
      )}

      {formOpen && editingId === null ? (
        <AlarmForm
          seed={seed}
          channel={channel}
          disabled={!!delivery && !channel}
          onCancel={() => {
            setFormOpen(false);
            clearSeed();
          }}
          onSubmit={async (title, iso) => {
            const r = await remindersApi.create({
              title,
              remind_at: iso,
              source: seed?.noteId ? "note" : "manual",
              ...(seed?.noteId ? { note_id: seed.noteId } : {}),
            });
            if (!r.ok) return r.error;
            replace(r.data.reminder);
            onDeskChange({ delivery: r.data.delivery });
            react({ type: "reminder_set", remindAt: r.data.reminder.remindAt, channel: likelyChannel(r.data.delivery) });
            setFormOpen(false);
            clearSeed();
            return null;
          }}
        />
      ) : (
        editingId === null && (
          <button className="ss-btn ss-btn-main ss-full" disabled={!!delivery && !channel} onClick={() => setFormOpen(true)}>
            ＋ 알람 걸기
          </button>
        )
      )}

      {reminders === null && !desk.remindersError && <p className="ss-muted ss-center">알람 보는 중…</p>}
      {reminders && reminders.length === 0 && !formOpen && <p className="ss-muted ss-center">걸어둔 알람이 없어.</p>}

      {failed.length > 0 && <h3 className="ss-h">못 알려준 거</h3>}
      <ul className="ss-alist">
        {failed.map((r) => (
          <ReminderRow key={r.id} r={r} now={now} editing={editingId === r.id} onEdit={() => setEditingId(r.id)} onDone={() => setEditingId(null)} channel={channel} replace={replace} remove={(id) => onDeskChange({ reminders: (reminders ?? []).filter((x) => x.id !== id) })} />
        ))}
      </ul>

      {upcoming.length > 0 && <h3 className="ss-h">걸어둔 알람</h3>}
      <ul className="ss-alist">
        {upcoming.map((r) => (
          <ReminderRow key={r.id} r={r} now={now} editing={editingId === r.id} onEdit={() => setEditingId(r.id)} onDone={() => setEditingId(null)} channel={channel} replace={replace} remove={(id) => onDeskChange({ reminders: (reminders ?? []).filter((x) => x.id !== id) })} />
        ))}
      </ul>

      {sent.length > 0 && <h3 className="ss-h ss-h-muted">알려준 거</h3>}
      <ul className="ss-alist">
        {sent.map((r) => (
          <li key={r.id} className="ss-arow ss-arow-done">
            <span className="ss-atitle">{r.title}</span>
            <span className="ss-muted">
              {kstLabel(r.remindAt, now)} · {r.channel === "sms" ? "문자로" : "앱 알림으로"} 알려줬어
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DeliveryLine({ delivery, onChanged }: { delivery: Delivery | null; onChanged: () => void }) {
  const [state, setState] = useState<"idle" | "busy" | "denied" | "failed">("idle");
  if (!delivery) return null;
  const support = pushSupport();
  const canEnablePush = !delivery.push && support === "ok" && notificationPermission() !== "denied";
  const line = delivery.push
    ? "앱 알림으로 알려줄게."
    : delivery.sms
    ? "지금은 문자로 알려줄게."
    : "지금은 알려줄 방법이 없어. 앱 알림을 켜거나 전화번호 인증이 필요해.";
  return (
    <div className={delivery.push || delivery.sms ? "ss-deliv" : "ss-deliv ss-deliv-warn"} role={delivery.push || delivery.sms ? "note" : "alert"}>
      <span>{line}</span>
      {canEnablePush && (
        <button
          className="ss-btn"
          disabled={state === "busy"}
          onClick={async () => {
            setState("busy");
            const r = await subscribePush(); // 버튼 누른 순간에만 허용 창을 띄울 수 있다(아이폰)
            setState(r === "ok" ? "idle" : r);
            if (r === "ok") onChanged();
          }}
        >
          {state === "busy" ? "잠깐만…" : "앱 알림 켜기"}
        </button>
      )}
      {state === "denied" && <span className="ss-muted">알림이 꺼져 있어. 폰 설정에서 켜야 해.</span>}
      {state === "failed" && <span className="ss-muted">앱 알림 켜기가 안 됐어.</span>}
      {!delivery.push && support === "needs_install" && <span className="ss-muted">아이폰은 홈 화면에 추가하면 앱 알림도 받을 수 있어.</span>}
    </div>
  );
}

function ReminderRow({
  r,
  now,
  editing,
  onEdit,
  onDone,
  channel,
  replace,
  remove,
}: {
  r: ReminderItem;
  now: Date;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
  channel: "push" | "sms" | null;
  replace: (r: ReminderItem) => void;
  remove: (id: number) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const overdue = isOverdue(r.status, r.remindAt, now);

  if (editing) {
    return (
      <li className="ss-arow">
        <AlarmForm
          seed={{ title: r.title, remindAt: r.remindAt }}
          channel={channel}
          submitLabel={r.status === "failed" ? "다시 걸기" : "고친 거 저장"}
          onCancel={onDone}
          onSubmit={async (title, iso) => {
            const res = await remindersApi.update(r.id, { title, remind_at: iso });
            if (!res.ok) return res.error;
            replace(res.data.reminder);
            onDone();
            return null;
          }}
        />
      </li>
    );
  }
  return (
    <li className={r.status === "failed" ? "ss-arow ss-arow-fail" : "ss-arow"}>
      <div className="ss-arow-top">
        <span className="ss-bell" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 20 20">
            <path d="M5 14 V9 a5 5 0 0 1 10 0 V14 L16.5 15.5 H3.5 Z" fill={r.status === "failed" ? "#FFB0A8" : "#FFD23F"} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
            <path d="M8 17.5 a2 2 0 0 0 4 0" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
          </svg>
        </span>
        <span className="ss-atitle">{r.title}</span>
      </div>
      <span className="ss-awhen">{kstLabel(r.remindAt, now)}</span>
      {r.status === "sending" && <span className="ss-muted">지금 알려주는 중…</span>}
      {overdue && <span className="ss-warn">시간이 지났는데 아직 못 알려줬어. 알람 발송기가 안 돌고 있는 것 같아.</span>}
      {r.status === "failed" && <span className="ss-warn">{failureText(r.lastError)}</span>}
      {r.source === "voice" && <span className="ss-muted">말한 일정에서 건 알람</span>}
      {err && (
        <p className="ss-err" role="alert">
          {err}
        </p>
      )}
      {r.status !== "sending" &&
        (!confirm ? (
          <div className="ss-row ss-wrap-row">
            <button className="ss-btn" onClick={onEdit}>
              {r.status === "failed" ? "시간 바꿔서 다시 걸기" : "고치기"}
            </button>
            <button className="ss-btn ss-btn-ghost" onClick={() => setConfirm(true)}>
              {r.status === "failed" ? "치우기" : "취소"}
            </button>
          </div>
        ) : (
          <div className="ss-row ss-wrap-row" role="group" aria-label="취소 확인">
            <span className="ss-ask">{r.status === "failed" ? "목록에서 치울까?" : "이 알람 취소할까?"}</span>
            <button
              className="ss-btn ss-btn-danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const res = await remindersApi.cancel(r.id);
                setBusy(false);
                if (!res.ok) {
                  setConfirm(false);
                  return setErr(res.error);
                }
                remove(r.id);
              }}
            >
              {busy ? "…" : "응"}
            </button>
            <button className="ss-btn" onClick={() => setConfirm(false)}>
              아니
            </button>
          </div>
        ))}
    </li>
  );
}

function AlarmForm({
  seed,
  channel,
  disabled = false,
  submitLabel = "알람 걸기",
  onSubmit,
  onCancel,
}: {
  seed: AlarmPrefill | null;
  channel: "push" | "sms" | null;
  disabled?: boolean;
  submitLabel?: string;
  onSubmit: (title: string, iso: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const init = seed?.remindAt ? kstInputParts(seed.remindAt) : kstInputParts(quickPicks()[0].iso);
  const [title, setTitle] = useState(seed?.title ?? "");
  const [date, setDate] = useState(init.date);
  const [time, setTime] = useState(init.time);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const iso = kstInputToIso(date, time);
  const picks = quickPicks();

  return (
    <form
      className="ss-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!iso) return setErr("시간을 다시 골라줘.");
        if (new Date(iso).getTime() < Date.now() + 60_000) return setErr("이미 지난 시간이야.");
        setBusy(true);
        setErr(null);
        const msg = await onSubmit(title.trim(), iso);
        setBusy(false);
        if (msg) setErr(msg);
      }}
    >
      <label className="ss-label" htmlFor="ss-a-title">
        뭘 알려줄까
      </label>
      <input
        id="ss-a-title"
        className="ss-in"
        value={title}
        maxLength={REMINDER_TITLE_MAX}
        placeholder="예: 스튜디오 가기"
        onChange={(e) => {
          setTitle(e.target.value);
          setErr(null);
        }}
      />
      <span className="ss-label">언제 (한국 시간)</span>
      <div className="ss-chips">
        {picks.map((p) => {
          const parts = kstInputParts(p.iso);
          const on = parts.date === date && parts.time === time;
          return (
            <button
              type="button"
              key={p.label}
              className={on ? "ss-chip ss-chip-on" : "ss-chip"}
              aria-pressed={on}
              onClick={() => {
                setDate(parts.date);
                setTime(parts.time);
                setErr(null);
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="ss-row">
        <input className="ss-in ss-in-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="날짜" />
        <input className="ss-in ss-in-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="시각" />
      </div>
      {iso && <p className="ss-muted">{kstLabel(iso)}에 {channel === "sms" ? "문자로" : channel === "push" ? "앱 알림으로" : ""} 알려줄게.</p>}
      {err && (
        <p className="ss-err" role="alert">
          {err}
        </p>
      )}
      <div className="ss-row ss-row-end">
        <button type="button" className="ss-btn ss-btn-ghost" onClick={onCancel}>
          그만
        </button>
        <button type="submit" className="ss-btn ss-btn-main" disabled={disabled || busy || !title.trim() || !iso}>
          {busy ? "거는 중…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

function agoLabel(iso: string): string {
  const d = new Date(iso);
  const days = (Date.now() - d.getTime()) / 86_400_000;
  if (days < 1 && new Date().getDate() === d.getDate()) return "오늘";
  if (days < 2) return "어제";
  if (days < 7) return `${Math.floor(days)}일 전`;
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

const CSS = `
.ss-wrap{position:fixed;inset:0;z-index:150;display:flex;justify-content:center;background:rgba(15,46,87,.35);animation:ss-fade .2s ease-out}
@keyframes ss-fade{from{opacity:0}to{opacity:1}}
.ss-panel{position:relative;width:100%;max-width:480px;height:100%;display:flex;flex-direction:column;background:linear-gradient(#8BE0FA 0%,#5CCBF0 45%,#45BFEC 100%);font-family:'Jua',sans-serif;color:${INK};animation:ss-rise .38s cubic-bezier(.25,1.2,.4,1) both;padding-top:env(safe-area-inset-top,0px)}
@keyframes ss-rise{from{transform:translateY(40px);opacity:.3}to{transform:none;opacity:1}}
.ss-surface{display:block;width:100%;height:14px;margin:-2px 0 6px;opacity:.9}
.ss-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 16px 4px;min-height:62px}
.ss-otter{min-width:0;flex:1}
.ss-x{width:42px;height:42px;flex-shrink:0;border-radius:50%;border:3px solid ${INK};background:#fff;box-shadow:3px 3px 0 ${INK};display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
.ss-tabs{display:flex;gap:8px;padding:4px 16px 10px}
.ss-tab{flex:1;min-height:44px;border-radius:14px;border:3px solid ${INK};background:rgba(255,255,255,.55);font-family:inherit;font-size:17px;color:${INK};cursor:pointer}
.ss-tab-on{background:#FFD23F;box-shadow:3px 3px 0 ${INK}}
.ss-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:4px 16px calc(28px + env(safe-area-inset-bottom,0px))}
.ss-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.ss-compose{background:#fff;border:3px solid ${INK};border-radius:20px;box-shadow:4px 4px 0 ${INK};padding:12px;margin-bottom:14px}
.ss-ta{width:100%;box-sizing:border-box;border:0;outline:0;resize:none;font-family:inherit;font-size:17px;line-height:1.45;color:${INK};background:transparent}
.ss-ta::placeholder{color:rgba(27,22,48,.4)}
.ss-ta-edit{border:2px dashed rgba(27,22,48,.25);border-radius:12px;padding:8px}
.ss-row{display:flex;align-items:center;gap:8px;margin-top:8px}
.ss-row-end{justify-content:flex-end}
.ss-wrap-row{flex-wrap:wrap}
.ss-push-right{margin-left:auto}
.ss-btn{min-height:40px;padding:0 14px;border-radius:12px;border:2.5px solid ${INK};background:#fff;box-shadow:2px 2px 0 ${INK};font-family:inherit;font-size:15px;color:${INK};cursor:pointer}
.ss-btn:disabled{opacity:.45;cursor:default}
.ss-btn:not(:disabled):active{transform:translate(2px,2px);box-shadow:0 0 0 ${INK}}
.ss-btn-main{background:#FFD23F}
.ss-btn-ghost{background:transparent;box-shadow:none}
.ss-btn-danger{background:#FF8F80}
.ss-full{width:100%;min-height:48px;font-size:17px;margin-bottom:12px}
.ss-link{border:0;background:none;font-family:inherit;font-size:15px;color:${INK};text-decoration:underline;cursor:pointer;padding:4px}
.ss-btn:focus-visible,.ss-tab:focus-visible,.ss-x:focus-visible,.ss-link:focus-visible,.ss-chip:focus-visible,.ss-slip-btn:focus-visible{outline:3px dashed #fff;outline-offset:3px}
.ss-muted{font-size:14px;color:rgba(27,22,48,.6)}
.ss-center{text-align:center;margin:18px 0}
.ss-err{margin:8px 0 0;font-size:15px;color:#B42318}
.ss-ok{margin:6px 0 0;font-size:15px;color:#1F7A4D}
.ss-err-box{display:flex;align-items:center;justify-content:space-between;gap:8px;background:#FFE3DE;border:2.5px solid ${INK};border-radius:14px;padding:10px 12px;margin-bottom:12px;font-size:15px}
.ss-search{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.75);border:2.5px solid ${INK};border-radius:14px;padding:4px 10px;margin-bottom:12px}
.ss-search-in{flex:1;min-width:0;border:0;outline:0;background:transparent;font-family:inherit;font-size:16px;color:${INK};min-height:36px}
.ss-empty{display:flex;flex-direction:column;align-items:center;gap:4px;margin:26px 0;font-size:16px;color:rgba(27,22,48,.7)}
.ss-empty p{margin:0}
.ss-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px}
.ss-slip{background:#FFFDF6;border:3px solid ${INK};border-radius:6px 18px 6px 18px;box-shadow:3px 4px 0 rgba(27,22,48,.85);transition:transform .25s ease}
.ss-slip-in{animation:ss-drop .55s cubic-bezier(.3,1.5,.5,1) both}
@keyframes ss-drop{from{transform:translateY(-26px) rotate(-4deg);opacity:0}to{opacity:1}}
.ss-slip-btn{display:flex;flex-direction:column;align-items:flex-start;gap:6px;width:100%;padding:12px 14px;border:0;background:none;text-align:left;font-family:inherit;color:${INK};cursor:pointer}
.ss-slip-text{font-size:17px;line-height:1.45;white-space:pre-line;word-break:keep-all;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.ss-slip-when{font-size:13px;color:rgba(27,22,48,.5)}
.ss-slip-open{padding:12px}
.ss-ask{font-size:15px}
.ss-deliv{display:flex;flex-wrap:wrap;align-items:center;gap:8px;background:rgba(255,255,255,.7);border:2.5px solid ${INK};border-radius:14px;padding:10px 12px;margin-bottom:12px;font-size:15px}
.ss-deliv-warn{background:#FFE3DE}
.ss-h{margin:14px 2px 8px;font-size:16px;font-weight:400}
.ss-h-muted{color:rgba(27,22,48,.6)}
.ss-alist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.ss-arow{display:flex;flex-direction:column;gap:4px;background:#fff;border:3px solid ${INK};border-radius:16px;box-shadow:3px 3px 0 ${INK};padding:10px 12px}
.ss-arow-fail{background:#FFF1EE}
.ss-arow-done{background:rgba(255,255,255,.55);box-shadow:none;border-width:2px}
.ss-arow-top{display:flex;align-items:center;gap:8px}
.ss-bell{display:flex}
.ss-atitle{font-size:17px;word-break:keep-all;overflow-wrap:anywhere}
.ss-awhen{font-size:15px;color:rgba(27,22,48,.75)}
.ss-warn{font-size:14px;color:#B42318}
.ss-form{display:flex;flex-direction:column;gap:6px;background:#fff;border:3px solid ${INK};border-radius:18px;box-shadow:4px 4px 0 ${INK};padding:12px;margin-bottom:12px}
.ss-arow .ss-form{border:0;box-shadow:none;padding:0;margin:0}
.ss-label{font-size:14px;color:rgba(27,22,48,.65);margin-top:4px}
.ss-in{min-height:44px;box-sizing:border-box;border:2.5px solid ${INK};border-radius:12px;padding:0 10px;font-family:inherit;font-size:16px;color:${INK};background:#fff;width:100%}
.ss-in-date{flex:1.4;min-width:0}
.ss-in-time{flex:1;min-width:0}
.ss-chips{display:flex;flex-wrap:wrap;gap:6px}
.ss-chip{min-height:36px;padding:0 12px;border-radius:999px;border:2px solid ${INK};background:#fff;font-family:inherit;font-size:14px;color:${INK};cursor:pointer}
.ss-chip-on{background:#FFD23F}
@media (prefers-reduced-motion: reduce){.ss-wrap,.ss-panel,.ss-slip-in{animation:none}.ss-slip{transition:none}}
`;
