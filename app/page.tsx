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
import MicPermissionScreen from "./screens/MicPermissionScreen";
import FirstTalkScreen from "./screens/FirstTalkScreen";

const ONBOARDING_KEY = "ganseobi_onboarding_completed";
// 첫 실행 사용자가 "첫 녹음 → 첫 기록"까지 마쳤는지 표시. 한 번 true가 되면 그 세션에서만
// 닉네임/전화번호 같은 부가 입력을 건너뛰기 위한 용도로만 쓰고, 이후에는 기존 플로우를 그대로 탄다.
const FIRST_ENTRY_DONE_KEY = "ganseobi_first_entry_done";

type Step =
  | "onboarding"
  | "mic_permission"
  | "first_talk"
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
  const [audioBlob, setAudioBlob] = useState<Blob | string | null>(null); // 음성 Blob 또는 텍스트 입력 문자열
  const [selectedTopic, setSelectedTopic] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [entryId, setEntryId] = useState<string | null>(null);
  const [uploadData, setUploadData] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<RecordEntry[] | null>(null);
  // 온보딩을 막 끝낸 사용자의 "첫 녹음 → 첫 기록" 여정 동안만 true.
  // 이 값이 true인 동안에는 전화번호/닉네임 같은 부가 입력을 요구하지 않고 바로 홈까지 보낸다.
  const [isFirstRun, setIsFirstRun] = useState(false);

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

  const doUpload = async (phoneNumber: string, input: Blob | string) => {
    setStep("uploading");
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) {
        throw new Error("로그인 세션을 만들지 못했습니다. 새로고침 후 다시 시도해주세요.");
      }

      const form = new FormData();
      if (typeof input === "string") {
        form.append("text", input);
      } else {
        form.append("audio", input, "recording.webm");
      }
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
            // 온보딩을 막 끝낸 사람 = 이 앱을 처음 쓰는 사람.
            // 바로 홈으로 보내지 않고 마이크 권한 안내 → 첫 녹음으로 이어지는 첫 실행 흐름을 태운다.
            setIsFirstRun(true);
            setStep("mic_permission");
          }}
        />
      )}

      {step === "mic_permission" && (
        <MicPermissionScreen
          onNext={() => {
            // 허용/거부 여부와 무관하게 진행한다 — 거부해도 텍스트 입력으로 첫 대화를 할 수 있고,
            // 브라우저/OS가 관리하는 권한 자체를 우리가 강제로 바꾸지는 않는다.
            setStep("first_talk");
          }}
        />
      )}

      {step === "first_talk" && (
        <FirstTalkScreen
          onStart={() => {
            setSelectedTopic("");
            setStep("recording");
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
          onFinish={(input: Blob | string) => {
            setAudioBlob(input);
            const savedPhone = typeof window !== "undefined" ? localStorage.getItem("ganseobi_phone") : null;

            // 첫 실행의 첫 녹음은 전화번호가 없어도 바로 분석/저장까지 보낸다.
            // 전화번호는 이제 서버에서도 선택값(없어도 녹음은 저장됨)이고, 실제 개입(전화)이
            // 필요한 시점에 물어보는 기존 구조(awaiting_phone → PhoneInputScreen)를 그대로 둔다.
            if (isFirstRun) {
              doUpload(savedPhone || "", input);
              return;
            }

            if (savedPhone) {
              setPhone(savedPhone);
              doUpload(savedPhone, input);
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
          firstRun={isFirstRun}
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
          firstRun={isFirstRun}
        />
      )}

      {step === "confirmed" && (
        <MessageScreen title="기억해뒀어." subtitle="필요할 때 다시 꺼낼게." onRestart={() => resetAll()} firstRun={isFirstRun} />
      )}

      {step === "calling" && entryId && (
        <CallingScreen
          entryId={entryId}
          onCallEnded={(finishedEntry) => {
            setResult(finishedEntry);
            setStep("result");
          }}
          onHome={() => resetAll()}
        />
      )}

      {step === "call_failed" && (
        <MessageScreen
          title="전화 연결이 잘 안 됐어."
          subtitle="그래도 오늘 한 얘기는 기억해뒀어."
          onRestart={() => resetAll()}
          firstRun={isFirstRun}
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
            markFirstEntryDoneIfNeeded();
            setStep("landing");
          }}
        />
      )}
    </div>
  );

  // 첫 실행 여정(온보딩→마이크 권한→첫 녹음)이 끝났음을 표시한다.
  // 한 번 호출되면 이후 녹음부터는 완전히 기존 플로우(닉네임 질문 등 포함)를 그대로 탄다.
  function markFirstEntryDoneIfNeeded() {
    if (!isFirstRun) return;
    if (typeof window !== "undefined") localStorage.setItem(FIRST_ENTRY_DONE_KEY, "1");
    setIsFirstRun(false);
  }

  function resetAll() {
    setAudioBlob(null);
    setSelectedTopic("");
    setEntryId(null);
    setUploadData(null);
    setResult(null);

    // 첫 실행의 첫 기록 직후에는 회원가입성 질문(닉네임 등)을 요구하지 않고 바로 홈으로 보낸다.
    // 닉네임은 원래 있던 구조 그대로 "다음" 녹음부터 필요해지는 시점에 물어본다.
    if (isFirstRun) {
      markFirstEntryDoneIfNeeded();
      setStep("landing");
      return;
    }

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
