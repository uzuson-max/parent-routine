"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, browserClient } from "@/lib/supabaseBrowser";
import { render, josa } from "@/lib/korean";
import { buildCourse } from "@/lib/questions";

const empty = {
  childName: "", label: "엄마", honorific: "어머니", phone: "",
  sendWeekday: 2, sendHour: 9, unsealAt: "",
  born: "", school: "", hometown: "", job: "", likes: "", likeFood: "",
  childBorn: "", food: "", catchphrase: "", unsaid: "",
};
type F = typeof empty;

const HONORIFIC: Record<string, string> = { 엄마: "어머니", 아빠: "아버지" };
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

function profileOf(f: F) {
  return {
    "태어난 해": f.born, "학교·전공": f.school, 고향: f.hometown, "결혼 전 했던 일": f.job, "요즘 즐겨 하는 것": f.likes, "좋아하는 음식": f.likeFood,
    "내가 태어난 해": f.childBorn, "최애 음식": f.food, 말버릇: f.catchphrase, "못 한 말": f.unsaid,
  };
}

function varsOf(f: F) {
  return {
    childGiven: f.childName.trim() || "재빈이", childIsNickname: true, parentTitle: f.label.trim() || "엄마",
    parentBirthYear: parseInt(f.born, 10) || 0, childBirthYear: parseInt(f.childBorn, 10) || 0,
  };
}

