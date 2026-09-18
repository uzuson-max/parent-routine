
//
// MY 화면 — 원래는 전화번호 인증 카드 하나만 있던 화면을 "참견이 기본 설정 + 내 정보"로 확장한다.
//
// 확장 원칙(이번 작업 범위):
// - 기존 전화번호 인증/변경 로직(requestPhoneLink/confirmPhoneCode/syncVerifiedPhoneToBackend)은
//   그대로 두고, 화면에서의 위치만 "전화번호" row 하나로 옮긴다.
// - 닉네임/기록 수는 기존 /api/user/me(lib/userClient.fetchMe)를 그대로 재사용한다 — 새 API 없음.
// - "내가 남긴 기억"은 새로운 memory 열람 화면을 만들지 않고, 이미 있는 CalendarScreen(기존
//   "기록" 네비게이션 목적지, entries 기반)으로 그대로 연결한다.
// - 효과음/알림/참견 정도는 이 앱에 아직 전역 상태/DB 컬럼이 전혀 없어서(레포 전체 검색으로 확인),
//   localStorage에 값만 저장하는 설정 UI로 우선 구현한다. 알림 토글은 실제 OS notification
//   permission을 다시 요청하지 않는다(그 로직 자체가 없으므로 충돌할 것도 없음) — 순수 사용자
//   선호값이고, 실제 알림 발송/참견 강도 로직과의 연결은 추후 백엔드 작업이 필요하다.
// - 의견 보내기/이용약관/개인정보처리방침은 연결할 기존 기능이나 URL이 없어서(레포 전체 검색으로
//   확인), 임의로 새 URL을 만들지 않고 클릭 가능한 placeholder(짧은 안내 토스트)까지만 만든다.
// - 회원탈퇴는 안전하게 구현된 삭제 API가 없어서(레포 전체 검색으로 확인) 실제 계정 삭제를
//   구현하지 않고, 확인 시트 + 안내 메시지까지만 만든다.
// - 로그아웃은 기존 supabaseClient.auth(anonymous sign-in에도 이미 쓰는 그 인스턴스)의
//   표준 signOut()을 그대로 사용한다.
//
"use client";

import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { requestPhoneLink, confirmPhoneCode, syncVerifiedPhoneToBackend, type PhoneLinkVerifyType } from "@/lib/phoneAuthClient";
import { fetchMe } from "@/lib/userClient";
import { BRAND, inkAlpha, pageBackground, tactile, typography, TACTILE_PRESS_CLASS } from "@/lib/theme";

function maskPhone(e164: string | null | undefined): string {
  if (!e164) return "등록된 번호 없음";
  const digits = e164.replace(/\D/g, "").replace(/^82/, "0");
  if (digits.length < 7) return digits;
  return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
}

type PhoneMode = "view" | "edit_phone" | "edit_code";

// --- 참견 정도 -----------------------------------------------------------
// 실제 intervention_stage(commitment_memory)는 "약속 하나가 지금 몇 번째 재촉 단계인지"를
// 나타내는 값이라 이 설정과 의미가 다르다(사용자 전역 선호 vs 개별 약속의 진행 상태) — 그대로
// 재사용할 수 없어서, 이번 작업에서는 로컬에 선호값만 저장해둔다.
type InterventionLevel = "low" | "medium" | "high";
const INTERVENTION_KEY = "ganseobi_intervention_level";
const SOUND_KEY = "ganseobi_sound_enabled";
const NOTIFICATION_KEY = "ganseobi_notifications_enabled";

const INTERVENTION_OPTIONS: { level: InterventionLevel; label: string; desc: string }[] = [
  { level: "low", label: "살짝", desc: "앱 안에서 조용히 참견해요." },
  { level: "medium", label: "적당히", desc: "필요할 때 먼저 말을 걸어요." },
  { level: "high", label: "많이", desc: "조금 더 적극적으로 참견해요." },
];

function readBoolPref(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === "1";
}

