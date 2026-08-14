"use client";

import { useState } from "react";
import LandingScreen from "./screens/LandingScreen";
import RecordingScreen from "./screens/RecordingScreen";
import HookScreen from "./screens/HookScreen";
import PhoneInputScreen from "./screens/PhoneInputScreen";
import CallingScreen from "./screens/CallingScreen";
import ResultScreen from "./screens/ResultScreen";

export default function App() {
  const [step, setStep] = useState("landing");
  const [entryId, setEntryId] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  return (
    <div style={{ minHeight: "100vh", background: "#0b0b0f" }}>
      {step === "landing" && <LandingScreen onStart={() => setStep("recording")} />}

      {step === "recording" && (
        <RecordingScreen
          onFinish={async (audioBlob: Blob) => {
            setStep("analyzing");
            const audioUrl = await uploadAudio(audioBlob);
            const res = await fetch("/api/journal", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId: getUserId(), audioUrl }),
            }).then((r) => r.json());
            setEntryId(res.entryId);
            setStep("phone_input");
          }}
        />
      )}

      {step === "analyzing" && <HookScreen />}

      {step === "phone_input" && (
        <PhoneInputScreen
          onSubmit={async (phoneNumber: string) => {
            setStep("calling");
            await fetch(`/api/journal/${entryId}/call`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ phoneNumber }),
            });
          }}
        />
      )}

      {step === "calling" && (
        <CallingScreen entryId={entryId} onCallEnded={(finishedEntry: any) => { setResult(finishedEntry); setStep("result"); }} />
      )}

      {step === "result" && <ResultScreen result={result} onRestart={() => setStep("landing")} />}
    </div>
  );
}

async function uploadAudio(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append("audio", blob);
  const res = await fetch("/api/upload-audio", { method: "POST", body: form }).then((r) => r.json());
  return res.audioUrl;
}

function getUserId(): string {
  return typeof window !== "undefined" ? localStorage.getItem("userId") || "default-user-id" : "default-user-id";
}
