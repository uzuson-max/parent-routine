// frontend/App.jsx
import { useState } from "react";
import LandingScreen from "./screens/LandingScreen";
import RecordingScreen from "./screens/RecordingScreen";
import HookScreen from "./screens/HookScreen";
import PhoneInputScreen from "./screens/PhoneInputScreen";
import CallingScreen from "./screens/CallingScreen";
import ResultScreen from "./screens/ResultScreen";

// 화면 상태: landing -> recording -> analyzing -> phone_input -> calling -> result
export default function App() {
  const [step, setStep] = useState("landing");
  const [entryId, setEntryId] = useState(null);
  const [result, setResult] = useState(null);

  return (
    <div style={{ minHeight: "100vh", background: "#0b0b0f" }}>
      {step === "landing" && <LandingScreen onStart={() => setStep("recording")} />}

      {step === "recording" && (
        <RecordingScreen
          onFinish={async (audioBlob) => {
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
          onSubmit={async (phoneNumber) => {
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
        <CallingScreen
          entryId={entryId}
          onCallEnded={(finishedEntry) => {
            setResult(finishedEntry);
            setStep("result");
          }}
        />
      )}

      {step === "result" && (
        <ResultScreen result={result} onRestart={() => setStep("landing")} />
      )}
    </div>
  );
}

async function uploadAudio(blob) {
  const form = new FormData();
  form.append("audio", blob);
  const res = await fetch("/api/upload-audio", { method: "POST", body: form }).then((r) => r.json());
  return res.audioUrl;
}

function getUserId() {
  return localStorage.getItem("userId"); // 기존 인증 로직 재사용
}
