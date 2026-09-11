
//
// 마이크 권한 + 전화번호 인증을 한 화면에서 체크리스트 형태로 끝내는 화면.
// 원래는 마이크 권한(MicPermissionScreen)과 전화번호 인증(PhoneVerifyScreen)이 서로 다른
// 시점에 따로 떠서, "저장공간이 리셋되며 새 익명 계정이 생기는" 바로 그 상황(홈 화면 아이콘
// 등)에서는 전화번호 인증 화면 자체가 뜨지 않는 문제가 있었다 — 그 상황은 앱 입장에서
// "첫 실행"으로 보이는데, 첫 실행 흐름은 마찰을 줄이려고 전화번호 질문을 두 번째 기록 이후로
// 미루게 짜여 있었기 때문. 전화번호 인증을 여기로 옮기고 필수로 만들어서, 어떤 경로로 들어와도
// (진짜 첫 실행이든, 저장공간 리셋으로 다시 첫 실행처럼 보이는 경우든) 반드시 지나가게 한다.
//
// 마이크 권한은 기존처럼 거부해도 진행 가능(체크만 되고 넘어감). 전화번호 인증만 필수 —
// 완료해야 "다음" 버튼이 활성화된다.
"use client";

import { useState } from "react";
import { BRAND, inkAlpha, pageBackground } from "@/lib/theme";
import { requestPhoneLink, confirmPhoneCode, type PhoneLinkVerifyType } from "@/lib/phoneAuthClient";
import Mascot from "@/components/Mascot";

type PhoneStage = "idle" | "code";

