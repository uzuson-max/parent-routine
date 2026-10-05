"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { acquireMicStream } from "@/lib/micStream";

// ============================================================================
// 홈(어항) 안에서 바로 녹음하기 위한 작은 녹음기 훅.
// 화면 전환 없이 홈에서 녹음 → 업로드까지 하기 위해 만들었다. RecordingScreen(텍스트 입력,
// ＋ 더 이야기하기 루프)은 그대로 두고, 무음 판정 규칙은 RecordingScreen과 같은 값을 쓴다.
//
// 무음 판정 — 말소리를 "알아듣는" 게 아니라 실제로 소리가 들어왔는지만 본다.
// Whisper는 무음을 받으면 "시청해주셔서 감사합니다" 같은 문장을 지어내기 때문에,
// 소리가 거의 없었으면 서버로 보내지 않는다. (서버에서도 한 번 더 거른다 — upload route 참고)
// ============================================================================

const MIN_RECORDING_MS = 800;
const METER_INTERVAL_MS = 50;
const INPUT_RMS_THRESHOLD = 0.015;
const MIN_INPUT_MS = 300; // RecordingScreen(150ms)보다 조금 엄격하게 — 잠깐의 잡음은 말로 치지 않는다
const METER_WARMUP_MS = 250; // 시작 효과음이 마이크로 다시 들어오는 구간은 세지 않는다
const MAX_RECORDING_MS = 3 * 60 * 1000; // 안전장치: 3분이 지나면 자동으로 멈춘다

type InputMeter = {
  ctx: AudioContext;
  source: MediaStreamAudioSourceNode;
  timer: ReturnType<typeof setInterval>;
  samples: number;
  maxRms: number;
  inputMs: number;
};

function startInputMeter(stream: MediaStream): InputMeter | null {
  try {
    const Ctx: typeof AudioContext | undefined =
      typeof window !== "undefined" ? window.AudioContext || (window as any).webkitAudioContext : undefined;
    if (!Ctx) return null;
    const ctx = new Ctx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const meter: InputMeter = { ctx, source, timer: 0 as any, samples: 0, maxRms: 0, inputMs: 0 };
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const startedAt = Date.now();
    meter.timer = setInterval(() => {
      if (ctx.state !== "running") return;
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      meter.samples += 1;
      if (rms > meter.maxRms) meter.maxRms = rms;
      if (Date.now() - startedAt < METER_WARMUP_MS) return;
      if (rms >= INPUT_RMS_THRESHOLD) meter.inputMs += METER_INTERVAL_MS;
    }, METER_INTERVAL_MS);
    return meter;
  } catch {
    return null;
  }
}

function stopInputMeter(meter: InputMeter | null) {
  if (!meter) return;
  clearInterval(meter.timer);
  try { meter.source.disconnect(); } catch {}
  meter.ctx.close().catch(() => {});
}

function meterIsReliable(meter: InputMeter | null): meter is InputMeter {
  return !!meter && meter.samples >= 5 && meter.maxRms > 0;
}

export type TankRecordResult =
  | { kind: "audio"; blob: Blob; durationMs: number }
  | { kind: "empty" } // 너무 짧거나 무음 — 서버로 보내지 않는다
  | { kind: "failed" }; // 마이크를 못 잡음

export type TankRecorderState = "idle" | "starting" | "recording";

export function useTankRecorder(onAutoStop?: (r: TankRecordResult) => void) {
  const [state, setState] = useState<TankRecorderState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const meterRef = useRef<InputMeter | null>(null);
  const startedAtRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolveRef = useRef<((r: TankRecordResult) => void) | null>(null);
  const discardRef = useRef(false);
  const autoStopRef = useRef(onAutoStop);
  autoStopRef.current = onAutoStop;

  const cleanupTimers = () => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
  };

  // 화면을 떠나면 녹음 중이던 건 버린다. 마이크 트랙 자체는 lib/micStream.ts 소유라 끄지 않는다.
  useEffect(() => {
    return () => {
      cleanupTimers();
      stopInputMeter(meterRef.current);
      meterRef.current = null;
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") {
        discardRef.current = true;
        try { rec.stop(); } catch {}
      }
    };
  }, []);

  const finish = useCallback((): Promise<TankRecordResult> => {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") return Promise.resolve({ kind: "empty" });
    // 중지 효과음이 측정에 섞이지 않도록 측정부터 멈춘다.
    if (meterRef.current) clearInterval(meterRef.current.timer);
    return new Promise<TankRecordResult>((resolve) => {
      resolveRef.current = resolve;
      try { rec.stop(); } catch { resolve({ kind: "empty" }); }
    });
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    if (state !== "idle") return false;
    setState("starting");
    try {
      const stream = await acquireMicStream();
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      discardRef.current = false;
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        cleanupTimers();
        const meter = meterRef.current;
        meterRef.current = null;
        stopInputMeter(meter);
        recorderRef.current = null;
        setState("idle");
        if (discardRef.current) return;
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const durationMs = Date.now() - startedAtRef.current;
        const reliable = meterIsReliable(meter);
        const silent = reliable && meter.inputMs < MIN_INPUT_MS;
        console.log("[tank-recording] stop", {
          durationMs,
          bytes: blob.size,
          meter: reliable ? { inputMs: meter.inputMs, maxRms: Number(meter.maxRms.toFixed(4)) } : "unavailable",
        });
        const result: TankRecordResult =
          durationMs < MIN_RECORDING_MS || blob.size === 0 || silent ? { kind: "empty" } : { kind: "audio", blob, durationMs };
        const resolve = resolveRef.current;
        resolveRef.current = null;
        if (resolve) resolve(result);
        else autoStopRef.current?.(result); // 3분 자동 정지 / 트랙이 먼저 끊긴 경우
      };
      stopInputMeter(meterRef.current);
      meterRef.current = startInputMeter(stream);
      startedAtRef.current = Date.now();
      recorder.start();
      recorderRef.current = recorder;
      setElapsedMs(0);
      setState("recording");
      tickRef.current = setInterval(() => {
        const ms = Date.now() - startedAtRef.current;
        setElapsedMs(ms);
        if (ms >= MAX_RECORDING_MS) {
          const rec = recorderRef.current;
          if (rec && rec.state !== "inactive") {
            if (meterRef.current) clearInterval(meterRef.current.timer);
            try { rec.stop(); } catch {}
          }
        }
      }, 200);
      return true;
    } catch {
      stopInputMeter(meterRef.current);
      meterRef.current = null;
      setState("idle");
      return false;
    }
  }, [state]);

  return { state, elapsedMs, start, finish };
}
