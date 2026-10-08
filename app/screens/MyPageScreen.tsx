// app/screens/MyPageScreen.tsx
//
// MY — 홈 오른쪽 위 톱니 아이콘. 자주 안 쓰는 것들이라 하단 탭이 아니다.
//
// 원칙: 눌러서 아무 일도 안 일어나는 항목은 두지 않는다.
//   - 참견 받는 방법(문자·전화 / 참견 정도 / 조용한 시간)은 서버(user_memory)에 저장되고,
//     실제 문자 발송 게이트(lib/intervention/pushGate.ts)와 전화(app/api/voice/upload)가 읽는다.
//   - 예전 "알림" 토글은 연결된 기능(웹 푸시)이 없어서 뺐다.
//   - 내 기록: 지난 어항으로 가기 + 전체 기록 파일로 내보내기(/api/user/export).
//   - 의견 보내기(/api/user/feedback), 이용약관(/terms), 개인정보처리방침(/privacy)은 실제로 열린다.
//   - 회원탈퇴는 실제로 모든 데이터와 계정을 지운다(/api/user/delete).
//   - 전화번호 인증/변경 로직(requestPhoneLink/confirmPhoneCode/syncVerifiedPhoneToBackend)은 기존 그대로.
"use client";

import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { requestPhoneLink, confirmPhoneCode, syncVerifiedPhoneToBackend, type PhoneLinkVerifyType } from "@/lib/phoneAuthClient";
import { fetchMe, saveNickname } from "@/lib/userClient";
import PeekMascot from "@/components/PeekMascot";
import { WorldTitle, worldPage, stickerCard, INK, YELLOW, WORLD_CSS } from "@/components/WorldNav";

type InterventionLevel = "low" | "medium" | "high";
interface Prefs {
  outreachEnabled: boolean;
  interventionLevel: InterventionLevel;
  quietStartHour: number;
  quietEndHour: number;
}

const SOUND_KEY = "ganseobi_sound_enabled"; // lib/fx.ts가 읽는다
const APP_VERSION = "0.2.0";

const LEVELS: { level: InterventionLevel; label: string; desc: string }[] = [
  { level: "low", label: "살짝", desc: "내가 부탁한 알림만 문자로 와. 나머지는 앱 안에서만." },
  { level: "medium", label: "적당히", desc: "하루 한 번까지 먼저 문자해." },
  { level: "high", label: "자주", desc: "하루 두 번까지, 6시간 간격으로 먼저 문자해." },
];
const QUIET_STARTS = [21, 22, 23, 24];
const QUIET_ENDS = [7, 8, 9, 10];

function hourLabel(h: number): string {
  if (h === 24 || h === 0) return "자정";
  if (h < 12) return `아침 ${h}시`;
  return `밤 ${h - 12}시`;
}

function maskPhone(e164: string | null | undefined): string {
  if (!e164) return "등록된 번호 없음";
  const digits = e164.replace(/\D/g, "").replace(/^82/, "0");
  if (digits.length < 7) return digits;
  return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
}

async function authed(path: string, init?: RequestInit): Promise<Response | null> {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  if (!session) return null;
  return fetch(path, { ...init, headers: { ...(init?.headers || {}), Authorization: `Bearer ${session.access_token}` } });
}

type PhoneMode = "view" | "edit_phone" | "edit_code";
type Sheet = "level" | "quiet" | "feedback" | "logout" | "delete" | null;