export default function OnboardingChecklistScreen({ onDone }: { onDone: () => void }) {
  const [micDone, setMicDone] = useState(false);
  const [micBusy, setMicBusy] = useState(false);

  const [phoneStage, setPhoneStage] = useState<PhoneStage>("idle");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [verifyType, setVerifyType] = useState<PhoneLinkVerifyType>("phone_change");
  const [phoneDone, setPhoneDone] = useState(false);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const requestMic = async () => {
    setMicBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      // 거부해도 앱은 계속 진행 — 텍스트 입력으로도 대화할 수 있어서.
    } finally {
      setMicBusy(false);
      setMicDone(true);
    }
  };

  const sendCode = async () => {
    setPhoneBusy(true);
    setPhoneError(null);
    const { verifyType: vt, error } = await requestPhoneLink(phone, { allowExistingAccountFallback: true });
    setPhoneBusy(false);
    if (error || !vt) {
      setPhoneError(error ?? "인증번호를 보내지 못했어.");
      return;
    }
    setVerifyType(vt);
    setPhoneStage("code");
  };

  const verifyCode = async () => {
    setPhoneBusy(true);
    setPhoneError(null);
    const { error } = await confirmPhoneCode(phone, code, verifyType);
    setPhoneBusy(false);
    if (error) {
      setPhoneError(error);
      return;
    }
    setPhoneDone(true);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <Mascot pose="기본" size={72} />
        <h1 style={styles.headline}>시작하기 전에{"\n"}딱 두 가지만</h1>
      </div>

      {/* 항목 1: 마이크 권한 (선택) */}
      <div style={styles.item}>
        <div style={styles.itemTop}>
          <span style={{ ...styles.checkbox, ...(micDone ? styles.checkboxDone : {}) }}>{micDone ? "✓" : ""}</span>
          <span style={styles.itemTitle}>마이크 권한</span>
        </div>
        <p style={styles.itemDesc}>말할 때만 사용할 거야. 거부해도 타이핑으로 계속할 수 있어.</p>
        {!micDone && (
          <button style={styles.smallButton} onClick={requestMic} disabled={micBusy}>
            {micBusy ? "물어보는 중..." : "허용하기"}
          </button>
        )}
      </div>

      {/* 항목 2: 전화번호 인증 (필수) */}
      <div style={styles.item}>
        <div style={styles.itemTop}>
          <span style={{ ...styles.checkbox, ...(phoneDone ? styles.checkboxDone : {}) }}>{phoneDone ? "✓" : ""}</span>
          <span style={styles.itemTitle}>
            번호로 계정 지키기 <span style={styles.required}>*필수</span>
          </span>
        </div>
        <p style={styles.itemDesc}>
          번호를 인증해두면 기기를 바꾸거나 홈 화면에 추가해도{"\n"}기록이 안전하게 보관돼.
        </p>

        {!phoneDone && phoneStage === "idle" && (
          <div style={styles.inlineRow}>
            <input
              style={styles.input}
              type="tel"
              placeholder="010-0000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <button style={styles.smallButton} onClick={sendCode} disabled={!phone || phoneBusy}>
              {phoneBusy ? "보내는 중..." : "인증번호 받기"}
            </button>
          </div>
        )}

        {!phoneDone && phoneStage === "code" && (
          <div style={styles.inlineRow}>
            <input
              style={styles.input}
              type="tel"
              inputMode="numeric"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <button style={styles.smallButton} onClick={verifyCode} disabled={!code || phoneBusy}>
              {phoneBusy ? "확인 중..." : "확인"}
            </button>
          </div>
        )}
        {phoneError && <p style={styles.error}>{phoneError}</p>}
      </div>

      <button
        style={{ ...styles.mainButton, ...(phoneDone ? {} : styles.mainButtonDisabled) }}
        disabled={!phoneDone}
        onClick={onDone}
      >
        다음
      </button>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: "100vh",
    ...pageBackground,
    display: "flex",
    flexDirection: "column",
    padding: "40px 24px 32px",
    boxSizing: "border-box",
    gap: 20,
  },
  header: { display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 8 },
  headline: { color: BRAND.ink, fontSize: 22, fontWeight: 900, textAlign: "center", margin: 0, whiteSpace: "pre-line", lineHeight: 1.35 },
  item: { background: BRAND.card, border: "2px solid #111", borderRadius: 18, padding: "16px 18px", boxShadow: "3px 4px 0px rgba(30,26,38,0.10)" },
  itemTop: { display: "flex", alignItems: "center", gap: 10, marginBottom: 6 },
  checkbox: {
    width: 22,
    height: 22,
    minWidth: 22,
    borderRadius: "50%",
    border: "2px solid #111",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 900,
    color: "#fff",
  },
  checkboxDone: { background: BRAND.mint, borderColor: BRAND.mint },
  itemTitle: { fontSize: 16, fontWeight: 900, color: BRAND.ink },
  required: { fontSize: 11, fontWeight: 900, color: BRAND.lavenderDeep, marginLeft: 4 },
  itemDesc: { fontSize: 13, color: inkAlpha.muted, margin: "0 0 12px 0", lineHeight: 1.5, fontWeight: 700, whiteSpace: "pre-line" },
  inlineRow: { display: "flex", gap: 8 },
  input: { flex: 1, minWidth: 0, padding: "12px 14px", borderRadius: 14, border: "2px solid #111", background: "#fff", color: BRAND.ink, fontSize: 15 },
  smallButton: { padding: "12px 16px", borderRadius: 14, border: "2px solid #111", background: BRAND.lavender, color: "#fff", fontSize: 14, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap" },
  error: { color: "#D14343", fontSize: 12, fontWeight: 700, marginTop: 8 },
  mainButton: {
    marginTop: "auto",
    width: "100%",
    padding: "16px",
    borderRadius: 18,
    border: "3px solid #111",
    boxShadow: "4px 4px 0px #111",
    background: BRAND.lavender,
    color: "#fff",
    fontSize: 16,
    fontWeight: 900,
    cursor: "pointer",
  },
  mainButtonDisabled: { opacity: 0.4, cursor: "not-allowed", boxShadow: "none" },
};
