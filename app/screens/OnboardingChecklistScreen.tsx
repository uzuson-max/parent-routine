// app/screens/OnboardingChecklistScreen.tsx
//
// 어항 들어가기 전 마지막 단계 — 숨비의 로그인 시트처럼, 아직 비어 있는 어항 위로 시트가 올라온다.
// 시트 안에서: 마이크(선택) → 번호로 계정 지키기(필수) → 약관·개인정보 동의(필수) → 어항으로 들어가기.
//
// 동작은 예전 체크리스트 그대로다:
// - 전화번호 인증을 필수로 둔 이유: 저장공간이 리셋되며 새 익명 계정이 생기는 상황(홈 화면 아이콘 등)에서도
//   반드시 이 단계를 지나가게 해서 기록을 번호로 지키기 위해. 진짜 첫 실행이든 리셋이든 여기로 온다.
// - 마이크는 거부해도 진행 가능(타이핑으로도 대화할 수 있어서). 여기서 얻은 스트림은 끄지 않고 두어
//   바로 이어지는 첫 녹음이 재사용한다(iOS에서 권한 팝업이 두 번 뜨지 않게).
// - 전화번호·음성을 받고 해외 서비스(OpenAI 등)로 처리하므로 시작 전에 동의를 받는다.
"use client";

import { useState } from "react";
import { requestPhoneLink, confirmPhoneCode, syncVerifiedPhoneToBackend, type PhoneLinkVerifyType } from "@/lib/phoneAuthClient";
import { acquireMicStream } from "@/lib/micStream";
import PeekMascot from "@/components/PeekMascot";
import { worldPage, INK, YELLOW, WORLD_CSS } from "@/components/WorldNav";

type PhoneStage = "idle" | "code";

