"use client";

import { useState } from "react";
import LandingScreen from "./screens/LandingScreen";
import RecordingScreen from "./screens/RecordingScreen";
import PhoneInputScreen from "./screens/PhoneInputScreen";
import ConfirmScreen from "./screens/ConfirmScreen";
import MessageScreen from "./screens/MessageScreen";
import CallingScreen from "./screens/CallingScreen";
import ResultScreen from "./screens/ResultScreen";

type Step =
  | "landing"
  | "recording"
  | "phone_input"
  | "uploading"
  | "no_action"
  | "awaiting_confirmation"
  | "calling"
  | "call_failed"
  | "confirmed"
  | "result";

export default function Home() {
  const [step, setStep] = useState<Step>("landing");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [phone, setPhone] = useState<string>("");
  const [entryId, setEntryId] = useState<string | null>(null);
  const [uploadData, setUploadData] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const doUpload = async (phoneNumber: string, blob: Blob) => {
    setStep("uploading");
    try {
      const form = new FormData();
      form.append("audio", blob, "recording.webm");
      form.append("phone", phoneNumber);
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
      setUploadData(body.data);

      const state = body.data.call_state;
      if (state === "no_action") {
        setStep("no_action");
      } else if (state === "awaiting_confirmation") {
        setStep("awaiting_confirmation");
      } else if (state === "calling_sent") {
        setStep("calling");
      } else {
        setStep("call_failed");
      }
    } catch (e: any) {
      console.error("[Home] upload flow failed:", e.message);
      setError(e.message);
      setStep("landing");
    }
  };

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
            const savedPhone = typeof window !== "undefined" ? localStorage.getItem("ganseobi_phone") : null;
            if (savedPhone) {
              setPhone(savedPhone);
              doUpload(savedPhone, blob);
            } else {
              setStep("phone_input");
            }
          }}
        />
      )}

      {step === "phone_input" && (
        <PhoneInputScreen
          onSubmit={(phoneNumber: string) => {
            setPhone(phoneNumber);
            if (audioBlob) doUpload(phoneNumber, audioBlob);
          }}
        />
      )}

      {step === "uploading" && (
        <MessageScreen title="듣고 있어요..." onRestart={() => {}} />
      )}

      {step === "no_action" && (
        <MessageScreen
          title="오늘은 그냥 들어둘게."
          onRestart={() => resetAll()}
        />
      )}

     {step === "awaiting_confirmation" && uploadData?.analysis && (
        <ConfirmScreen
          commitment={uploadData.analysis.commitment}
          commitmentType={uploadData.analysis.commitment_type}
          commitmentConfidence={uploadData.analysis.commitment_confidence}
          entryId={entryId!}
          phone={phone}
          onDone={(kept: boolean) => {
            setStep(kept ? "confirmed" : "no_action");
          }}
        />
      )}

      {step === "confirmed" && (
        <MessageScreen title="기억해뒀어." subtitle="필요할 때 다시 꺼낼게." onRestart={() => resetAll()} />
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

      {step === "call_failed" && (
        <MessageScreen
          title="전화 연결이 잘 안 됐어."
          subtitle="그래도 오늘 한 얘기는 기억해뒀어."
          onRestart={() => resetAll()}
        />
      )}

      {step === "result" && (
        <ResultScreen result={result} onRestart={() => resetAll()} />
      )}
    </div>
  );

  function resetAll() {
    setAudioBlob(null);
    setEntryId(null);
    setUploadData(null);
    setResult(null);
    setStep("landing");
  }
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
