"use client";

import { useState, useEffect, useRef } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import TimelineScreen, { type RecordEntry, type HomeBubble, type ProactiveLine } from "./screens/TimelineScreen";
import LandingScreen from "./screens/LandingScreen";
import RecordingScreen from "./screens/RecordingScreen";
import PhoneInputScreen from "./screens/PhoneInputScreen";
import ConfirmScreen from "./screens/ConfirmScreen";
import MessageScreen from "./screens/MessageScreen";
import CallingScreen from "./screens/CallingScreen";
import ResultScreen from "./screens/ResultScreen";
import NicknameScreen from "./screens/NicknameScreen";
import OnboardingChecklistScreen from "./screens/OnboardingChecklistScreen";
import MyPageScreen, { prefetchMyPage } from "./screens/MyPageScreen";
import CalendarScreen from "./screens/CalendarScreen";
import OnboardingScreen from "./screens/OnboardingScreen";
import ThinkingScreen from "./screens/ThinkingScreen"; // 👈 1. 상단 import에 추가 완료!
import FirstTalkScreen from "./screens/FirstTalkScreen";
import DiscoveryScreen from "./screens/DiscoveryScreen";
import LettersScreen from "./screens/LettersScreen";
import ArchiveScreen from "./screens/ArchiveScreen";
import type { WorldTab } from "@/components/WorldNav";
import TankRecordingScreen from "./screens/TankRecordingScreen";
import { BRAND, pageBackground } from "@/lib/theme";
import { acquireMicStream, releaseMicStream } from "@/lib/micStream";
  import { playFx } from "@/lib/fx";

// 어항 ↔ 지난 어항 사이 물결 막, 편지 탭 페이드. transform은 막(별도 fixed 요소)에만 써서
// 화면 안의 고정 탭바(position:fixed)가 같이 흔들리지 않게 한다.
const WORLD_CURTAIN_CSS = `
.world-curtain { position: fixed; inset: -10vh 0; z-index: 2000; pointer-events: none;
  background:
    radial-gradient(circle at 22% 30%, rgba(255,255,255,.55) 0 7px, transparent 8px),
    radial-gradient(circle at 70% 55%, rgba(255,255,255,.5) 0 5px, transparent 6px),
    radial-gradient(circle at 40% 78%, rgba(255,255,255,.45) 0 9px, transparent 10px),
    linear-gradient(#7AD3F2, #45BFEC 45%, #2C9BD0);
  border-top: 4px solid #1B1630; border-bottom: 4px solid #1B1630; }
.world-curtain-down { animation: worldDive .7s cubic-bezier(.6,0,.3,1) both; }
.world-curtain-up { animation: worldSurface .7s cubic-bezier(.6,0,.3,1) both; }
@keyframes worldDive { 0% { transform: translateY(110%); } 40%, 55% { transform: translateY(0); } 100% { transform: translateY(-110%); } }
@keyframes worldSurface { 0% { transform: translateY(-110%); } 40%, 55% { transform: translateY(0); } 100% { transform: translateY(110%); } }
.world-fade { animation: worldFade .28s ease-out; }
@keyframes worldFade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .world-curtain { display: none; } .world-fade { animation: none; } }
`;

const ONBOARDING_KEY = "ganseobi_onboarding_completed";
// 편지 탭을 마지막으로 연 시각 — 그 뒤에 생긴 "참견이가 알아챈 거"만 배지에 센다(app/screens/LettersScreen).
const INSIGHTS_SEEN_KEY = "ganseobi_insights_seen_at";
// 첫 실행 사용자가 "첫 녹음 → 첫 기록"까지 마쳤는지 표시. 한 번 true가 되면 그 세션에서만
// 닉네임/전화번호 같은 부가 입력을 건너뛰기 위한 용도로만 쓰고, 이후에는 기존 플로우를 그대로 탄다.
const FIRST_ENTRY_DONE_KEY = "ganseobi_first_entry_done";
// 녹음은 했는데 실제로 말소리가 없었을 때(클라이언트 무음 판정 / 서버 STT 무음 판정) 홈 어항 위에 뜨는 말.
const NO_SPEECH_TEXT = "아직 아무 말도 안 했는데?";