function readIntervention(): InterventionLevel {
  if (typeof window === "undefined") return "medium";
  const raw = window.localStorage.getItem(INTERVENTION_KEY);
  if (raw === "low" || raw === "medium" || raw === "high") return raw;
  return "medium";
}

type SheetKind = "intervention" | "delete_confirm" | null;

export default function MyPageScreen({ onBack, onOpenRecords }: { onBack: () => void; onOpenRecords: () => void }) {
  // --- 사용자 정보 ---
  const [nickname, setNickname] = useState<string | null>(null);
  const [entryCount, setEntryCount] = useState<number | null>(null);
  const [currentPhone, setCurrentPhone] = useState<string | null>(null);

  // --- 전화번호 인증(기존 로직 그대로) ---
  const [phoneMode, setPhoneMode] = useState<PhoneMode>("view");
  const [newPhone, setNewPhone] = useState("");
  const [code, setCode] = useState("");
  const [verifyType, setVerifyType] = useState<PhoneLinkVerifyType>("phone_change");
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneDone, setPhoneDone] = useState(false);

  // --- 참견이 설정(로컬 저장) ---
  const [soundOn, setSoundOn] = useState(true);
  const [notificationsOn, setNotificationsOn] = useState(true);
  const [interventionLevel, setInterventionLevel] = useState<InterventionLevel>("medium");

  // --- 오버레이(bottom sheet) / 토스트 ---
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    setSoundOn(readBoolPref(SOUND_KEY, true));
    setNotificationsOn(readBoolPref(NOTIFICATION_KEY, true));
    setInterventionLevel(readIntervention());

    supabaseClient.auth.getUser().then(({ data: { user } }) => {
      setCurrentPhone(user?.phone ?? null);
    });

    supabaseClient.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      fetchMe(session.access_token).then((profile) => {
        if (!profile) return;
        setNickname(profile.nickname);
        setEntryCount(profile.entry_count);
      });
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    if (typeof window !== "undefined") window.localStorage.setItem(SOUND_KEY, next ? "1" : "0");
  };

  const toggleNotifications = () => {
    const next = !notificationsOn;
    setNotificationsOn(next);
    if (typeof window !== "undefined") window.localStorage.setItem(NOTIFICATION_KEY, next ? "1" : "0");
  };

  const chooseIntervention = (level: InterventionLevel) => {
    setInterventionLevel(level);
    if (typeof window !== "undefined") window.localStorage.setItem(INTERVENTION_KEY, level);
    setSheet(null);
  };

  const sendCode = async () => {
    setPhoneBusy(true);
    setPhoneError(null);
    const { verifyType: vt, error: err } = await requestPhoneLink(newPhone, { allowExistingAccountFallback: false });
    setPhoneBusy(false);
    if (err || !vt) {
      setPhoneError(err ?? "인증번호를 보내지 못했어.");
      return;
    }
    setVerifyType(vt);
    setPhoneMode("edit_code");
  };

  const verifyCode = async () => {
    setPhoneBusy(true);
    setPhoneError(null);
    const { error: err } = await confirmPhoneCode(newPhone, code, verifyType);
    setPhoneBusy(false);
    if (err) {
      setPhoneError(err);
      return;
    }
    setCurrentPhone(newPhone);
    setPhoneDone(true);
    setPhoneMode("view");
    syncVerifiedPhoneToBackend(newPhone);
    setNewPhone("");
    setCode("");
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await supabaseClient.auth.signOut();
    } finally {
      // 새로고침하면 기존 ensureSession 로직이 그대로 새 익명 세션을 만들어준다 —
      // 로그아웃 후 흐름을 이 화면에서 새로 만들 필요가 없다.
      if (typeof window !== "undefined") window.location.reload();
    }
  };

  const interventionLabel = INTERVENTION_OPTIONS.find((o) => o.level === interventionLevel)?.label ?? "적당히";

  return (
    <div style={styles.container}>
      <button className={TACTILE_PRESS_CLASS} style={styles.backButton} onClick={onBack}>← 뒤로</button>
      <h1 style={styles.headline}>MY</h1>

      {/* 사용자 정보 */}
      <div style={styles.profileBlock}>
        <p style={styles.profileName}>{nickname ? `${nickname}님` : "닉네임 없음"}</p>
        <p style={styles.profileSub}>참견이와 함께한 생각 {entryCount ?? 0}개</p>
      </div>

      <div style={styles.group}>
        {phoneMode === "view" ? (
          <Row
            label="전화번호"
            value={phoneDone ? "번호가 바뀌었어" : maskPhone(currentPhone)}
            onClick={() => {
              setPhoneMode("edit_phone");
              setPhoneError(null);
              setPhoneDone(false);
            }}
          />
        ) : (
          <div style={styles.expandBlock}>
            <p style={styles.expandLabel}>전화번호</p>
            {phoneMode === "edit_phone" && (
              <div style={styles.editBlock}>
                <input
                  style={styles.input}
                  type="tel"
                  placeholder="새 번호 (010-0000-0000)"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                />
                <div style={styles.rowGap}>
                  <button className={TACTILE_PRESS_CLASS} style={styles.smallButton} onClick={sendCode} disabled={!newPhone || phoneBusy}>
                    {phoneBusy ? "보내는 중..." : "인증번호 받기"}
                  </button>
                  <button className={TACTILE_PRESS_CLASS} style={styles.cancelButton} onClick={() => setPhoneMode("view")}>취소</button>
                </div>
              </div>
            )}
            {phoneMode === "edit_code" && (
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
                  <button className={TACTILE_PRESS_CLASS} style={styles.smallButton} onClick={verifyCode} disabled={!code || phoneBusy}>
                    {phoneBusy ? "확인 중..." : "확인"}
                  </button>
                  <button className={TACTILE_PRESS_CLASS} style={styles.cancelButton} onClick={() => setPhoneMode("view")}>취소</button>
                </div>
              </div>
            )}
            {phoneError && <p style={styles.error}>{phoneError}</p>}
          </div>
        )}
      </div>

      {/* 참견이 */}
      <p style={styles.sectionTitle}>참견이</p>
      <div style={styles.group}>
        <ToggleRow label="효과음" value={soundOn} onToggle={toggleSound} />
        <Divider />
        <ToggleRow label="알림" value={notificationsOn} onToggle={toggleNotifications} />
        <Divider />
        <Row label="참견 정도" value={`${interventionLabel} ›`} onClick={() => setSheet("intervention")} />
      </div>

      {/* 내 기록 */}
      <p style={styles.sectionTitle}>내 기록</p>
      <div style={styles.group}>
        <Row label="내가 남긴 기억" onClick={onOpenRecords} />
      </div>

      {/* 기타 */}
      <p style={styles.sectionTitle}>기타</p>
      <div style={styles.group}>
        <Row label="참견이에게 의견 보내기" onClick={() => setToast("의견 보내기는 곧 열릴 예정이야.")} />
        <Divider />
        <Row label="이용약관" onClick={() => setToast("이용약관 페이지는 아직 준비 중이야.")} />
        <Divider />
        <Row label="개인정보처리방침" onClick={() => setToast("개인정보처리방침 페이지는 아직 준비 중이야.")} />
      </div>

      {/* 계정 */}
      <div style={styles.accountArea}>
        <button className={TACTILE_PRESS_CLASS} style={styles.accountButton} onClick={handleLogout} disabled={loggingOut}>
          {loggingOut ? "로그아웃 중..." : "로그아웃"}
        </button>
        <button className={TACTILE_PRESS_CLASS} style={styles.accountButtonDanger} onClick={() => setSheet("delete_confirm")}>
          회원탈퇴
        </button>
      </div>

      {sheet && (
        <div style={styles.sheetBackdrop} onClick={() => setSheet(null)}>
          <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
            {sheet === "intervention" && (
              <>
                <p style={styles.sheetTitle}>참견 정도</p>
                {INTERVENTION_OPTIONS.map((opt) => (
                  <button
                    key={opt.level}
                    className={TACTILE_PRESS_CLASS}
                    style={{
                      ...styles.sheetOption,
                      ...(opt.level === interventionLevel ? styles.sheetOptionActive : null),
                    }}
                    onClick={() => chooseIntervention(opt.level)}
                  >
                    <span style={styles.sheetOptionDot}>{opt.level === interventionLevel ? "●" : "○"}</span>
                    <span style={styles.sheetOptionText}>
                      <span style={styles.sheetOptionLabel}>{opt.label}</span>
                      <span style={styles.sheetOptionDesc}>{opt.desc}</span>
                    </span>
                  </button>
                ))}
              </>
            )}

            {sheet === "delete_confirm" && (
              <>
                <p style={styles.sheetTitle}>정말 탈퇴할래?</p>
                <p style={styles.sheetDesc}>
                  탈퇴 기능은 아직 준비 중이야. 지금은 계정을 안전하게 지울 수 없어서,
                  급하면 위의 &apos;참견이에게 의견 보내기&apos;로 알려줘.
                </p>
                <button className={TACTILE_PRESS_CLASS} style={styles.sheetPrimary} onClick={() => setSheet(null)}>
                  알겠어
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div style={styles.toast}>{toast}</div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  onClick,
}: {
  label: string;
  value?: string;
  onClick: () => void;
}) {
  return (
    <button className={TACTILE_PRESS_CLASS} style={styles.row} onClick={onClick}>
      <span style={styles.rowLabel}>{label}</span>
      <span style={styles.rowValue}>{value ?? "›"}</span>
    </button>
  );
}

function ToggleRow({ label, value, onToggle }: { label: string; value: boolean; onToggle: () => void }) {
  return (
    <div style={styles.row}>
      <span style={styles.rowLabel}>{label}</span>
      <button
        className={TACTILE_PRESS_CLASS}
        role="switch"
        aria-checked={value}
        style={{ ...styles.switchTrack, ...(value ? styles.switchTrackOn : null) }}
        onClick={onToggle}
      >
        <span style={{ ...styles.switchKnob, ...(value ? styles.switchKnobOn : null) }} />
      </button>
    </div>
  );
}

function Divider() {
  return <div style={styles.divider} />;
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: "100vh",
    ...pageBackground,
    paddingTop: "max(32px, calc(env(safe-area-inset-top, 0px) + 24px))",
    paddingRight: 20,
    paddingBottom: "max(32px, calc(env(safe-area-inset-bottom, 0px) + 24px))",
    paddingLeft: 20,
    boxSizing: "border-box",
    position: "relative",
  },
  backButton: { ...tactile.ghostButton, border: "none", fontSize: 14, fontWeight: 600, padding: 0, marginBottom: 16 },
  headline: { ...typography.headline, color: BRAND.ink, margin: "0 0 20px 0" },

  profileBlock: { padding: "4px 4px 20px 4px" },
  profileName: { fontSize: 19, fontWeight: 800, color: BRAND.ink, margin: "0 0 4px 0" },
  profileSub: { fontSize: 13, fontWeight: 500, color: inkAlpha.muted, margin: 0 },

  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: inkAlpha.faint,
    letterSpacing: 0.3,
    margin: "22px 4px 8px 4px",
  },

  group: {
    ...tactile.card,
    padding: "2px 4px",
  },

  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    minHeight: 52,
    padding: "12px 12px",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
  },
  rowLabel: { fontSize: 15, fontWeight: 600, color: BRAND.ink },
  rowValue: { fontSize: 14, fontWeight: 500, color: inkAlpha.muted },

  divider: { height: 1, background: inkAlpha.hairline, margin: "0 12px" },

  expandBlock: { padding: "14px 12px" },
  expandLabel: { fontSize: 12, fontWeight: 700, color: inkAlpha.faint, margin: "0 0 8px 0", letterSpacing: 0.3 },
  editBlock: { display: "flex", flexDirection: "column", gap: 10 },
  rowGap: { display: "flex", gap: 8 },
  input: { padding: "12px 14px", ...tactile.input, borderRadius: 14, fontSize: 15 },
  smallButton: { padding: "12px 16px", ...tactile.primaryButton, fontSize: 14, fontWeight: 700, borderRadius: 14 },
  cancelButton: { padding: "12px 16px", ...tactile.ghostButton, fontSize: 14, fontWeight: 600, border: `1px solid ${inkAlpha.hairline}`, borderRadius: 14 },
  error: { color: "#D14343", fontSize: 12, fontWeight: 500, marginTop: 10 },

  switchTrack: {
    width: 46,
    height: 27,
    borderRadius: 999,
    background: inkAlpha.hairline,
    border: "none",
    position: "relative",
    cursor: "pointer",
    padding: 0,
    transition: "background 0.15s ease",
    flexShrink: 0,
  },
  switchTrackOn: { background: BRAND.lavender },
  switchKnob: {
    position: "absolute",
    top: 3,
    left: 3,
    width: 21,
    height: 21,
    borderRadius: "50%",
    background: "#fff",
    boxShadow: "0 1px 2px rgba(34,28,44,0.25)",
    transition: "transform 0.15s ease",
    display: "block",
  },
  switchKnobOn: { transform: "translateX(19px)" },

  accountArea: {
    marginTop: 28,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 14,
    paddingBottom: 8,
  },
  accountButton: { ...tactile.ghostButton, border: "none", background: "transparent", fontSize: 13, fontWeight: 600, padding: "6px 10px" },
  accountButtonDanger: { ...tactile.ghostButton, border: "none", background: "transparent", fontSize: 13, fontWeight: 600, padding: "6px 10px", color: "#C24444" },

  sheetBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(34,28,44,0.32)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    zIndex: 1000,
  },
  sheet: {
    width: "100%",
    maxWidth: 480,
    background: BRAND.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: "20px 20px max(20px, calc(env(safe-area-inset-bottom, 0px) + 16px)) 20px",
    boxSizing: "border-box",
    boxShadow: "0 -4px 24px rgba(34,28,44,0.14)",
  },
  sheetTitle: { fontSize: 16, fontWeight: 800, color: BRAND.ink, margin: "0 0 14px 0" },
  sheetDesc: { fontSize: 13, color: inkAlpha.muted, lineHeight: 1.5, margin: "0 0 16px 0", fontWeight: 500 },
  sheetOption: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    width: "100%",
    padding: "12px 10px",
    background: "transparent",
    border: "none",
    borderRadius: 14,
    cursor: "pointer",
    textAlign: "left",
  },
  sheetOptionActive: { background: BRAND.lavenderPale },
  sheetOptionDot: { fontSize: 15, color: BRAND.lavender, marginTop: 1 },
  sheetOptionText: { display: "flex", flexDirection: "column", gap: 2 },
  sheetOptionLabel: { fontSize: 15, fontWeight: 700, color: BRAND.ink },
  sheetOptionDesc: { fontSize: 12, fontWeight: 500, color: inkAlpha.muted },
  sheetPrimary: { ...tactile.primaryButton, width: "100%", padding: "14px 16px", fontSize: 15, fontWeight: 700, borderRadius: 14, marginTop: 4 },

  toast: {
    position: "fixed",
    left: "50%",
    bottom: "max(28px, calc(env(safe-area-inset-bottom, 0px) + 20px))",
    transform: "translateX(-50%)",
    background: BRAND.border,
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    padding: "10px 16px",
    borderRadius: 999,
    boxShadow: "0 6px 16px rgba(0,0,0,0.2)",
    zIndex: 1100,
    whiteSpace: "nowrap",
  },
};
