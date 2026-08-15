"use client";

import { useState } from "react";
import LandingScreen from "./screens/LandingScreen";
import RecordingScreen from "./screens/RecordingScreen";
import HookScreen from "./screens/HookScreen";
import PhoneInputScreen from "./screens/PhoneInputScreen";
import CallScheduleScreen from "./screens/CallScheduleScreen";
import CallingScreen from "./screens/CallingScreen";
import ResultScreen from "./screens/ResultScreen";

type Step = "landing" | "recording" | "analyzing" | "phone_input" | "schedule" | "calling" | "result";

export default function Home() {
  const [step, setStep] = useState<Step>("landing");
  const [entryId, setEntryId] = useState<string | null>(null);
  const [phone, setPhone] = useState<string>("");
  const [minutesDelay, setMinutesDelay] = useState<number>(0);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div style={{ minHeight: "100vh", background: "#0b0b0f" }}>
      {error && (
        <div style={errorBannerStyle}>
          문제가 생겼어요: {error}
          <button style={{ marginLeft: 12 }} onClick={() => { setError(null); setStep("landing"); }}>
            처음으로
          </button>
        </div>
      )}

      {step === "landing" && <LandingScreen onStart={() => setStep("recording")} />}

      {step === "recording" && (
        <RecordingScreen
          onFinish={async (audioBlob: Blob) => {
            setStep("analyzing");
            try {
              const audioUrl = await uploadAudio(audioBlob);
              const res = await fetch("/api/journal", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ audioUrl }),
              });
              if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || `journal API ${res.status}`);
              }
              const data = await res.json();
              setEntryId(data.entryId);
            } catch (e: any) {
              console.error("[Home] recording->journal flow failed:", e.message);
              setError(e.message);
              setStep("landing");
            }
          }}
        />
      )}

      {step === "analyzing" && <HookScreen onContinue={() => setStep("phone_input")} />}

      {step === "phone_input" && (
        <PhoneInputScreen
          onSubmit={(phoneNumber) => {
            setPhone(phoneNumber);
            setStep("schedule");
          }}
        />
      )}

      {step === "schedule" && (
        <CallScheduleScreen
          onSelect={async (minutes) => {
            setMinutesDelay(minutes);
            setStep("calling");
            try {
              const res = await fetch(`/api/journal/${entryId}/call`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phoneNumber: phone, minutesDelay: minutes }),
              });
              if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || `call API ${res.status}`);
              }
            } catch (e: any) {
              console.error("[Home] call trigger failed:", e.message);
              setError(e.message);
              setStep("landing");
            }
          }}
        />
      )}

      {step === "calling" && entryId && (
        <CallingScreen
          entryId={entryId}
          minutesDelay={minutesDelay}
          onCallEnded={(finishedEntry) => {
            setResult(finishedEntry);
            setStep("result");
          }}
        />
      )}

      {step === "result" && <ResultScreen result={result} onRestart={() => setStep("landing")} />}
    </div>
  );
}

async function uploadAudio(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append("audio", blob, "recording.webm");

  const res = await fetch("/api/upload-audio", { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[uploadAudio] upload failed:", body.error || res.status);
    throw new Error(body.error || `upload-audio API ${res.status}`);
  }
  const data = await res.json();
  return data.audioUrl;
}

const errorBannerStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  background: "#ff3b30",
  color: "#fff",
  padding: "12px 16px",
  fontSize: 14,
  zIndex: 999,
  textAlign: "center",
};
