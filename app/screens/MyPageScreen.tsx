//
// 계정에 인증되어 있는 전화번호를 보여주고 바꿀 수 있는 화면.
// 번호를 바꿔도 user_id는 그대로라 지금까지의 기록은 그대로 이 계정에 남는다 —
// Supabase auth의 phone 필드만 갱신되는 거라(updateUser + verifyOtp) 데이터 이전/마이그레이션이
// 따로 필요하지 않다.
//
// requestPhoneLink를 allowExistingAccountFallback=false로 호출한다 — 온보딩 체크리스트와
// 달리, 여기서 새 번호가 이미 다른 계정에 등록돼 있다고 그 계정으로 조용히 로그인 전환해버리면
// 사용자가 원치 않게 다른 계정으로 넘어가는 사고가 될 수 있어서, 그 경우는 에러로만 알려준다.
"use client";

import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { requestPhoneLink, confirmPhoneCode, syncVerifiedPhoneToBackend, type PhoneLinkVerifyType } from "@/lib/phoneAuthClient";
import { BRAND, inkAlpha, pageBackground } from "@/lib/theme";

function maskPhone(e164: string | null | undefined): string {
  if (!e164) return "등록된 번호 없음";
  const digits = e164.replace(/\D/g, "").replace(/^82/, "0");
  if (digits.length < 7) return digits;
  return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
}

type Mode = "view" | "edit_phone" | "edit_code";

export default function MyPageScreen({ onBack }: { onBack: () => void }) {
  const [currentPhone, setCurrentPhone] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [newPhone, setNewPhone] = useState("");
  const [code, setCode] = useState("");
  const [verifyType, setVerifyType] = useState<PhoneLinkVerifyType>("phone_change");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    supabaseClient.auth.getUser().then(({ data: { user } }) => {
      setCurrentPhone(user?.phone ?? null);
    });
  }, []);

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    const { verifyType: vt, error: err } = await requestPhoneLink(newPhone, { allowExistingAccountFallback: false });
    setBusy(false);
    if (err || !vt) {
      setError(err ?? "인증번호를 보내지 못했어.");
      return;
    }
    setVerifyType(vt);
    setMode("edit_code");
  };

  const verifyCode = async () => {
    setBusy(true);
    setError(null);
    const { error: err } = await confirmPhoneCode(newPhone, code, verifyType);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setCurrentPhone(newPhone);
    setDone(true);
    setMode("view");
    // 온보딩 체크리스트와 같은 이유 — 번호를 바꿔도 localStorage/user_memory가 예전 번호를
    // 그대로 들고 있으면, 다음 녹음의 실제 전화 발신이 옛날 번호로 나갈 수 있다.
    syncVerifiedPhoneToBackend(newPhone);
    setNewPhone("");
    setCode("");
  };

  return (
    <div style={styles.container}>
      <button style={styles.backButton} onClick={onBack}>← 뒤로</button>
      <h1 style={styles.headline}>내 정보</h1>

      <div style={styles.card}>
        <p style={styles.label}>인증된 번호</p>
        <p style={styles.value}>{maskPhone(currentPhone)}</p>
        {done && <p style={styles.doneNote}>번호가 바뀌었어.</p>}

        {mode === "view" && (
          <button
            style={styles.smallButton}
            onClick={() => {
              setMode("edit_phone");
              setError(null);
              setDone(false);
            }}
          >
            번호 변경
          </button>
        )}

        {mode === "edit_phone" && (
          <div style={styles.editBlock}>
            <input
              style={styles.input}
              type="tel"
              placeholder="새 번호 (010-0000-0000)"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
            />
            <div style={styles.rowGap}>
              <button style={styles.smallButton} onClick={sendCode} disabled={!newPhone || busy}>
                {busy ? "보내는 중..." : "인증번호 받기"}
              </button>
              <button style={styles.cancelButton} onClick={() => setMode("view")}>취소</button>
            </div>
          </div>
        )}

        {mode === "edit_code" && (
          <div style={styles.editBlock}>
            <input
              style={styles.input}
              type="tel"
              inputMode="numeric"
              placeholder="인증번호 6자리"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <div style={styles.rowGap}>
              <button style={styles.smallButton} onClick={verifyCode} disabled={!code || busy}>
                {busy ? "확인 중..." : "확인"}
              </button>
              <button style={styles.cancelButton} onClick={() => setMode("view")}>취소</button>
            </div>
          </div>
        )}

        {error && <p style={styles.error}>{error}</p>}
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { minHeight: "100vh", ...pageBackground, padding: "24px 20px", boxSizing: "border-box" },
  backButton: { background: "transparent", border: "none", color: inkAlpha.muted, fontSize: 14, fontWeight: 900, cursor: "pointer", padding: 0, marginBottom: 16 },
  headline: { color: BRAND.ink, fontSize: 22, fontWeight: 900, margin: "0 0 20px 0" },
  card: { background: BRAND.card, border: "2px solid #111", borderRadius: 18, padding: "20px", boxShadow: "3px 4px 0px rgba(30,26,38,0.10)" },
  label: { fontSize: 12, fontWeight: 900, color: inkAlpha.faint, margin: "0 0 4px 0", letterSpacing: 0.5 },
  value: { fontSize: 18, fontWeight: 900, color: BRAND.ink, margin: "0 0 14px 0" },
  doneNote: { fontSize: 13, color: BRAND.lavenderDeep, fontWeight: 700, margin: "-8px 0 14px 0" },
  smallButton: { padding: "12px 16px", borderRadius: 14, border: "2px solid #111", background: BRAND.lavender, color: "#fff", fontSize: 14, fontWeight: 900, cursor: "pointer" },
  cancelButton: { padding: "12px 16px", borderRadius: 14, border: "2px solid #111", background: "transparent", color: inkAlpha.muted, fontSize: 14, fontWeight: 900, cursor: "pointer" },
  editBlock: { display: "flex", flexDirection: "column", gap: 10, marginTop: 4 },
  rowGap: { display: "flex", gap: 8 },
  input: { padding: "12px 14px", borderRadius: 14, border: "2px solid #111", background: "#fff", color: BRAND.ink, fontSize: 15 },
  error: { color: "#D14343", fontSize: 12, fontWeight: 700, marginTop: 10 },
};