type Step =
  | "onboarding"
  | "setup_checklist"
  | "first_talk"
  | "landing"
  | "raw_landing"
  | "recording"
  | "tank_recording"
  | "phone_input"
  | "nickname"
  | "mypage"
  | "calendar"
  | "archive"
  | "insights"
  | "letters"
  | "uploading"
  | "no_action"
  | "awaiting_confirmation"
  | "calling"
  | "call_failed"
  | "confirmed"
  | "result";

export default function Home() {
  const [step, setStep] = useState<Step>("landing");
  // MY는 화면을 바꾸지 않고 어항 위로 올라오는 시트로 연다(숨비의 바텀시트처럼 — 어항에서 안 떠난 느낌).
  const [myOpen, setMyOpen] = useState(false);
  // 하단 탭(어항 / 지난 어항 / 편지) 이동 — 화면 데이터는 캐시에서 바로 그려지니 막(바다 화면) 없이 바로 바꾼다.
    // 홈 바다의 지난달 층에서 "그때 한 말"을 눌렀을 때 지난 어항 화면이 먼저 열 달. 탭으로 가면 비운다(최근 달).
  const [archiveMonth, setArchiveMonth] = useState<string | undefined>(undefined);
  const goTab = (tab: WorldTab) => {
    const target: Step = tab === "home" ? "landing" : tab;
    if (target === step) return;
    setMyOpen(false);
        setArchiveMonth(undefined);
    setStep(target);
    window.scrollTo(0, 0);
  };
  const [audioBlob, setAudioBlob] = useState<Blob | string | null>(null); // 음성 Blob 또는 텍스트 입력 문자열
  const [selectedTopic, setSelectedTopic] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [entryId, setEntryId] = useState<string | null>(null);
  const [uploadData, setUploadData] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<RecordEntry[] | null>(null);
  // undefined = 아직 안 불러옴, null = 불러왔지만 지금 보여줄 진짜 참견이 없음,
  // 객체 = 아직 아무 데도 안 꺼낸 진짜 proactive callback(memory_insight) 하나.
  // 홈을 다시 방문할 때마다 새로 불러오지 않는다 — 한 번 화면에 뜬 참견은 사용자가
  // 실제로 답하러 가기 전까지(onOpenRecording에서 비움) 그대로 남아 있어야 하기 때문.
  const [proactiveLine, setProactiveLine] = useState<ProactiveLine | null | undefined>(undefined);
  // 온보딩을 막 끝낸 사용자의 "첫 녹음 → 첫 기록" 여정 동안만 true.
  // 이 값이 true인 동안에는 전화번호/닉네임 같은 부가 입력을 요구하지 않고 바로 홈까지 보낸다.
  const [isFirstRun, setIsFirstRun] = useState(false);
  // 참견이의 편지 중 안 읽은 개수(실제 DB 값). 0이면 Home badge를 그리지 않는다.
  const [unreadLetterCount, setUnreadLetterCount] = useState(0);
  // true면 RecordingScreen이 뜨자마자 바로 녹음을 시작한다(홈 마이크 / ＋ 더 이야기하기).
  const [autoStartRecording, setAutoStartRecording] = useState(false);
  // 홈(어항) 위에 뜨는 참견이 말풍선 — 홈 안에서 녹음한 것에 대한 대답 / 무음 안내.
  // 다른 탭(기록/MY 등)에 다녀와도 유지되도록 page에서 들고 있는다.
  const [homeBubble, setHomeBubble] = useState<HomeBubble | null>(null);
  // 물속 녹음 화면(tank_recording)이 대답하는 대상 — 참견이의 대답/먼저 꺼낸 말. 없으면 새 생각.
  const [tankReplyTo, setTankReplyTo] = useState<string | undefined>(undefined);
  // 녹음을 보내고 참견이가 생각하는 중 — 홈 어항 가운데 물방울이 꿀렁거린다.
  const [homeThinking, setHomeThinking] = useState(false);
  // 2단계 응답 — 서버가 받아쓰기를 끝내자마자 보내준 "방금 니가 한 말". 대답이 오면(또는 실패하면) 비운다.
  const [homeHeard, setHomeHeard] = useState<{ text: string; key: number } | null>(null);
  // 보내다 실패한 녹음 — 아직 서버에 기록되기 전에 실패했을 때만 [다시 보내기]로 같은 녹음을 다시 보낸다.
  const [retrySpeech, setRetrySpeech] = useState<{ blob: Blob; replyTo?: string } | null>(null);
  // 홈 업로드 요청 번호 — 늦게 도착한 옛 요청의 결과가 새 화면을 덮지 않게.
  const uploadSeq = useRef(0);
    // "이렇게 말한 거 맞아?" 확인을 기다리는 녹음 — [맞아]를 누르면 이걸 그대로 다시 보낸다.
  const [pendingSpeech, setPendingSpeech] = useState<{ blob: Blob; replyTo?: string } | null>(null);

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

  // 참견이가 지금 나를 찾아온 상태인지(=아직 안 꺼낸 memory_insight가 있는지) 딱 한 번 확인한다.
  // step이 landing으로 바뀔 때마다 다시 부르지 않는다 — 그러면 캘린더 갔다가 홈에 돌아왔을 때
  // 방금 본 참견이 사라져 보이는 문제가 생긴다(서버가 조회 즉시 surfaced 처리하기 때문).
  const fetchProactiveLine = async () => {
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) {
        setProactiveLine(null);
        return;
      }
      const res = await fetch("/api/user/proactive-line", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const body = await res.json();
      // 실패해도 null로 확정해서 홈이 "확인 중" 상태에 영원히 머물지 않게 한다.
      setProactiveLine(body.success ? body.data : null);
    } catch (e) {
      console.error("[Home] fetch proactive line failed:", e);
      setProactiveLine(null);
    }
  };

  // 안 읽은 편지 개수 — head count 쿼리 한 번. 홈 첫 진입 때 다른 홈 데이터와 병렬로 부르고,
  // 기다리지 않는다. 이후에는 편지함 화면이 목록을 불러올 때/편지를 읽을 때 실제 값으로 맞춰준다.
  const fetchUnreadLetterCount = async () => {
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/user/letters/unread-count", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const body = await res.json();
      const letterCount = body.success && typeof body.data?.count === "number" ? body.data.count : 0;
      // 참견이가 새로 알아챈 것도 편지 탭에 돌아온 것 — 편지 탭을 마지막으로 연 뒤에 생긴 것만 센다.
      let insightCount = 0;
      try {
        const seenAt = Number(localStorage.getItem(INSIGHTS_SEEN_KEY) || 0);
        const ir = await fetch("/api/user/insights", { headers: { Authorization: `Bearer ${session.access_token}` } });
        const ib = await ir.json();
        if (ib.success) insightCount = (ib.data as { createdAt: string }[]).filter((i) => new Date(i.createdAt).getTime() > seenAt).length;
      } catch {
        /* 못 세면 편지 개수만 */
      }
      setUnreadLetterCount(letterCount + insightCount);
    } catch (e) {
      console.error("[Home] fetch unread letter count failed:", e);
    }
  };

  useEffect(() => {
    const ensureSession = async () => {
      // 온보딩 여부는 로컬 값이라 네트워크를 기다릴 필요가 없다 — 첫 사용자는 홈이 잠깐 비쳤다가
      // 넘어가지 않도록 세션 확인보다 먼저 온보딩으로 보낸다.
      const onboardingDone = typeof window !== "undefined" && localStorage.getItem(ONBOARDING_KEY);
      if (!onboardingDone) setStep("onboarding");

      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) {
        const { error } = await supabaseClient.auth.signInAnonymously();
        if (error) console.error("[auth] 익명 로그인 실패:", error.message);
      }

      // 홈 데이터는 세션만 있으면 바로 요청한다. 아래 getUser()(전화번호 확인용 네트워크 호출)가
      // 끝날 때까지 기다리게 두면 그만큼 홈의 참견 메시지가 늦게 뜬다.
      fetchEntries();
      fetchProactiveLine();
      fetchUnreadLetterCount();
      // 톱니바퀴(설정)를 눌렀을 때 "잠깐만." 없이 바로 보이게 미리 받아둔다.
      setTimeout(prefetchMyPage, 2000);
      // 온보딩 완료 여부(로컬 저장) + 지금 계정에 인증된 전화번호가 있는지(서버)를 같이 봐서
      // 어디로 보낼지 정한다. 온보딩을 아예 처음 하는 사람은 인트로부터, 온보딩은 끝냈지만
      // (저장공간이 리셋되는 등으로) 지금 계정에 인증된 번호가 없는 사람은 인트로는 건너뛰고
      // 바로 필수 체크리스트(마이크+전화인증)로 보낸다 — 바로 이 경우가 "홈 화면 아이콘으로
      // 들어가면 저장공간이 초기화되며 새 익명 계정이 생기는" 상황이라, 여기서 반드시 잡아야 한다.
      if (onboardingDone) {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user?.phone) {
          setStep("setup_checklist");
        }
      }
    };
    ensureSession();
  }, []);

   // 첫 화면의 녹음 목록은 위 ensureSession이 이미 불러온다 — 여기서 또 부르면 같은 요청이 두 번 나간다.
  const firstStepRun = useRef(true);
  useEffect(() => {
    const isFirst = firstStepRun.current;
    firstStepRun.current = false;
    if (step === "landing" && !isFirst) fetchEntries();
    // 홈에서 녹음하던 마이크는 다른 탭으로 나가면 놓아준다(녹음 표시등이 계속 켜져 있지 않게).
    if (step === "calendar" || step === "archive" || step === "mypage" || step === "insights" || step === "letters") releaseMicStream();
  }, [step]);

  // 홈 말풍선을 닫거나 안내만 띄울 때는 대화가 이어지지 않으니 마이크를 놓아준다.
  // (참견이의 대답이 떠 있는 동안은 바로 대답할 수 있게 마이크를 들고 있는다 — 기존 ＋ 더 이야기하기 루프와 같은 원칙)
  const changeHomeBubble = (b: HomeBubble | null) => {
    if (!b || b.kind === "notice") releaseMicStream();
        // 확인 말풍선이 내려가면(닫기/새 녹음) 확인 기다리던 녹음도 버린다.
    if (!b || b.kind !== "confirm") setPendingSpeech(null);
    if (!b || b.kind !== "retry") setRetrySpeech(null);
    setHomeBubble(b);
  };
  // [다시 보내기] — 서버에 닿기 전에 실패한 녹음을 그대로 다시 보낸다(녹음은 그대로 들고 있다).
  const retryUpload = () => {
    const pending = retrySpeech;
    setRetrySpeech(null);
    setHomeBubble(null);
    if (!pending) return;
    setHomeThinking(true);
    uploadFromHome(pending.blob, pending.replyTo).finally(() => setHomeThinking(false));
  };
  // "이렇게 말한 거 맞아?" — [맞아]면 같은 녹음을 확인 표시와 함께 다시 보내 저장, [아니]면 버린다.
  const confirmSpeech = (yes: boolean) => {
    const pending = pendingSpeech;
    setPendingSpeech(null);
    if (!yes || !pending) {
      changeHomeBubble(null);
      return;
    }
    setHomeBubble(null);
    setHomeThinking(true);
    uploadFromHome(pending.blob, pending.replyTo, true).finally(() => setHomeThinking(false));
  };
  // 홈(어항) 안에서 녹음한 음성을 보낸다. 화면을 바꾸지 않는 게 기본이고,
  // 확인/전화처럼 전용 화면이 꼭 필요한 결과만 기존 화면으로 넘긴다.
    const uploadFromHome = async (input: Blob, replyTo?: string, speechConfirmed = false) => {
    const seq = ++uploadSeq.current;
    const isCurrent = () => seq === uploadSeq.current;
    const t0 = performance.now();
    let heard = false; // 받아쓰기 결과가 왔다 = 서버에 기록이 이미 만들어졌다
    const controller = new AbortController();
    // 무한 대기 금지 — 60초가 넘으면 끊고 상태를 알려준다.
    const timeout = setTimeout(() => controller.abort(), 60_000);
    setHomeHeard(null);
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) {
        throw new Error("로그인 세션을 만들지 못했습니다. 새로고침 후 다시 시도해주세요.");
      }
      // 참견이가 먼저 꺼낸 말에 대답한 거면, 그 말은 이제 내려놓는다.
      if (replyTo && proactiveLine && replyTo === proactiveLine.content) setProactiveLine(null);

      const savedPhone = typeof window !== "undefined" ? localStorage.getItem("ganseobi_phone") : null;
      const form = new FormData();
      form.append("audio", input, "recording.webm");
      form.append("phone", savedPhone || "");
      form.append("persona", "coach");
      if (replyTo) form.append("topic", replyTo);
      if (speechConfirmed) form.append("speech_confirmed", "1");

      const res = await fetch("/api/voice/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "x-upload-stream": "1" },
        body: form,
        signal: controller.signal,
      });
      const { status, body } = await readUploadResponse(res, (t) => {
        heard = true;
        if (!isCurrent()) return;
        setHomeHeard({ text: t.transcript, key: Date.now() });
        console.log(`[home-timing] transcript_shown=${Math.round(performance.now() - t0)}ms`);
      });
      if (!isCurrent()) return; // 그사이 새 녹음이 시작됐으면 이 결과는 버린다
      console.log(`[home-timing] final_arrived=${Math.round(performance.now() - t0)}ms`);
      setHomeHeard(null);
      if (status >= 400 || !body?.success) {
        throw new Error(body?.error || `upload API ${status}`);
      }

      // 서버 STT가 "말소리 없음"으로 판단 — 아무것도 저장되지 않았다.
      if (body.data?.no_speech) {
        changeHomeBubble({ kind: "notice", text: NO_SPEECH_TEXT });
        return;
      }
            // 받아쓴 내용이 무음 환각처럼 보임 — 버리지 않고 "이렇게 말한 거 맞아?"로 확인한다(아직 저장 안 됨).
      if (body.data?.needs_confirm) {
        setPendingSpeech({ blob: input, replyTo });
        setHomeBubble({ kind: "confirm", text: String(body.data.transcript || "") });
        return;
      }
      if (!body.data?.id) throw new Error("entry id missing from response");

      fetchEntries(); // 새 치어/금붕어가 퐁당 들어온다
      markFirstEntryDoneIfNeeded();

      const state = body.data.call_state;
      if (state === "no_action" || state === "saved_only") {
               setHomeBubble({ kind: "reply", text: body.data.response?.response || "일단 들어뒀어.", recall: body.data.response?.recalled ?? null });
        return;
      }

      // 확인/전화가 필요한 경우만 기존 화면으로 — 흐름은 doUpload와 똑같다.
      setHomeBubble(null);
      setEntryId(body.data.id);
      setUploadData(body.data);
      if (state === "awaiting_confirmation") {
        setStep("awaiting_confirmation");
      } else if (state === "calling_sent") {
        setStep("calling");
      } else {
        setStep("call_failed");
      }
    } catch (e: any) {
      console.error("[Home] tank upload failed:", e?.message);
      releaseMicStream();
      if (!isCurrent()) return;
      setHomeHeard(null);
      if (heard) {
        // 니 말은 이미 서버에 기록됐다 — 다시 보내면 같은 말이 두 번 저장되니 재시도 대신 안내만.
        fetchEntries();
        changeHomeBubble({ kind: "notice", text: "니 말은 들어뒀어. 근데 대답이 길을 잃었네. 조금 있다 다시 말 걸어줘." });
      } else {
        // 서버에 닿기 전에 실패 — 녹음은 그대로 들고 있으니 같은 녹음을 다시 보낼 수 있다.
        changeHomeBubble({ kind: "retry", text: "앗, 니 말이 바다에 안 닿았어. 녹음은 그대로 있어." });
        setRetrySpeech({ blob: input, replyTo });
      }
    } finally {
      clearTimeout(timeout);
    }
  };

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
      // 서버 STT가 "말소리 없음"으로 판단 — 아무것도 저장되지 않았으니 홈으로 돌아가 안내만 띄운다.
      if (body.success && body.data?.no_speech) {
        releaseMicStream();
        setHomeBubble({ kind: "notice", text: NO_SPEECH_TEXT });
        setSelectedTopic("");
        setStep("landing");
        return;
      }
            // 받아쓴 내용이 무음 환각처럼 보임 — 홈으로 가서 "이렇게 말한 거 맞아?"로 확인한다(아직 저장 안 됨).
      if (body.success && body.data?.needs_confirm && typeof input !== "string") {
        setPendingSpeech({ blob: input, replyTo: selectedTopic || undefined });
        setHomeBubble({ kind: "confirm", text: String(body.data.transcript || "") });
        setSelectedTopic("");
        setStep("landing");
        return;
      }
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
      releaseMicStream();
      setError(e.message);
      setStep("landing");
    }
  };

  return (
    // 크림 배경이 기기 화면 끝(홈 인디케이터 아래)까지 채워지도록 wrapper는 100dvh 전체를 덮는다.
    <div
      style={{
        ...(step === "landing" ? tankWallBackground : step === "tank_recording" ? tankWaterBackground : pageBackground),
        minHeight: "100dvh",
      }}
    >
      {error && (
        <div style={errorBannerStyle}>
          문제가 생겼어: {error}
          <button style={{ marginLeft: 12, background: BRAND.border, color: BRAND.yellow, border: "none", padding: "4px 8px", cursor: "pointer", fontWeight: "bold" }} onClick={() => { releaseMicStream(); setError(null); setStep("landing"); }}>
            처음으로
          </button>
        </div>
      )}

      {step === "onboarding" && (
        <OnboardingScreen
          onComplete={() => {
            if (typeof window !== "undefined") localStorage.setItem(ONBOARDING_KEY, "1");
            // 온보딩을 막 끝낸 사람 = 이 앱을 처음 쓰는 사람.
            // 바로 홈으로 보내지 않고 필수 체크리스트(마이크+전화인증) → 첫 녹음으로 이어지는
            // 첫 실행 흐름을 태운다.
            setIsFirstRun(true);
            setStep("setup_checklist");
          }}
        />
      )}

      {step === "setup_checklist" && (
        <OnboardingChecklistScreen onDone={() => afterSetupChecklist()} />
      )}

      {step === "first_talk" && (
        <FirstTalkScreen
          onStart={() => {
            setSelectedTopic("");
            startRecordingNow();
          }}
        />
      )}

      {step === "landing" && (
        <TimelineScreen
          entries={entries}
          proactiveLine={proactiveLine}
          onNavigate={goTab}
          onOpenMyPage={() => {
            releaseMicStream();
            setMyOpen(true);
          }}
          unreadLetterCount={unreadLetterCount}
          bubble={homeBubble}
          onBubbleChange={changeHomeBubble}
                    onConfirmSpeech={confirmSpeech}
          thinking={homeThinking}
          heard={homeHeard}
          onRetrySpeech={retryUpload}
          onStartRecording={(replyTo) => {
            setTankReplyTo(replyTo);
            setStep("tank_recording");
          }}
                    onOpenMonth={(month) => {
            setMyOpen(false);
            setArchiveMonth(month);
            setStep("archive");
            window.scrollTo(0, 0);
          }}
        />
      )}

      {step === "landing" && myOpen && (
        <MyPageScreen
          asSheet
          onBack={() => setMyOpen(false)}
          onOpenRecords={() => goTab("archive")}
        />
      )}

      {step === "tank_recording" && (
        <TankRecordingScreen
          replyTo={tankReplyTo}
          onDone={(blob) => {
            // 물고기가 위로 떠난 뒤 — 홈으로 돌아가 어항에서 "생각 중"을 보여주며 업로드한다.
            const replyTo = tankReplyTo;
            setTankReplyTo(undefined);
            setHomeBubble(null);
            setHomeThinking(true);
            setStep("landing");
            uploadFromHome(blob, replyTo).finally(() => setHomeThinking(false));
          }}
          onCancel={() => {
            playFx("buttonPress");
            // 참견이의 대답이 아직 떠 있으면 바로 다시 대답할 수 있게 마이크를 들고 있는다.
            if (homeBubble?.kind !== "reply") releaseMicStream();
            setTankReplyTo(undefined);
            setStep("landing");
          }}
          onMicFailed={() => {
            // 마이크를 못 잡음 — 기존 녹음 화면(글로 남기기 가능)으로.
            if (tankReplyTo && proactiveLine && tankReplyTo === proactiveLine.content) setProactiveLine(null);
            setSelectedTopic(tankReplyTo || "");
            setTankReplyTo(undefined);
            setAutoStartRecording(false);
            setStep("recording");
          }}
        />
      )}

      {step === "mypage" && (
        <MyPageScreen onBack={() => setStep("landing")} onOpenRecords={() => setStep("archive")} />
      )}

      {step === "calendar" && (
        <CalendarScreen
          entries={entries}
          onBack={() => setStep("landing")}
        />
      )}

      {step === "insights" && (
        <DiscoveryScreen onBack={() => setStep("landing")} />
      )}

      {step === "letters" && (
        <div className="world-fade">
          <style>{WORLD_CURTAIN_CSS}</style>
          <LettersScreen
            onNavigate={goTab}
            onUnreadCountChange={setUnreadLetterCount}
            onReply={(text) => {
              setTankReplyTo(text);
              setStep("tank_recording");
            }}
          />
        </div>
      )}

      {step === "archive" && (
             <ArchiveScreen
          key={archiveMonth ?? "latest"}
          onNavigate={goTab}
          unreadLetterCount={unreadLetterCount}
          initialMonth={archiveMonth}
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
          autoStart={autoStartRecording}
                // 빈 녹음 안내의 [홈으로] — 업로드가 없었으니 resetAll()(닉네임 질문/첫 기록 처리)을 타지 않고 홈으로만 간다.
          onCancel={() => {
                          playFx("buttonPress");
            releaseMicStream();
            setSelectedTopic("");
            setStep("landing");
          }}
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
          onTalkMore={talkMore}
          onHome={goHome}
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
        <MessageScreen title="기억해뒀어." subtitle="필요할 때 다시 꺼낼게." onTalkMore={talkMore} onHome={goHome} firstRun={isFirstRun} />
      )}

      {step === "calling" && entryId && (
        <CallingScreen
          entryId={entryId}
          onCallEnded={(finishedEntry) => {
            setResult(finishedEntry);
            setStep("result");
          }}
          onHome={goHome}
        />
      )}

      {step === "call_failed" && (
        <MessageScreen
          title="전화 연결이 잘 안 됐어."
          subtitle="그래도 오늘 한 얘기는 기억해뒀어."
          onTalkMore={talkMore}
          onHome={goHome}
          firstRun={isFirstRun}
        />
      )}

      {step === "result" && (
        <ResultScreen
          result={result}
          onTalkMore={talkMore}
          onHome={() => {
                          playFx("buttonPress");
            releaseMicStream();
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

  // 마이크 버튼(홈 / 첫 대화)을 누른 순간 곧바로 녹음 상태로 들어간다.
  // acquireMicStream()을 await 없이 클릭 핸들러 안에서 먼저 불러서, 사용자 제스처 안에서
  // 마이크 요청이 시작되게 한다(iOS Safari 대비). RecordingScreen은 같은 요청/스트림을 이어받는다.
  function startRecordingNow() {
          playFx("micStart"); // 클릭 핸들러 안에서 바로 — 기다리지 않음, 실패해도 무시
    acquireMicStream().catch(() => {}); // 실패는 RecordingScreen이 화면 안에서 처리
    setAutoStartRecording(true);
    setStep("recording");
  }

  // 응답 화면의 "＋ 더 이야기하기" — 홈이나 안내 화면을 거치지 않고 바로 다음 녹음으로.
  // 마이크 스트림은 루프 동안 살아있으므로 권한 팝업이 다시 뜨지 않는다.
  // (닉네임 질문 등 대화 종료 시점의 부가 흐름은 홈으로 갈 때 기존 resetAll에서 그대로 처리)
  function talkMore() {
    setAudioBlob(null);
    setSelectedTopic("");
    setEntryId(null);
    setUploadData(null);
    setResult(null);
    markFirstEntryDoneIfNeeded();
    startRecordingNow();
  }

  // 응답 화면의 "홈으로" — 대화를 끝내는 순간이라 여기서 마이크를 놓아준다.
  function goHome() {
          playFx("buttonPress");
    releaseMicStream();
    resetAll();
  }

  // 필수 체크리스트(마이크+전화인증) 화면을 마친 뒤 어디로 갈지 결정한다.
  // 온보딩을 막 끝낸 진짜 첫 실행이면 원래 계획대로 첫 대화(FirstTalkScreen)로 이어가고,
  // (저장공간 리셋 등으로) 온보딩은 이미 끝났지만 전화 인증이 없어서 여기로 온 경우는
  // 홈으로 바로 보낸다 — 이 사람은 원래 쓰던 사람이라 첫 실행 튜토리얼을 다시 볼 필요가 없다.
  function afterSetupChecklist() {
    if (isFirstRun) {
      setStep("first_talk");
    } else {
      setStep("landing");
    }
  }

  // 첫 실행 여정(온보딩→필수 체크리스트→첫 녹음)이 끝났음을 표시한다.
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

// 물속 녹음 화면일 때 wrapper 배경 — 화면 가장자리까지 물 색.
const tankWaterBackground: React.CSSProperties = {
  backgroundColor: "#2E9BD6",
};

// 홈(바다) 화면일 때 wrapper 배경 — 깊은 물색이라 화면 가장자리에서 크림색이 비치지 않는다.
const tankWallBackground: React.CSSProperties = {
  backgroundColor: "#1B5A96",
};

const errorBannerStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  background: BRAND.border,
  color: BRAND.yellow,
  padding: "12px 16px",
  // position:fixed는 body의 padding-top(안전영역)을 무시하고 화면 맨 위에 그대로 붙기 때문에,
  // 여기서 따로 상단 안전영역만큼 더 얹어줘야 시계/상태바 아이콘과 안 겹친다.
  paddingTop: "calc(12px + env(safe-area-inset-top, 0px))",
  fontSize: 14,
  zIndex: 999,
  textAlign: "center",
  fontWeight: "bold",
  borderBottom: `2px solid ${BRAND.yellow}`,
};

// 홈 업로드 응답 읽기 — 서버가 2단계(NDJSON)로 보내면 받아쓰기 줄을 먼저 onTranscript로 넘기고,
// 마지막 줄의 결과를 돌려준다. 예전처럼 JSON 한 번으로 오면 그대로 읽는다.
async function readUploadResponse(
  res: Response,
  onTranscript: (t: { transcript: string; entry_id: string }) => void
): Promise<{ status: number; body: any }> {
  const ctype = res.headers.get("content-type") || "";
  if (!ctype.includes("ndjson") || !res.body) {
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let final: { status: number; body: any } | null = null;
  const handle = (line: string) => {
    if (!line.trim()) return;
    let msg: any;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg?.stage === "transcript" && typeof msg.transcript === "string") onTranscript(msg);
    else if (msg?.stage === "final") final = { status: Number(msg.status) || 500, body: msg.body };
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      handle(buf.slice(0, i));
      buf = buf.slice(i + 1);
    }
  }
  handle(buf);
  if (!final) throw new Error("응답이 중간에 끊겼어");
  return final;
}
