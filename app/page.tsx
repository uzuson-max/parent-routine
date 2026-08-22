"use client";

import { useState } from "react";
import LandingScreen from "./screens/LandingScreen";
import RecordingScreen from "./screens/RecordingScreen";
import GoalInputScreen from "./screens/GoalInputScreen";
import PhoneInputScreen from "./screens/PhoneInputScreen";
import CallingScreen from "./screens/CallingScreen";
import ResultScreen from "./screens/ResultScreen";

type Step = "landing" | "recording" | "goal_input" | "phone_input" | "uploading" | "calling" | "result";

export default function Home() {
  const [step, setStep] = useState<Step>("landing");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [targetGoal, setTargetGoal] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [entryId, setEntryId] = useState<string | null>(null);
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
          onFinish={(blob: Blob) => {
            setAudioBlob(blob);
            setStep("goal_input");
          }}
        />
      )}

      {step === "goal_input" && (
        <GoalInputScreen
          onSubmit={(goal: string) => {
            setTargetGoal(goal);
            setStep("phone_input");
          }}
        />
      )}

      {step === "phone_input" && (
        <PhoneInputScreen
          onSubmit={async (phoneNumber: string) => {
            setPhone(phoneNumber);
            setStep("uploading");

            if (!audioBlob) {
              setError("녹음 데이터가 없어요. 다시 시도해주세요.");
              setStep("landing");
              return;
            }

            try {
              const form = new FormData();
              form.append("audio", audioBlob, "recording.webm");
              form.append("phone", phoneNumber);
              form.append("target_goal", targetGoal);
              form.append("persona", "coach");

              const res = await fetch("/api/voice/upload", { method: "POST", body: form });
              if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || `upload API ${res.status}`);
              }
              const body = await res.json();
              if (!body.success || !body.data?.id) {
                throw new Error(body.error || "entry id missing from response");
              }
              setEntryId(body.data.id);
              setStep("calling");
            } catch (e: any) {
              console.error("[Home] upload flow failed:", e.message);
              setError(e.message);
              setStep("landing");
            }
          }}
        />
      )}

      {step === "calling" && entryId && (
        <CallingScreen
          entryId={entryId}
          onCallEnded={(finishedEntry) => {
            setResult(finishedEntry);
            setStep("result");
          }}
        />
      )}

      {step === "result" && (
        <ResultScreen
          result={result}
          onRestart={() => {
            setAudioBlob(null);
            setTargetGoal("");
            setPhone("");
            setEntryId(null);
            setResult(null);
            setStep("landing");
          }}
        />
      )}
    </div>
  );
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
