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
            await fetch(`/api/journal/${entryId}/call`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ phoneNumber: phone, minutesDelay: minutes }),
            });
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

async function uploadAudio(blob: Blob) {
  const form = new FormData();
  form.append("audio", blob);
  const res = await fetch("/api/upload-audio", { method: "POST", body: form }).then((r) => r.json());
  return res.audioUrl;
}

function getUserId() {
  return localStorage.getItem("userId");
}
