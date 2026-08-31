
"use client";

import { useState, useEffect } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import TimelineScreen, { type RecordEntry } from "./screens/TimelineScreen";
import LandingScreen from "./screens/LandingScreen";
import RecordingScreen from "./screens/RecordingScreen";
import PhoneInputScreen from "./screens/PhoneInputScreen";
import ConfirmScreen from "./screens/ConfirmScreen";
import MessageScreen from "./screens/MessageScreen";
import CallingScreen from "./screens/CallingScreen";
import ResultScreen from "./screens/ResultScreen";
import NicknameScreen from "./screens/NicknameScreen";
import CalendarScreen from "./screens/CalendarScreen";
import OnboardingScreen from "./screens/OnboardingScreen";
import ThinkingScreen from "./screens/ThinkingScreen"; // 👈 1. 상단 import에 추가 완료!

const ONBOARDING_KEY = "ganseobi_onboarding_completed";

type Step =
  | "onboarding"       
  | "landing"          
  | "raw_landing"      
  | "recording"
  | "phone_input"
  | "nickname"         
  | "calendar"         
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
  const [selectedTopic, setSelectedTopic] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [entryId, setEntryId] = useState<string | null>(null);
  const [uploadData, setUploadData] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<RecordEntry[] | null>(null);

  const fetchEntries = async () => {
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/user/entries", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const body = await res.json();
      if (body.success) setEntries(body.data);
    } catch (e) {
      console.error("[Home] fetch entries failed:", e);
    }
  };

  useEffect(() => {
    const ensureSession = async () => {
      if (typeof window !== "undefined" && !localStorage.getItem(ONBOARDING_KEY)) {
        setStep("onboarding");
      }

      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) {
        const { error } = await supabaseClient.auth.signInAnonymously();
        if (error) console.error("[auth] 익명 로그인 실패:", error.message);
      }
      fetchEntries();
    };
    ensureSession();
  }, []);

  useEffect(() => {
    if (step === "landing") fetchEntries();
  }, [step]);

  const doUpload = async (phoneNumber: string, blob: Blob) => {
    setStep("uploading");
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) {
        throw new Error("로그인 세션을 만들지 못했습니다. 새로고침 후 다시 시도해주세요.");
      }

      const form = new FormData();
      form.append("audio", blob, "recording.webm");
      form.append("phone", phoneNumber);
      form.append("persona", "coach");
      if (selectedTopic) {
        form.append("topic", selectedTopic);
      }

      const res = await fetch("/api/voice/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: form,
      });

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
    <div style={{ minHeight: "100vh", background: "#C71585" }}>
      {error && (
        <div style={errorBannerStyle}>
          문제가 생겼어: {error}
          <button style={{ marginLeft: 12, background: "#111", color: "#E5FF5D", border: "none", padding: "4px 8px", cursor: "pointer", fontWeight: "bold" }} onClick={() => { setError(null); setStep("landing"); }}>
            처음으로
          </button>
        </div>
      )}

      {step === "onboarding" && (
        <OnboardingScreen
          onComplete={() => {
            if (typeof window !== "undefined") localStorage.setItem(ONBOARDING_KEY, "1");
            setStep("landing");
          }}
        />
      )}

      {step === "landing" && (
        <TimelineScreen
          entries={entries}
          onOpenCalendar={() => setStep("calendar")}
          onOpenRecording={() => {
            setSelectedTopic("");
            setStep("recording");
          }}
        />
      )}

      {step === "calendar" && (
        <CalendarScreen
          entries={entries}
          onBack={() => setStep("landing")}
        />
      )}

      {step === "raw_landing" && (
        <LandingScreen
          onStart={(topic?: string) => {
            if (topic) setSelectedTopic(topic);
            setStep("recording");
          }}
        />
      )}

      {step === "recording" && (
        <RecordingScreen
          initialTopic={selectedTopic}
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

      {step === "nickname" && (
        <NicknameScreen
          onSubmit={async (nickname: string) => {
            try {
              const { data: { session } } = await supabaseClient.auth.getSession();
              if (session) {
                await fetch("/api/user/nickname", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session.access_token}`,
                  },
                  body: JSON.stringify({ nickname }),
                });
              }
            } catch (e) {
              console.error("[Home] nickname save failed:", e);
            } finally {
              if (typeof window !== "undefined") localStorage.setItem("ganseobi_nickname_asked", "1");
              setStep("landing");
            }
          }}
          onSkip={() => {
            if (typeof window !== "undefined") localStorage.setItem("ganseobi_nickname_asked", "1");
            setStep("landing");
          }}
        />
      )}

      {/* 👈 2. 기존 MessageScreen 대신 ThinkingScreen으로 교체 완료! */}
      {step === "uploading" && <ThinkingScreen />}

      {step === "no_action" && (
        <MessageScreen
          title={uploadData?.response?.response || "오늘은 그냥 들어둘게."}
          transcriptPreview={uploadData?.transcript}
          onRestart={() => resetAll()}
        />
      )}

      {step === "awaiting_confirmation" && uploadData?.analysis && (
        <ConfirmScreen
          reaction={uploadData?.response?.response}
          commitment={uploadData.analysis.commitment}
          commitmentType={uploadData.analysis.commitment_type}
          commitmentConfidence={uploadData.analysis.commitment_confidence}
          entryId={entryId!}
          phone={phone}
          onDone={(kept: boolean) => setStep(kept ? "confirmed" : "no_action")}
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
        <ResultScreen
          result={result}
          onRestart={() => resetAll()}
          onHome={() => {
            setAudioBlob(null);
            setSelectedTopic("");
            setEntryId(null);
            setUploadData(null);
            setResult(null);
            setStep("landing");
          }}
        />
      )}
    </div>
  );

  function resetAll() {
    setAudioBlob(null);
    setSelectedTopic("");
    setEntryId(null);
    setUploadData(null);
    setResult(null);

    const alreadyAsked = typeof window !== "undefined" && localStorage.getItem("ganseobi_nickname_asked");
    if (!alreadyAsked) {
      setStep("nickname");
    } else {
      setStep("landing");
    }
  }
}

const errorBannerStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  background: "#111",
  color: "#E5FF5D",
  padding: "12px 16px",
  fontSize: 14,
  zIndex: 999,
  textAlign: "center",
  fontWeight: "bold",
  borderBottom: "2px solid #E5FF5D",
};