export default function Family() {
  const router = useRouter();
  const [f, setF] = useState<F>(empty);
  const [isNew, setIsNew] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  const [agree, setAgree] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    api("/api/me/family").then(({ family, storyteller }) => {
      if (family && storyteller) {
        setIsNew(false);
        const p = storyteller.profile || {};
        setF({
          childName: family.child_name, label: storyteller.label, honorific: storyteller.honorific, phone: storyteller.phone,
          sendWeekday: storyteller.send_weekday, sendHour: storyteller.send_hour, unsealAt: storyteller.unseal_at || "",
          born: p["태어난 해"] || "", school: p["학교·전공"] || "", hometown: p.고향 || "", job: p["결혼 전 했던 일"] || p["했던 일"] || "", likes: p["요즘 즐겨 하는 것"] || p["좋아하는 것"] || "", likeFood: p["좋아하는 음식"] || "",
          childBorn: p["내가 태어난 해"] || "", food: p["최애 음식"] || "", catchphrase: p["말버릇"] || "", unsaid: p["못 한 말"] || "",
        });
      }
    }).finally(() => setLoaded(true));
  }, []);

  const set = (k: keyof F) => (e: any) => setF({ ...f, [k]: e.target.value });
  const p = f.label.trim() || "엄마";

  async function save() {
    setBusy(true); setErr(""); setSaved(false);
    try {
      await api("/api/me/family", {
        method: "POST",
        body: JSON.stringify({
          ...f, sendWeekday: Number(f.sendWeekday), sendHour: Number(f.sendHour), unsealAt: null, agree,
          profile: profileOf(f),
        }),
      });
      if (isNew) router.replace("/app/pick");
      else setSaved(true);
    } catch (e: any) {
      setErr(e.message);
    }
    setBusy(false);
  }

  if (!loaded) return <main className="screen" />;

  /* ───────── 기존 가족: 한 화면에서 고치기 ───────── */
  if (!isNew) {
    return (
      <main className="screen with-tabs">
        <form onSubmit={(e) => { e.preventDefault(); save(); }} className="stack">
          <h1 className="h1">가족</h1>
          <Field label="부모님이 나를 부르는 이름"><input className="input" required value={f.childName} onChange={set("childName")} /></Field>
          <div className="row">
            <Field label="내가 부르는 호칭"><input className="input" required value={f.label} onChange={set("label")} /></Field>
            <Field label="문자 속 호칭"><input className="input" required value={f.honorific} onChange={set("honorific")} /></Field>
          </div>
          <Field label="부모님 휴대폰 번호"><input className="input" required inputMode="tel" value={f.phone} onChange={set("phone")} /></Field>
          <Field label="질문이 가는 시간" hint="화요일과 토요일, 이 시간에 가요">
            <select className="input" value={f.sendHour} onChange={set("sendHour")}>
              {HOURS.map((h) => <option key={h} value={h}>{h}시</option>)}
            </select>
          </Field>
          <div className="row">
            <Field label="부모님이 태어난 해"><input className="input" inputMode="numeric" value={f.born} onChange={set("born")} /></Field>
            <Field label="내가 태어난 해"><input className="input" inputMode="numeric" value={f.childBorn} onChange={set("childBorn")} /></Field>
          </div>
          <Field label="부모님 음식 중 내 최애"><input className="input" value={f.food} onChange={set("food")} /></Field>
          <Field label="부모님 말버릇"><input className="input" value={f.catchphrase} onChange={set("catchphrase")} /></Field>
          <Field label="마지막으로 다니신 학교"><input className="input" value={f.school} onChange={set("school")} /></Field>
          <Field label="고향"><input className="input" value={f.hometown} onChange={set("hometown")} /></Field>
          <Field label="결혼 전에 하셨던 일"><input className="input" value={f.job} onChange={set("job")} /></Field>
          <Field label="좋아하시는 음식"><input className="input" value={f.likeFood} onChange={set("likeFood")} /></Field>
          <Field label="요즘 즐겨 하시는 것"><input className="input" value={f.likes} onChange={set("likes")} /></Field>
          {err && <p className="err">{err}</p>}
          {saved && <p className="small" style={{ color: "var(--primary)" }}>저장했어요.</p>}
          <button className="btn" disabled={busy}>{busy ? "저장 중…" : "저장"}</button>
          <button type="button" className="link" onClick={() => router.push("/app/pick")}>12번의 이야기 새로 설계하기</button>
          <button type="button" className="link" onClick={async () => { await browserClient().auth.signOut(); router.replace("/"); }}>로그아웃</button>
        </form>
      </main>
    );
  }

  /* ───────── 처음 오신 분: 상담처럼 하나씩 ───────── */
  const v = varsOf(f);
  const years = v.parentBirthYear > 1900 && v.childBirthYear > v.parentBirthYear;
  const course = buildCourse({ childName: v.childGiven, label: p, profile: profileOf(f) });

  const steps: { title: string; why?: string; body: React.ReactNode; ok?: boolean; optional?: boolean }[] = [
    {
      title: "몇 가지만 여쭤볼게요",
      body: (
        <div className="stack" style={{ gap: 14 }}>
          <p className="serif" style={{ margin: 0, fontSize: 19, lineHeight: 1.65 }}>
            같은 질문도 누구에게 묻느냐에 따라 전혀 다른 이야기가 나와요.
          </p>
          <p className="small" style={{ margin: 0, lineHeight: 1.75 }}>
            여기 적어주시는 연도, 호칭, 음식, 말버릇이 그대로 질문 속 장면이 돼요.
            그래서 많이 알려주실수록 부모님이 받는 질문이 정확해지고, 대답과 기사도 깊어져요.
          </p>
          <p className="tiny muted" style={{ margin: 0 }}>3분 정도 걸려요. 모르는 건 넘어가도 문장이 어색해지지 않게 설계돼 있어요.</p>
        </div>
      ),
    },
    {
      title: "누구의 이야기를 남길까요?",
      why: "질문과 문자 속 호칭이 돼요.",
      ok: !!f.label.trim(),
      body: (
        <div className="stack" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 8 }}>
            {["엄마", "아빠"].map((l) => (
              <button key={l} type="button" className="btn" style={f.label === l ? undefined : { background: "transparent", color: "inherit", border: "1px solid currentColor", boxShadow: "none" }} onClick={() => setF({ ...f, label: l, honorific: HONORIFIC[l] })}>
                {l}
              </button>
            ))}
          </div>
          <Field label="다르게 부르면 적어주세요" hint="예: 어머니, 우리 엄마">
            <input className="input" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value, honorific: HONORIFIC[e.target.value] || e.target.value })} />
          </Field>
        </div>
      ),
    },
    {
      title: `${josa(p, "이/가")} 나를 뭐라고 불러요?`,
      why: "부모님께 가는 문자에 이 이름이 그대로 써요. 평소 부르는 그대로가 좋아요.",
      ok: !!f.childName.trim(),
      body: (
        <div className="stack" style={{ gap: 12 }}>
          <input className="input" autoFocus value={f.childName} onChange={set("childName")} placeholder="예: 재빈이, 우리 딸, 막내" />
          {f.childName.trim() && <Preview label={`${p}에게 이렇게 가요`} text={render("{child:이/가} 보낸 질문이 도착했어요.", v)} />}
        </div>
      ),
    },
    {
      title: "태어난 해를 알려주세요",
      why: `첫 질문이 "그해 ${josa(p, "은/는")} 몇 살이었는지"에서 시작해요. 연도가 정확할수록 ${josa(p, "이/가")} 그 시절로 바로 돌아가요.`,
      optional: true,
      body: (
        <div className="stack" style={{ gap: 12 }}>
          <div className="row">
            <Field label={`${josa(p, "이/가")} 태어난 해`}><input className="input" inputMode="numeric" value={f.born} onChange={set("born")} placeholder="1967" /></Field>
            <Field label="내가 태어난 해"><input className="input" inputMode="numeric" value={f.childBorn} onChange={set("childBorn")} placeholder="1997" /></Field>
          </div>
          {years && (
            <Preview label="이런 장면이 만들어져요" text={render("{childBirthYear}년, {parent:은/는} {age@childBirth:살}이었어요.", v)} />
          )}
        </div>
      ),
    },
    {
      title: `${p} 음식 중에 제일 좋아하는 건요?`,
      why: `${josa(p, "이/가")} 그 음식을 처음부터 영상으로 알려주는 회차가 돼요. 언젠가 다시 못 먹게 될 맛을 남기는 시간이에요.`,
      optional: true,
      body: <input className="input" value={f.food} onChange={set("food")} placeholder="예: 김치찌개, 계란볶음밥" />,
    },
    {
      title: `${josa(p, "이/가")} 맨날 하던 말이 있어요?`,
      why: "그 말을 왜 그렇게 자주 했는지, 그리고 지금 한 번만 해달라고 묻는 회차가 돼요.",
      optional: true,
      body: <input className="input" value={f.catchphrase} onChange={set("catchphrase")} placeholder="예: 밥은 먹고 다니냐" />,
    },
    {
      title: `${p}에 대해 아는 만큼만`,
      why: "질문을 다듬고, 기사에 그 시절 배경을 입히는 데 써요. 아는 것만 적어도 충분해요.",
      optional: true,
      body: (
        <div className="stack" style={{ gap: 10 }}>
          <Field label="고향"><input className="input" value={f.hometown} onChange={set("hometown")} placeholder="예: 전남 순천" /></Field>
          <Field label="마지막으로 다니신 학교"><input className="input" value={f.school} onChange={set("school")} placeholder="예: 순천공고" /></Field>
          <Field label="결혼 전에 하셨던 일"><input className="input" value={f.job} onChange={set("job")} placeholder="예: 섬유공장, 미용실, 은행" /></Field>
          <Field label="좋아하시는 음식"><input className="input" value={f.likeFood} onChange={set("likeFood")} placeholder="예: 해산물, 회" /></Field>
          <Field label="요즘 즐겨 하시는 것"><input className="input" value={f.likes} onChange={set("likes")} placeholder="예: 텃밭 가꾸기, 트로트, 등산" /></Field>
        </div>
      ),
    },
    {
      title: "질문을 어디로 보낼까요?",
      why: `화요일과 토요일, 정한 시간에 ${p} 휴대폰으로 문자가 가요.`,
      ok: f.phone.replace(/\D/g, "").length >= 10 && agree,
      body: (
        <div className="stack" style={{ gap: 12 }}>
          <Field label={`${p} 휴대폰 번호`} hint="첫 문자가 오면 이 번호를 '우리집 레코드'로 저장해 주세요. 그래야 링크가 바로 눌려요.">
            <input className="input" inputMode="tel" value={f.phone} onChange={set("phone")} placeholder="010-0000-0000" />
          </Field>
          <Field label="받으시기 편한 시간">
            <select className="input" value={f.sendHour} onChange={set("sendHour")}>
              {HOURS.map((h) => <option key={h} value={h}>{h}시</option>)}
            </select>
          </Field>
          <label className="row small" style={{ alignItems: "flex-start", gap: 10, lineHeight: 1.6 }}>
            <input type="checkbox" className="check" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>
              <a href="/terms" target="_blank">이용약관</a>과 <a href="/privacy" target="_blank">개인정보처리방침</a>에 동의하고,
              {" "}{p}에게 서비스를 알리고 동의를 받았어요. 서비스 개선을 위해 운영자가 녹음과 글을 볼 수 있다는 점도 확인했어요. (필수)
            </span>
          </label>
        </div>
      ),
    },
    {
      title: `${p}만을 위한 12번의 이야기가 설계됐어요`,
      why: "첫 두 질문은 이렇게 가요. 다음 화면에서 12번 전체를 볼 수 있어요.",
      body: (
        <div className="stack" style={{ gap: 12 }}>
          {course.slice(0, 2).map((w) => (
            <div key={w.week} className="card stack" style={{ gap: 8 }}>
              <span className="chip">{w.week}회차 · {w.format === "video" ? "영상" : "음성"}</span>
              {w.lead && <p className="small muted" style={{ margin: 0 }}>{w.lead}</p>}
              <p className="serif" style={{ margin: 0, fontSize: 17, lineHeight: 1.6 }}>{w.ask}</p>
            </div>
          ))}
          {err && <p className="err">{err}</p>}
        </div>
      ),
    },
  ];

  const s = steps[step];
  const last = step === steps.length - 1;
  const canNext = s.ok !== false;

  return (
    <main className="screen">
      <div className="stack" style={{ gap: 20, minHeight: "80vh" }}>
        <div style={{ height: 3, background: "rgba(127,127,127,.2)", borderRadius: 2 }}>
          <div style={{ height: 3, width: `${((step + 1) / steps.length) * 100}%`, background: "var(--primary)", borderRadius: 2, transition: "width .3s" }} />
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <span className="tiny muted">{step === 0 ? "상담" : `${step} / ${steps.length - 1}`}</span>
          <h1 className="h1" style={{ margin: 0 }}>{s.title}</h1>
          {s.why && <p className="small muted" style={{ margin: 0, lineHeight: 1.7 }}>{s.why}</p>}
        </div>
        <div>{s.body}</div>
        <div className="grow" />
        <div className="stack" style={{ gap: 8, position: "sticky", bottom: 16 }}>
          {last ? (
            <button className="btn" disabled={busy} onClick={save}>{busy ? "준비 중…" : "12번 전체 보기"}</button>
          ) : (
            <button className="btn" disabled={!canNext} onClick={() => setStep(step + 1)}>{step === 0 ? "시작할게요" : "다음"}</button>
          )}
          <div className="row" style={{ justifyContent: "space-between" }}>
            {step > 0 ? <button type="button" className="link" onClick={() => setStep(step - 1)}>이전</button> : <span />}
            {s.optional && <button type="button" className="link" onClick={() => setStep(step + 1)}>잘 모르겠어요, 넘어갈게요</button>}
          </div>
        </div>
      </div>
    </main>
  );
}

function Preview({ label, text }: { label: string; text: string }) {
  return (
    <div className="card stack" style={{ gap: 6 }}>
      <span className="tiny muted">{label}</span>
      <p className="serif" style={{ margin: 0, fontSize: 17, lineHeight: 1.6 }}>{text}</p>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field" style={{ flex: 1 }}>
      <label>{label}</label>
      {children}
      {hint && <span className="tiny muted">{hint}</span>}
    </div>
  );
}