export default function MyPageScreen({ onBack, onOpenRecords }: { onBack: () => void; onOpenRecords: () => void }) {
  // --- 나 ---
  const [nickname, setNickname] = useState<string | null>(null);
  const [nickEdit, setNickEdit] = useState<string | null>(null); // null = 보기 모드
  const [currentPhone, setCurrentPhone] = useState<string | null>(null);

  // --- 전화번호 인증(기존 로직 그대로) ---
  const [phoneMode, setPhoneMode] = useState<PhoneMode>("view");
  const [newPhone, setNewPhone] = useState("");
  const [code, setCode] = useState("");
  const [verifyType, setVerifyType] = useState<PhoneLinkVerifyType>("phone_change");
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // --- 참견 받는 방법(서버) ---
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [prefsBusy, setPrefsBusy] = useState(false);

  // --- 기타 ---
  const [soundOn, setSoundOn] = useState(true);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [deleteText, setDeleteText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    try {
      setSoundOn(window.localStorage.getItem(SOUND_KEY) !== "0");
    } catch {
      /* 저장소를 못 읽으면 기본(켜짐) */
    }
    supabaseClient.auth.getUser().then(({ data: { user } }) => setCurrentPhone(user?.phone ?? null));
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      fetchMe(session.access_token).then((p) => p && setNickname(p.nickname));
    });
    (async () => {
      try {
        const res = await authed("/api/user/settings");
        const body = res ? await res.json() : null;
        if (body?.success) setPrefs(body.data);
      } catch (e) {
        console.error("[MyPage] 설정 불러오기 실패:", e);
      }
    })();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  // 설정은 바로 화면에 반영하고, 서버 저장이 실패하면 되돌린다.
  const savePrefs = async (patch: Partial<Prefs>) => {
    if (!prefs) return;
    const before = prefs;
    setPrefs({ ...prefs, ...patch });
    setPrefsBusy(true);
    try {
      const res = await authed("/api/user/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = res ? await res.json() : null;
      if (!body?.success) throw new Error(body?.error || "저장이 안 됐어.");
      setPrefs(body.data);
    } catch (e: any) {
      setPrefs(before);
      setToast(e.message || "저장이 안 됐어. 조금 있다 다시 해볼래?");
    } finally {
      setPrefsBusy(false);
    }
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    try {
      window.localStorage.setItem(SOUND_KEY, next ? "1" : "0");
    } catch {
      /* 저장 못 해도 이번 화면에선 반영 */
    }
  };

  const submitNickname = async () => {
    const name = (nickEdit ?? "").trim();
    if (!name) return;
    setBusy("nickname");
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();
    const ok = session ? await saveNickname(session.access_token, name) : false;
    setBusy(null);
    if (ok) {
      setNickname(name.slice(0, 20));
      setNickEdit(null);
      setToast("이제 그렇게 부를게.");
    } else {
      setToast("닉네임이 저장 안 됐어.");
    }
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
    setPhoneMode("view");
    syncVerifiedPhoneToBackend(newPhone);
    setNewPhone("");
    setCode("");
    setToast("번호가 바뀌었어.");
  };

  const exportRecords = async () => {
    setBusy("export");
    try {
      const res = await authed("/api/user/export");
      if (!res || !res.ok) throw new Error();
      const blob = await res.blob();
      const name = `참견이_내기록_${new Date().toISOString().slice(0, 10)}.txt`;
      const file = new File([blob], name, { type: "text/plain" });
      if (typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "참견이 내 기록" });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") setToast("기록을 못 꺼냈어. 조금 있다 다시 해볼래?");
    } finally {
      setBusy(null);
    }
  };

  const sendFeedback = async () => {
    setBusy("feedback");
    try {
      const res = await authed("/api/user/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: feedback }),
      });
      const body = res ? await res.json() : null;
      if (!body?.success) throw new Error(body?.error);
      setFeedback("");
      setSheet(null);
      setToast("잘 받았어. 꼭 읽어볼게.");
    } catch (e: any) {
      setToast(e?.message || "전달이 안 됐어.");
    } finally {
      setBusy(null);
    }
  };

  const logout = async () => {
    setBusy("logout");
    try {
      await supabaseClient.auth.signOut();
    } finally {
      // 새로고침하면 기존 ensureSession이 새 세션을 만들고, 번호 인증 단계로 안내한다.
      window.location.reload();
    }
  };

  const deleteAccount = async () => {
    setBusy("delete");
    try {
      const res = await authed("/api/user/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: deleteText.trim() }),
      });
      const body = res ? await res.json() : null;
      if (!body?.success) throw new Error(body?.error);
      try {
        window.localStorage.clear();
      } catch {
        /* 무시 */
      }
      await supabaseClient.auth.signOut().catch(() => {});
      window.location.href = "/";
    } catch (e: any) {
      setBusy(null);
      setToast(e?.message || "탈퇴가 안 됐어.");
    }
  };

  const level = LEVELS.find((l) => l.level === prefs?.interventionLevel) ?? LEVELS[1];
  const outreachOff = prefs ? !prefs.outreachEnabled : false;

  return (
    <div style={{ ...worldPage, paddingBottom: "calc(40px + env(safe-area-inset-bottom, 0px))" }}>
      <style dangerouslySetInnerHTML={{ __html: WORLD_CSS }} />
      <WorldTitle onBack={onBack}>MY</WorldTitle>

      {/* 나 */}
      <div style={s.profile}>
        <PeekMascot expression="base" size={54} />
        {nickEdit === null ? (
          <button style={s.nameBtn} onClick={() => setNickEdit(nickname ?? "")}>
            <span style={s.name}>{nickname ?? "닉네임 없음"}</span>
            <span style={s.edit}>바꾸기</span>
          </button>
        ) : (
          <div style={s.nameEdit}>
            <input
              id="my-nickname"
              style={s.input}
              value={nickEdit}
              maxLength={20}
              autoFocus
              placeholder="뭐라고 부를까?"
              onChange={(e) => setNickEdit(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitNickname()}
            />
            <button className="wn-sticker" style={s.smallBtn} onClick={submitNickname} disabled={busy === "nickname" || !nickEdit.trim()}>
              저장
            </button>
            <button style={s.textBtn} onClick={() => setNickEdit(null)}>
              취소
            </button>
          </div>
        )}
      </div>

      <div style={{ ...stickerCard, ...s.group }}>
        {phoneMode === "view" ? (
          <Row
            label="전화번호"
            value={maskPhone(currentPhone)}
            onClick={() => {
              setPhoneMode("edit_phone");
              setPhoneError(null);
            }}
          />
        ) : (
          <div style={s.expand}>
            <p style={s.expandLabel}>{phoneMode === "edit_phone" ? "새 번호" : "인증번호"}</p>
            {phoneMode === "edit_phone" ? (
              <input id="my-phone" style={s.input} type="tel" placeholder="010-0000-0000" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
            ) : (
              <input id="my-code" style={s.input} type="tel" inputMode="numeric" placeholder="6자리" value={code} onChange={(e) => setCode(e.target.value)} />
            )}
            <div style={s.btnRow}>
              <button
                className="wn-sticker"
                style={s.smallBtn}
                disabled={phoneBusy || (phoneMode === "edit_phone" ? !newPhone : !code)}
                onClick={phoneMode === "edit_phone" ? sendCode : verifyCode}
              >
                {phoneBusy ? "잠깐만..." : phoneMode === "edit_phone" ? "인증번호 받기" : "확인"}
              </button>
              <button style={s.textBtn} onClick={() => setPhoneMode("view")}>
                취소
              </button>
            </div>
            {phoneError && <p style={s.error}>{phoneError}</p>}
          </div>
        )}
      </div>

      {/* 참견 받는 방법 — 서버가 실제로 읽는 설정 */}
      <p style={s.section}>참견 받는 방법</p>
      <div style={{ ...stickerCard, ...s.group }}>
        {prefs === null ? (
          <p style={{ ...s.muted, padding: "14px 16px" }}>잠깐만.</p>
        ) : (
          <>
            <ToggleRow
              label="문자·전화로 참견받기"
              sub={prefs.outreachEnabled ? undefined : "앱 안에서만 대답해."}
              value={prefs.outreachEnabled}
              disabled={prefsBusy}
              onToggle={() => savePrefs({ outreachEnabled: !prefs.outreachEnabled })}
            />
            <Divider />
            <Row label="참견 정도" value={level.label} sub={level.desc} disabled={outreachOff} onClick={() => setSheet("level")} />
            <Divider />
            <Row
              label="조용한 시간"
              value={`${hourLabel(prefs.quietStartHour)} ~ ${hourLabel(prefs.quietEndHour)}`}
              sub="이 시간엔 먼저 문자하지 않아."
              disabled={outreachOff}
              onClick={() => setSheet("quiet")}
            />
          </>
        )}
      </div>

      {/* 앱 */}
      <p style={s.section}>앱</p>
      <div style={{ ...stickerCard, ...s.group }}>
        <ToggleRow label="효과음" value={soundOn} onToggle={toggleSound} />
      </div>

      {/* 내 기록 */}
      <p style={s.section}>내 기록</p>
      <div style={{ ...stickerCard, ...s.group }}>
        <Row label="지난 어항 보기" onClick={onOpenRecords} />
        <Divider />
        <Row label="내 기록 내보내기" sub="내가 한 말, 참견이 대답, 편지를 파일 하나로." value={busy === "export" ? "만드는 중..." : undefined} onClick={exportRecords} disabled={busy === "export"} />
      </div>

      {/* 도움 */}
      <p style={s.section}>도움</p>
      <div style={{ ...stickerCard, ...s.group }}>
        <Row label="참견이에게 의견 보내기" onClick={() => setSheet("feedback")} />
        <Divider />
        <LinkRow label="이용약관" href="/terms" />
        <Divider />
        <LinkRow label="개인정보처리방침" href="/privacy" />
        <Divider />
        <div style={s.row}>
          <span style={s.rowLabel}>버전</span>
          <span style={s.rowValue}>{APP_VERSION}</span>
        </div>
      </div>

      <div style={s.account}>
        <button style={s.textBtn} onClick={() => setSheet("logout")}>
          로그아웃
        </button>
        <button style={{ ...s.textBtn, color: "#C24444" }} onClick={() => setSheet("delete")}>
          회원탈퇴
        </button>
      </div>

      {sheet && (
        <div style={s.backdrop} onClick={() => busy === null && setSheet(null)}>
          <div style={s.sheet} onClick={(e) => e.stopPropagation()} role="dialog">
            {sheet === "level" && prefs && (
              <>
                <p style={s.sheetTitle}>참견 정도</p>
                {LEVELS.map((o) => (
                  <button
                    key={o.level}
                    style={{ ...s.option, ...(o.level === prefs.interventionLevel ? s.optionOn : null) }}
                    onClick={() => {
                      setSheet(null);
                      if (o.level !== prefs.interventionLevel) savePrefs({ interventionLevel: o.level });
                    }}
                  >
                    <span style={s.optionLabel}>{o.label}</span>
                    <span style={s.optionDesc}>{o.desc}</span>
                  </button>
                ))}
              </>
            )}

            {sheet === "quiet" && prefs && (
              <>
                <p style={s.sheetTitle}>조용한 시간</p>
                <p style={s.sheetDesc}>이 사이에는 참견이가 먼저 문자하지 않아. 내가 부탁한 알림은 예외야.</p>
                <p style={s.pickLabel}>여기서부터</p>
                <div style={s.pickRow}>
                  {QUIET_STARTS.map((h) => (
                    <button
                      key={h}
                      className="wn-sticker"
                      style={{ ...s.pick, ...(prefs.quietStartHour === h ? s.pickOn : null) }}
                      onClick={() => savePrefs({ quietStartHour: h })}
                    >
                      {hourLabel(h)}
                    </button>
                  ))}
                </div>
                <p style={s.pickLabel}>여기까지</p>
                <div style={s.pickRow}>
                  {QUIET_ENDS.map((h) => (
                    <button
                      key={h}
                      className="wn-sticker"
                      style={{ ...s.pick, ...(prefs.quietEndHour === h ? s.pickOn : null) }}
                      onClick={() => savePrefs({ quietEndHour: h })}
                    >
                      {hourLabel(h)}
                    </button>
                  ))}
                </div>
                <button className="wn-sticker" style={s.primary} onClick={() => setSheet(null)}>
                  됐어
                </button>
              </>
            )}

            {sheet === "feedback" && (
              <>
                <p style={s.sheetTitle}>참견이에게 의견 보내기</p>
                <textarea
                  id="my-feedback"
                  style={s.textarea}
                  value={feedback}
                  maxLength={2000}
                  placeholder="불편했던 거, 바랐던 거, 아무 말이나."
                  onChange={(e) => setFeedback(e.target.value)}
                />
                <button className="wn-sticker" style={s.primary} disabled={busy === "feedback" || feedback.trim().length < 2} onClick={sendFeedback}>
                  {busy === "feedback" ? "보내는 중..." : "보내기"}
                </button>
              </>
            )}

            {sheet === "logout" && (
              <>
                <p style={s.sheetTitle}>로그아웃할래?</p>
                <p style={s.sheetDesc}>
                  {currentPhone
                    ? "다시 들어올 땐 같은 전화번호로 인증하면 기록이 그대로 있어."
                    : "전화번호가 등록 안 돼 있어서, 로그아웃하면 지금 기록을 다시 못 찾을 수 있어. 먼저 번호를 등록하는 걸 추천해."}
                </p>
                <button className="wn-sticker" style={s.primary} disabled={busy === "logout"} onClick={logout}>
                  {busy === "logout" ? "나가는 중..." : "로그아웃"}
                </button>
              </>
            )}

            {sheet === "delete" && (
              <>
                <p style={s.sheetTitle}>정말 탈퇴할래?</p>
                <p style={s.sheetDesc}>
                  녹음, 내가 한 말, 기억, 편지, 설정, 계정이 바로 전부 지워져. 되돌릴 수 없어. 필요하면 먼저 &lsquo;내 기록 내보내기&rsquo;로 받아둬.
                </p>
                <p style={s.pickLabel}>확인을 위해 &lsquo;탈퇴&rsquo;라고 적어줘</p>
                <input id="my-delete" style={s.input} value={deleteText} onChange={(e) => setDeleteText(e.target.value)} placeholder="탈퇴" />
                <button
                  className="wn-sticker"
                  style={{ ...s.primary, background: "#FF8A7A" }}
                  disabled={busy === "delete" || deleteText.trim() !== "탈퇴"}
                  onClick={deleteAccount}
                >
                  {busy === "delete" ? "지우는 중..." : "전부 지우고 탈퇴"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div style={s.toast} role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  sub,
  onClick,
  disabled,
}: {
  label: string;
  value?: string;
  sub?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button style={{ ...s.row, ...(disabled ? s.rowDisabled : null) }} onClick={onClick} disabled={disabled}>
      <span style={s.rowMain}>
        <span style={s.rowLabel}>{label}</span>
        {sub && <span style={s.rowSub}>{sub}</span>}
      </span>
      <span style={s.rowValue}>{value ?? "›"}</span>
    </button>
  );
}

function LinkRow({ label, href }: { label: string; href: string }) {
  return (
    <a href={href} style={{ ...s.row, textDecoration: "none" }}>
      <span style={s.rowLabel}>{label}</span>
      <span style={s.rowValue}>›</span>
    </a>
  );
}

function ToggleRow({
  label,
  sub,
  value,
  onToggle,
  disabled,
}: {
  label: string;
  sub?: string;
  value: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <div style={s.row}>
      <span style={s.rowMain}>
        <span style={s.rowLabel}>{label}</span>
        {sub && <span style={s.rowSub}>{sub}</span>}
      </span>
      <button
        role="switch"
        aria-checked={value}
        aria-label={label}
        disabled={disabled}
        style={{ ...s.track, ...(value ? s.trackOn : null) }}
        onClick={onToggle}
      >
        <span style={{ ...s.knob, ...(value ? s.knobOn : null) }} />
      </button>
    </div>
  );
}

function Divider() {
  return <div style={s.divider} />;
}

const s: { [k: string]: React.CSSProperties } = {
  muted: { margin: 0, fontSize: 14, color: "rgba(27,22,48,.6)" },
  profile: { display: "flex", alignItems: "center", gap: 12, margin: "0 2px 14px" },
  nameBtn: { display: "flex", alignItems: "baseline", gap: 8, border: 0, background: "transparent", padding: "6px 0", cursor: "pointer", color: INK },
  name: { fontSize: 22 },
  edit: { fontSize: 13, color: "#4D3F73", textDecoration: "underline" },
  nameEdit: { flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8 },
  group: { padding: "2px 0" },
  section: { fontSize: 15, margin: "20px 4px 8px", color: "rgba(27,22,48,.7)" },
  row: {
    width: "100%",
    minHeight: 54,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 16px",
    boxSizing: "border-box",
    border: 0,
    background: "transparent",
    textAlign: "left",
    cursor: "pointer",
    color: INK,
    fontFamily: "'Jua', sans-serif",
  },
  rowDisabled: { opacity: 0.4, cursor: "default" },
  rowMain: { minWidth: 0, display: "flex", flexDirection: "column", gap: 2 },
  rowLabel: { fontSize: 16 },
  rowSub: { fontSize: 12.5, color: "rgba(27,22,48,.55)", lineHeight: 1.35, wordBreak: "keep-all" },
  rowValue: { flexShrink: 0, fontSize: 14, color: "rgba(27,22,48,.6)" },
  divider: { height: 2, margin: "0 16px", background: "rgba(27,22,48,.1)" },
  expand: { padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 },
  expandLabel: { margin: 0, fontSize: 13, color: "rgba(27,22,48,.6)" },
  input: {
    flex: 1,
    minWidth: 0,
    padding: "11px 14px",
    borderRadius: 14,
    border: `2.5px solid ${INK}`,
    background: "#FFFFFF",
    fontSize: 16,
    fontFamily: "'Jua', sans-serif",
    color: INK,
  },
  btnRow: { display: "flex", alignItems: "center", gap: 10 },
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
  },
  textBtn: { border: 0, background: "transparent", padding: "8px 6px", fontSize: 14, color: "rgba(27,22,48,.65)", cursor: "pointer" },
  error: { margin: 0, fontSize: 13, color: "#C24444" },
  track: {
    flexShrink: 0,
    width: 50,
    height: 30,
    borderRadius: 999,
    border: `2.5px solid ${INK}`,
    background: "#E8E2D2",
    position: "relative",
    padding: 0,
    cursor: "pointer",
    transition: "background .15s",
  },
  trackOn: { background: YELLOW },
  knob: {
    position: "absolute",
    top: 2,
    left: 2,
    width: 21,
    height: 21,
    borderRadius: "50%",
    background: "#FFFFFF",
    border: `2.5px solid ${INK}`,
    boxSizing: "border-box",
    transition: "transform .15s",
  },
  knobOn: { transform: "translateX(20px)" },
  account: { display: "flex", justifyContent: "center", gap: 18, marginTop: 26 },
  backdrop: { position: "fixed", inset: 0, zIndex: 1000, background: "rgba(27,22,48,.35)", display: "flex", alignItems: "flex-end", justifyContent: "center" },
  sheet: {
    width: "100%",
    maxWidth: 480,
    boxSizing: "border-box",
    padding: "20px 20px max(20px, calc(env(safe-area-inset-bottom, 0px) + 16px))",
    background: "#FFF9E8",
    borderTop: `3px solid ${INK}`,
    borderRadius: "26px 26px 0 0",
    fontFamily: "'Jua', sans-serif",
    color: INK,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  sheetTitle: { margin: 0, fontSize: 20 },
  sheetDesc: { margin: 0, fontSize: 14, lineHeight: 1.55, color: "rgba(27,22,48,.7)", wordBreak: "keep-all" },
  option: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "12px 14px",
    borderRadius: 16,
    border: `2.5px solid rgba(27,22,48,.15)`,
    background: "#FFFFFF",
    textAlign: "left",
    cursor: "pointer",
    color: INK,
  },
  optionOn: { border: `2.5px solid ${INK}`, background: YELLOW, boxShadow: `3px 3px 0 ${INK}` },
  optionLabel: { fontSize: 17 },
  optionDesc: { fontSize: 13, color: "rgba(27,22,48,.7)", wordBreak: "keep-all" },
  pickLabel: { margin: "4px 0 0", fontSize: 13, color: "rgba(27,22,48,.6)" },
  pickRow: { display: "flex", flexWrap: "wrap", gap: 8 },
  pick: {
    minHeight: 40,
    padding: "0 12px",
    borderRadius: 999,
    border: `2.5px solid ${INK}`,
    background: "#FFFFFF",
    boxShadow: `2px 2px 0 ${INK}`,
    fontSize: 14,
    color: INK,
    cursor: "pointer",
  },
  pickOn: { background: YELLOW },
  textarea: {
    minHeight: 120,
    padding: "12px 14px",
    borderRadius: 16,
    border: `2.5px solid ${INK}`,
    fontSize: 16,
    fontFamily: "'Jua', sans-serif",
    color: INK,
    resize: "vertical",
  },
  primary: {
    marginTop: 6,
    minHeight: 50,
    borderRadius: 16,
    border: `3px solid ${INK}`,
    background: YELLOW,
    boxShadow: `3px 3px 0 ${INK}`,
    fontSize: 17,
    color: INK,
    cursor: "pointer",
  },
  toast: {
    position: "fixed",
    left: "50%",
    bottom: "max(28px, calc(env(safe-area-inset-bottom, 0px) + 20px))",
    transform: "translateX(-50%)",
    zIndex: 1100,
    maxWidth: "calc(100% - 40px)",
    padding: "10px 16px",
    borderRadius: 999,
    background: INK,
    color: "#FFFFFF",
    fontFamily: "'Jua', sans-serif",
    fontSize: 14,
    textAlign: "center",
  },
};