export default function OnboardingChecklistScreen({ onDone }: { onDone: () => void }) {
  const [micDone, setMicDone] = useState(false);
  const [micBusy, setMicBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);

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
      await acquireMicStream();
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
    // 인증 직후 localStorage/user_memory에도 같은 번호를 반영 — 이게 없으면 방금 인증한
    // 번호인데도 다음 녹음에서 PhoneInputScreen이 다시 뜨고, 실제 전화 발신용 번호도 비게 된다.
    syncVerifiedPhoneToBackend(phone);
  };

  const ready = phoneDone && agreed;

  return (
    <div style={{ ...worldPage, paddingBottom: 0, display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
      <style dangerouslySetInnerHTML={{ __html: WORLD_CSS + CSS }} />

      {/* 뒤에 보이는, 아직 비어 있는 어항 */}
      <div style={s.scene} aria-hidden>
        <div style={s.tank}>
          <div style={s.water}>
            <span className="oc-bub" style={{ ...s.bub, left: "30%", width: 12, height: 12 }} />
            <span className="oc-bub" style={{ ...s.bub, left: "62%", width: 9, height: 9, animationDelay: "-1.2s" }} />
            <span className="oc-bub" style={{ ...s.bub, left: "48%", width: 14, height: 14, animationDelay: "-2.1s" }} />
            <div style={s.sand} />
          </div>
        </div>
        <div style={s.peek}>
          <PeekMascot expression="base" size={70} />
        </div>
      </div>

      {/* 시트 */}
      <div className="oc-sheet" style={s.sheet}>
        <span style={s.grabber} aria-hidden />
        <h1 style={s.title}>아직 텅 빈 니 어항</h1>
        <p style={s.lead}>들어가기 전에 두 가지만.</p>

        {/* 마이크 (선택) */}
        <div style={s.row}>
          <span style={{ ...s.check, ...(micDone ? s.checkOn : null) }} aria-hidden>
            {micDone ? "✓" : ""}
          </span>
          <div style={s.rowMain}>
            <span style={s.rowTitle}>마이크</span>
            <span style={s.rowSub}>말할 때만 써. 거부해도 글로 남길 수 있어.</span>
          </div>
          {!micDone && (
            <button className="wn-sticker" style={s.smallBtn} onClick={requestMic} disabled={micBusy}>
              {micBusy ? "묻는 중..." : "허용"}
            </button>
          )}
        </div>

        {/* 번호로 계정 지키기 (필수) */}
        <div style={{ ...s.row, alignItems: "flex-start" }}>
          <span style={{ ...s.check, ...(phoneDone ? s.checkOn : null) }} aria-hidden>
            {phoneDone ? "✓" : ""}
          </span>
          <div style={{ ...s.rowMain, flex: 1 }}>
            <span style={s.rowTitle}>번호로 내 어항 지키기</span>
            <span style={s.rowSub}>폰을 바꾸거나 홈 화면에 추가해도 기록이 그대로 남아.</span>
            {!phoneDone && (
              <div style={s.inputRow}>
                {phoneStage === "idle" ? (
                  <input
                    id="ob-phone"
                    style={s.input}
                    type="tel"
                    placeholder="010-0000-0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                ) : (
                  <input
                    id="ob-code"
                    style={s.input}
                    type="tel"
                    inputMode="numeric"
                    placeholder="인증번호 6자리"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                )}
                <button
                  className="wn-sticker"
                  style={s.smallBtn}
                  onClick={phoneStage === "idle" ? sendCode : verifyCode}
                  disabled={phoneBusy || (phoneStage === "idle" ? !phone : !code)}
                >
                  {phoneBusy ? "잠깐만..." : phoneStage === "idle" ? "인증번호 받기" : "확인"}
                </button>
              </div>
            )}
            {phoneError && <span style={s.error}>{phoneError}</span>}
          </div>
        </div>

        {/* 동의 (필수) */}
        <label style={s.consent}>
          <input id="ob-agree" type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={s.consentBox} />
          <span>
            <a href="/terms" target="_blank" rel="noreferrer" style={s.link}>
              이용약관
            </a>
            과{" "}
            <a href="/privacy" target="_blank" rel="noreferrer" style={s.link}>
              개인정보처리방침
            </a>
            (국외 이전 포함)에 동의해. 만 14세 이상이야.
          </span>
        </label>

        <button className="wn-sticker" style={{ ...s.cta, ...(ready ? null : s.ctaOff) }} disabled={!ready} onClick={onDone}>
          어항으로 들어가기
        </button>
      </div>
    </div>
  );
}

const CSS = `
.oc-sheet { animation: ocUp .45s cubic-bezier(.2,1.05,.4,1); }
@keyframes ocUp { from { translate: 0 100%; } to { translate: 0 0; } }
.oc-bub { animation: ocRise 4s linear infinite; }
@keyframes ocRise { 0% { bottom: 30px; opacity: 0; } 15% { opacity: 1; } 100% { bottom: 85%; opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .oc-sheet, .oc-bub { animation: none; } }
`;

const s: { [k: string]: React.CSSProperties } = {
  scene: { position: "relative", flex: "1 0 200px", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 0 28px" },
  tank: {
    width: "min(78%, 280px)",
    aspectRatio: "280 / 200",
    border: `4px solid ${INK}`,
    borderRadius: 30,
    boxShadow: "6px 6px 0 rgba(27,22,48,.22)",
    background: "#EAF9FF",
    padding: "14px 0 0",
    boxSizing: "border-box",
    overflow: "hidden",
  },
  water: { position: "relative", width: "100%", height: "100%", background: "#45BFEC", borderTop: "3px solid #FFFFFF" },
  sand: { position: "absolute", left: 0, right: 0, bottom: 0, height: 28, background: "#F6D589", borderTop: `3px solid ${INK}` },
  bub: { position: "absolute", bottom: 30, borderRadius: "50%", border: "2px solid rgba(255,255,255,.95)", background: "rgba(255,255,255,.25)" },
  peek: { position: "absolute", right: "max(4%, calc(50% - 190px))", top: "30%", transform: "rotate(-10deg)" },
  sheet: {
    position: "relative",
    margin: "0 -20px",
    padding: "12px 22px max(24px, calc(env(safe-area-inset-bottom, 0px) + 18px))",
    background: "#FFF9E8",
    borderTop: `3px solid ${INK}`,
    borderRadius: "28px 28px 0 0",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  grabber: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, background: "rgba(27,22,48,.2)" },
  title: { margin: "4px 0 0", fontSize: 24, fontWeight: 400, textAlign: "center" },
  lead: { margin: "-8px 0 2px", fontSize: 15, color: "rgba(27,22,48,.6)", textAlign: "center" },
  row: { display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "#FFFFFF", border: `3px solid ${INK}`, borderRadius: 20, boxShadow: `3px 3px 0 ${INK}` },
  check: {
    flexShrink: 0,
    width: 26,
    height: 26,
    borderRadius: "50%",
    border: `2.5px solid ${INK}`,
    background: "#FFFFFF",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    color: INK,
  },
  checkOn: { background: YELLOW },
  rowMain: { minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 2 },
  rowTitle: { fontSize: 17 },
  rowSub: { fontSize: 13, lineHeight: 1.4, color: "rgba(27,22,48,.6)", wordBreak: "keep-all" },
  inputRow: { display: "flex", gap: 8, marginTop: 8 },
  input: {
    flex: 1,
    minWidth: 0,
    padding: "10px 12px",
    borderRadius: 14,
    border: `2.5px solid ${INK}`,
    background: "#FFFFFF",
    fontSize: 16,
    fontFamily: "'Jua', sans-serif",
    color: INK,
  },
  smallBtn: {
    flexShrink: 0,
    minHeight: 42,
    padding: "0 14px",
    borderRadius: 14,
    border: `2.5px solid ${INK}`,
    background: YELLOW,
    boxShadow: `3px 3px 0 ${INK}`,
    fontSize: 15,
    color: INK,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  error: { marginTop: 6, fontSize: 13, color: "#C24444" },
  consent: { display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13.5, lineHeight: 1.5, cursor: "pointer", padding: "0 2px" },
  consentBox: { width: 20, height: 20, marginTop: 1, flexShrink: 0, accentColor: INK },
  link: { color: "#4D3F73", textDecoration: "underline" },
  cta: {
    minHeight: 56,
    borderRadius: 999,
    border: `3px solid ${INK}`,
    background: YELLOW,
    boxShadow: `4px 4px 0 ${INK}`,
    fontSize: 19,
    color: INK,
    cursor: "pointer",
  },
  ctaOff: { opacity: 0.45, cursor: "not-allowed", boxShadow: "none" },
};
