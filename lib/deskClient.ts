// lib/deskClient.ts
"use client";
// ============================================================================
// 바다 위 메모/알람 — 브라우저 쪽 API 호출. 결과는 항상 { ok, data | error, code }로 돌려준다(throw 안 함).
// 화면은 실패를 숨기지 않고 error 문장을 그대로 보여준다.
// ============================================================================
import { supabaseClient } from "@/lib/supabaseClient";

export interface NoteItem {
  id: number;
  body: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
}

export interface ReminderItem {
  id: number;
  title: string;
  remindAt: string;
  status: "scheduled" | "sending" | "sent" | "failed" | "canceled";
  source: "manual" | "voice" | "note";
  sourceEntryId: string | null;
  noteId: number | null;
  channel: "push" | "sms" | null;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface Delivery {
  push: boolean;
  sms: boolean;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string; status: number };

async function call<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  try {
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();
    if (!session) return { ok: false, error: "로그인이 아직 안 됐어\n새로고침하면 돼", status: 401 };
    const res = await fetch(path, {
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${session.access_token}`,
        ...(init.headers || {}),
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.success) {
      return { ok: false, error: body?.error || `문제가 생겼어 (${res.status})`, code: body?.code, status: res.status };
    }
    return { ok: true, data: body.data as T };
  } catch {
    return { ok: false, error: "인터넷이 끊긴 것 같아", status: 0 };
  }
}

export const notesApi = {
  list: (q?: string) => call<{ notes: NoteItem[] }>(`/api/user/notes${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  create: (body: string) => call<{ note: NoteItem }>("/api/user/notes", { method: "POST", body: JSON.stringify({ body }) }),
  update: (id: number, body: string) => call<{ note: NoteItem }>(`/api/user/notes/${id}`, { method: "PATCH", body: JSON.stringify({ body }) }),
  opened: (id: number) =>
    call<{ note: NoteItem; previousOpenedAt: string | null }>(`/api/user/notes/${id}`, { method: "PATCH", body: JSON.stringify({ opened: true }) }),
  remove: (id: number) => call<unknown>(`/api/user/notes/${id}`, { method: "DELETE" }),
};

export const remindersApi = {
  list: () => call<{ reminders: ReminderItem[]; delivery: Delivery }>("/api/user/reminders"),
  create: (input: { title: string; remind_at: string; source?: "manual" | "voice" | "note"; source_entry_id?: string; note_id?: number }) =>
    call<{ reminder: ReminderItem; existed: boolean; delivery: Delivery }>("/api/user/reminders", { method: "POST", body: JSON.stringify(input) }),
  update: (id: number, patch: { title?: string; remind_at?: string }) =>
    call<{ reminder: ReminderItem }>(`/api/user/reminders/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  cancel: (id: number) => call<unknown>(`/api/user/reminders/${id}`, { method: "DELETE" }),
};

/** 지금 쓸 수 있는 채널 — 앱 알림 우선(발송기와 같은 순서) */
export function likelyChannel(d: Delivery | null): "push" | "sms" | null {
  if (!d) return null;
  return d.push ? "push" : d.sms ? "sms" : null;
}
