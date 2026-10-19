// lib/voicePlayer.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";

// ============================================================================
// 지난 목소리 재생 — Web Audio로 디코딩(아이폰 녹음이 webm 이름표를 달고 있어도 재생되게).
// app/screens/RiverScreen.tsx 안의 useVoicePlayer와 같은 동작. 소라님(components/SoraNim.tsx)이 쓴다.
// (소라 징검다리 화면은 공개 직전이라 손대지 않고 그대로 둔다 — 나중에 이 파일 하나로 합치면 된다.)
// ============================================================================

export async function authed(path: string, init?: RequestInit) {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  if (!session) throw new Error("세션 만료 · 새로고침");
  return fetch(path, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${session.access_token}` },
  });
}

// 받아쓰기 안에서 그 말이 나오는 근처만 — 글자 위치 비율로 시간 추정(정확한 단어 시각은 저장 안 돼 있음)
export function clipWindow(transcript: string, quote: string, duration: number): { start: number; length: number } {
  if (duration <= 6) return { start: 0, length: duration };
  const t = transcript.replace(/\s+/g, " ").trim();
  const q = quote.replace(/[…“”~]/g, "").replace(/\s+/g, " ").trim();
  let idx = q ? t.indexOf(q) : -1;
  if (idx < 0 && q.length > 6) idx = t.indexOf(q.slice(0, 6));
  if (!t || idx < 0) return { start: 0, length: Math.min(duration, 4) };
  const start = Math.max(0, (idx / t.length) * duration - 0.4);
  const length = Math.min(4.5, Math.max(2.5, (Math.max(q.length, 8) / t.length) * duration + 0.9));
  return { start: Math.min(start, Math.max(0, duration - length)), length };
}

export function useVoicePlayer() {
  const ctxRef = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const cache = useRef<Map<string, { buffer: AudioBuffer; transcript: string }>>(new Map());
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");

  const ctx = useCallback((): AudioContext | null => {
    if (!ctxRef.current) {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctxRef.current = new AC();
    }
    return ctxRef.current;
  }, []);

  useEffect(
    () => () => {
      try {
        srcRef.current?.stop();
      } catch {
        /* 이미 멈춤 */
      }
      ctxRef.current?.close().catch(() => {});
    },
    []
  );

  // 사용자 터치 안에서 한 번 깨워 둔다(아이폰은 터치 없이 소리를 못 낸다)
  const unlock = () => {
    try {
      ctx()?.resume();
    } catch {
      /* 무시 */
    }
  };

  // 녹음 + 받아쓰기 불러오기(한 번 불러온 건 다시 안 받는다). 실패하면 null.
  const load = async (query: string): Promise<{ buffer: AudioBuffer; transcript: string } | null> => {
    const hit = cache.current.get(query);
    if (hit) return hit;
    try {
      const c = ctx();
      if (!c) return null;
      const res = await authed(`/api/stage/voice?${query}`);
      const body = await res.json();
      if (!body?.success) return null;
      const audio = await fetch(body.data.url);
      if (!audio.ok) return null;
      const buffer = await c.decodeAudioData(await audio.arrayBuffer());
      const item = { buffer, transcript: String(body.data.transcript ?? "") };
      cache.current.set(query, item);
      return item;
    } catch {
      return null;
    }
  };

  const stop = () => {
    try {
      srcRef.current?.stop();
    } catch {
      /* 무시 */
    }
  };

  // 그 말이 나오는 근처 3초 정도만 튼다. 끝나면 resolve.
  const playClip = async (query: string, quote: string) => {
    stop();
    try {
      setState("loading");
      const c = ctx();
      if (!c) return false;
      await c.resume();
      const item = await load(query);
      if (!item) return false;
      const src = c.createBufferSource();
      src.buffer = item.buffer;
      const gain = c.createGain();
      src.connect(gain).connect(c.destination);
      srcRef.current = src;
      setState("playing");
      const range = clipWindow(item.transcript, quote, item.buffer.duration);
      const t0 = c.currentTime;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(1, t0 + 0.06);
      gain.gain.setValueAtTime(1, t0 + Math.max(0.07, range.length - 0.15));
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + range.length);
      await new Promise<void>((resolve) => {
        src.onended = () => resolve();
        src.start(t0, range.start, range.length);
      });
      return true;
    } catch {
      return false;
    } finally {
      setState("idle");
    }
  };

  // 두둥 — 낮은 북소리 두 번. 사용자 터치 안에서 부르면 아이폰에서도 난다.
  const dudung = () => {
    const c = ctx();
    if (!c) return;
    try {
      c.resume();
      [0, 0.42].forEach((at, i) => {
        const t = c.currentTime + at;
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(i === 0 ? 96 : 72, t);
        o.frequency.exponentialRampToValueAtTime(38, t + 0.5);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.9, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
        o.connect(g).connect(c.destination);
        o.start(t);
        o.stop(t + 0.62);
      });
    } catch {
      /* 소리는 없어도 된다 */
    }
  };

  return { load, playClip, stop, unlock, dudung, state };
}
