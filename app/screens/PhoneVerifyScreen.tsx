
//
// 지금까지 쌓인 기록이 브라우저 저장공간(익명 로그인)에만 묶여있어서, 홈 화면 아이콘으로
// 실행하거나 기기를 바꾸면 새 익명 계정이 생기며 예전 기록이 "사라진 것처럼" 보이는 문제를
// 막기 위한 화면. 전화번호를 이 계정에 실제로 연결(인증)해서 어디서 들어와도 같은 계정으로
// 이어지게 한다.
//
// 동작 원리:
// 1) 먼저 지금 세션(익명 계정)에 번호를 연결 시도(updateUser). 성공하면 지금까지의 기록이
//    그대로 이 번호 계정에 남는다 — user_id가 바뀌지 않기 때문.
// 2) 그 번호가 이미 다른(예전) 계정에 연결되어 있으면(재설치 등으로 이미 인증까지 끝낸 적
//    있는 경우) 그 기존 계정으로 로그인하는 방식(signInWithOtp)으로 자동 전환한다.
//    오늘 새로 생긴 빈 익명 계정은 그냥 버려지고, 기존 계정의 진짜 기록으로 돌아간다.
"use client";

import { useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { BRAND, inkAlpha, pageBackground } from "@/lib/theme";

// Supabase phone auth는 E.164(+82...) 형식을 요구한다.
function normalizePhoneE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("82")) return "+" + digits;
  if (digits.startsWith("0")) return "+82" + digits.slice(1);
  return "+82" + digits;
}

type Stage = "phone" | "code";
type VerifyType = "phone_change" | "sms";

export default function PhoneVerifyScreen({
  onLinked,
  onSkip,
}: {
  onLinked: () => void;
  onSkip: () => void;
}) {
  const [stage, setStage] = useState<Stage>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [verifyType, setVerifyType] = useState<VerifyType>("phone_change");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    const e164 = normalizePhoneE164(phone);
    setBusy(true);
    setError(null);
    try {
      const { error: updateError } = await supabaseClient.auth.updateUser({ phone: e164 });

      if (!updateError) {
        setVerifyType("phone_change");
        setStage("code");
        return;
      }

      // 이미 다른 계정에 등록된 번호 — 그 기존 계정으로 로그인 흐름으로 전환한다.
      const alreadyRegistered =
        (updateError as any)?.code === "phone_exists" ||
        updateError.message?.toLowerCase().includes("already");

      if (alreadyRegistered) {
        const { error: otpError } = await supabaseClient.auth.signInWithOtp({ phone: e164 });
        if (otpError) throw otpError;
        setVerifyType("sms");
        setStage("code");
        return;
      }

      throw updateError;
    } catch (e: any) {
      console.error("[PhoneVerify] 인증번호 요청 실패:", e.message);
      setError("인증번호를 보내지 못했어. 번호를 다시 확인해줘.");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    const e164 = normalizePhoneE164(phone);
    setBusy(true);
    setError(null);
    try {
      const { error: verifyError } = await supabaseClient.auth.verifyOtp({
        phone: e164,
        token: code,
        type: verifyType,
      });
      if (verifyError) throw verifyError;
      onLinked();
    } catch (e: any) {
      console.error("[PhoneVerify] 인증 실패:", e.message);
      setError("인증번호가 맞지 않아. 다시 확인해줘.");
    } finally {
      setBusy(false);
    }
  };

  if (stage === "code") {
    return (
      <div style={styles.container}>
        <p style={styles.headline}>문자로 인증번호 보냈어</p>
        <p style={styles.subhead}>{phone}로 온 6자리 숫자를 입력해줘.</p>

        <input
          style={styles.input}
          type="tel"
          inputMode="numeric"
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        {error && <p style={styles.error}>{error}</p>}

        <button style={styles.button} disabled={!code || busy} onClick={verifyCode}>
          {busy ? "확인 중..." : "확인"}
        </button>
        <button style={styles.skipButton} onClick={() => { setStage("phone"); setCode(""); setError(null); }}>
          번호 다시 입력
        </button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <p style={styles.headline}>이 번호로 계정을 지켜둘게</p>
      <p style={styles.subhead}>홈 화면에 추가하거나 기기를 바꿔도 기록이 안 사라지게.</p>

      <input
        style={styles.input}
        type="tel"
        placeholder="010-0000-0000"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      {error && <p style={styles.error}>{error}</p>}

      <button style={styles.button} disabled={!phone || busy} onClick={sendCode}>
        {busy ? "보내는 중..." : "인증번호 받기"}
      </button>
      <button style={styles.skipButton} onClick={onSkip}>나중에</button>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { minHeight: "100vh", ...pageBackground, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "0 32px" },
  headline: { color: BRAND.ink, fontSize: 22, fontWeight: 900, textAlign: "center", margin: 0 },
  subhead: { color: inkAlpha.muted, fontSize: 14, marginTop: 8, marginBottom: 32, textAlign: "center", fontWeight: 700 },
  input: { width: "100%", maxWidth: 320, padding: "14px 16px", borderRadius: 16, border: "2px solid #111", background: BRAND.card, color: BRAND.ink, fontSize: 16, textAlign: "center", boxShadow: "3px 3px 0px rgba(30,26,38,0.10)" },
  button: { marginTop: 20, width: "100%", maxWidth: 320, padding: "14px 16px", borderRadius: 18, border: "3px solid #111", boxShadow: "4px 4px 0px #111", background: BRAND.lavender, color: "#fff", fontSize: 16, fontWeight: 900, cursor: "pointer" },
  skipButton: { marginTop: 10, padding: "8px 16px", border: "none", background: "transparent", color: inkAlpha.faint, fontSize: 14, cursor: "pointer" },
  error: { color: "#D14343", fontSize: 13, fontWeight: 700, marginTop: 8, textAlign: "center" },
};
