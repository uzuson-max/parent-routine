import { josa } from "./korean";
// OpenAI 호출 (gpt-4o-mini, whisper-1). SDK 없이 fetch만 쓴다.
const KEY = () => process.env.OPENAI_API_KEY!;

async function chatJSON(system: string, user: string, temperature = 0.7, model = "gpt-4o-mini"): Promise<any> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error("AI 실패: " + (await res.text()));
  const j = await res.json();
  return JSON.parse(j.choices[0].message.content);
}

const TONE = `너는 자녀가 부모님께 보내는 인생 질문을 쓰는 사람이다.
규칙:
- 존댓말, 말 걸듯 자연스러운 한 문장. 40자 안팎.
- 답하기 쉬운 구체적인 질문 하나. 여러 개 묻지 않는다.
- 추상적으로 묻지 말고 감각(노래, 음식, 장소, 물건, 냄새)이나 장면 하나에서 출발한다.
- 유언·죽음·이별을 떠올리게 하는 표현 금지. 미래의 자녀를 위한 말로 표현한다.
- "녹음", "기록", "인터뷰" 같은 단어 금지.`;

// 모든 질문은 '그때'를 짚는다 — 지금 이야기로 오해할 여지가 없게
const MOMENT = `- 질문마다 인생의 한 순간을 꼭 짚는다: 나이·학년 + 계절·상황. 예) "중학교 1학년 여름방학", "스무 살 첫 겨울", "결혼 전 마지막 봄".
- "그때", "그 시절" 시제를 분명히. "자주 가던 맛집은?"처럼 지금 얘기로 들릴 수 있는 질문 금지 → "고등학생 때 친구들이랑 하교길에 자주 들르던 곳은 어디였어요?"`;

function profileText(profile: Record<string, string>) {
  return Object.entries(profile || {})
    .filter(([, v]) => String(v || "").trim())
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

export type Q = { text: string; format: "audio" | "video" };

// 자녀가 적은 부모님 정보로 맞춤 질문 10개 — 어린 시절부터 지금까지 시간 순서로 떠나는 여행
export async function recommendQuestions(input: {
  honorific: string;
  childName: string;
  profile: Record<string, string>;
}): Promise<Q[]> {
  const out = await chatJSON(
    TONE +
      "\n" +
      MOMENT +
      `
- 10개는 시간 순서: 어린 시절 → 중학생 → 고등학생 → 스무 살 무렵 → 첫 일·연애 → 결혼·${input.childName}가 태어났을 때 → 지금.
- 부모님 정보(학교, 고향, 했던 일)가 있으면 그 이름을 질문에 넣어 그 시절로 바로 데려간다. 예) "경희대 국문과 입학하던 그해 봄"
- 그 시절의 ${input.honorific}가 품었던 꿈, 잘했던 것, 스스로 자랑스러웠던 순간을 떠올리게 하는 질문을 2개 이상 넣는다.
- 앞쪽은 가벼운 장면 질문(audio), 뒤로 갈수록 마음이 뭉클해지는 질문. 뭉클한 질문 3개는 format을 video로.
- JSON: {"questions":[{"text":"...","format":"audio"|"video"}]} 정확히 10개.`,
    `부모님 호칭: ${input.honorific}\n자녀 이름: ${input.childName}\n부모님 정보:\n${profileText(input.profile) || "(없음)"}`
  );
  return (out.questions || []).slice(0, 10).map((q: any) => ({
    text: String(q.text).trim(),
    format: q.format === "video" ? "video" : "audio",
  }));
}

// 질문 하나 → 부모님이 듣는 버전: 그 시절로 데려가는 빌드업(lead) + 그때를 짚은 질문(ask)
export async function timeTravel(input: {
  honorific: string;
  childName: string;
  profile: Record<string, string>;
  question: string;
}): Promise<{ lead: string; ask: string }> {
  const out = await chatJSON(
    `너는 ${input.childName}가 ${input.honorific}께 묻는 질문을, ${input.honorific}가 그 시절로 천천히 돌아갈 수 있게 다듬는 사람이다.
JSON: {"lead":"...","ask":"..."}
lead (2~3문장, 문장마다 25자 안팎):
 1) 질문이 가리키는 한 순간을 정해서 불러준다. 나이·학년 + 계절·상황. 태어난 해를 알면 연도도. 예) "${input.honorific}가 중학교 1학년이던 1975년 여름방학이에요."
 2) 그 순간을 눈앞에 그려보게 한다. 누구에게나 있던 것만 쓴다 (그때 살던 집, 같이 다니던 친구 얼굴, 교복, 그 계절 날씨). 알지 못하는 사실을 지어내지 않는다.
 3) 여유를 준다. 예) "천천히 떠올려 보셔도 괜찮아요."
문체: 라디오 내레이션처럼 단정하고 짧게. 한 문장에 장면 하나. "~했잖아요", "~거든요", "그러니까" 같은 수다체·말끝 늘이기 금지. 같은 어미를 연달아 쓰지 않는다.
ask (한 문장, 45자 이내): 그 순간 안에서 묻는 구체적인 질문. "그때" 시제를 분명히. 원래 질문의 뜻은 유지.
규칙: 존댓말. 부모님 정보에 학교·고향이 있으면 그 이름으로 장면을 구체화. "녹음", "기록", "AI", 죽음·이별 표현 금지.`,
    `원래 질문: ${input.question}\n부모님 정보:\n${profileText(input.profile) || "(없음)"}`,
    0.5,
    process.env.ARTICLE_MODEL || "gpt-4.1" // 부모님이 직접 읽는 문장이라 상위 모델
  );
  return {
    lead: String(out.lead || "").trim().slice(0, 300),
    ask: String(out.ask || input.question).trim().slice(0, 140),
  };
}

// 대답 하나 → 제목, 한 줄 요약
export async function digestAnswer(input: {
  honorific: string;
  question: string;
  transcript: string;
}): Promise<{ title: string; summary: string }> {
  const out = await chatJSON(
    `대답을 읽고 JSON으로 답해라:
{"title":"대답의 핵심을 담은 12자 이내 제목","summary":"대답을 30자 안팎 한 문장으로"}
대답에 없는 내용을 지어내지 않는다.`,
    `부모님 호칭: ${input.honorific}\n질문: ${input.question}\n대답: ${input.transcript.slice(0, 6000)}`,
    0.4
  );
  return {
    title: String(out.title || "").slice(0, 30),
    summary: String(out.summary || "").slice(0, 120),
  };
}

// 이야기 진행자: 방금 대답에 짧게 맞장구 + 이어서 물을 질문 하나 (또는 그만)
export async function hostTurn(input: {
  honorific: string;
  childName: string;
  question: string;
  transcript: string;
  turn: number; // 방금 끝난 대답의 순번 (0부터)
  videoDone: boolean;
}): Promise<{ react: string; followup: string | null; video: boolean }> {
  const out = await chatJSON(
    `너는 ${input.childName}가 ${input.honorific}께 마련한 이야기 시간의 진행자다. 라디오 DJ처럼 다정하게 듣는다.
방금 ${input.honorific}가 한 대답을 읽고 JSON으로 답해라:
{"react":"대답 속 구체적인 단어 하나를 짚는 짧은 맞장구 (25자 이내, 존댓말)",
 "followup":"대답 속 사람·장소·물건·그때 기분 중 하나만 이어 묻는 질문 (40자 이내) 또는 null",
 "moving": true|false}
규칙:
- 맞장구는 재진술하지 않는다. 대답에 없는 감정을 지어내지 않는다. 과장된 감탄 금지.
- 대답이 아주 짧으면 고르기 쉬운 선택지를 넣어 묻는다. 예: "친구랑이었어요, 혼자였어요?"
- 대답에 울컥하거나 무거운 기색(돌아가신 분, 힘들었던 일)이 있으면 react는 "천천히 하셔도 돼요" 같은 말로 하고, followup은 가볍게 하거나 null.
- 이어 묻는 질문은 처음 질문의 그 시절 안에 머문다. 지금 이야기로 건너뛰지 않는다. 예) "그 친구랑은 그 여름에 주로 어디서 만났어요?"
- 이야기가 충분히 마무리됐거나 더 묻는 게 실례 같으면 followup은 null.
- moving: 대답이 자녀에게 꼭 얼굴로 남기고 싶을 만큼 마음이 담긴 내용이면 true.
- "녹음", "기록", "AI" 같은 단어 금지.`,
    `처음 질문: ${input.question}\n대답: ${input.transcript.slice(0, 4000)}`
  );
  const react = String(out.react || "").slice(0, 60) || "말씀 잘 들었어요.";
  let followup = out.followup ? String(out.followup).slice(0, 80) : null;
  const video = !!out.moving && !input.videoDone && input.turn < 2;
  if (input.turn >= 2) followup = null;
  if (video) followup = `방금 그 이야기, ${josa(input.childName, "이/가")} 얼굴 보면서 한 번 더 듣고 싶을 것 같아요. 1분만 들려주실래요?`;
  return { react, followup, video };
}

// 한 질문의 대답들 → 우리집 신문 기사.
// 원칙: 부모님이 한 말만 쓴다. 대답보다 길어지지 않고, 교훈·감상을 덧붙이지 않는다.
export const ARTICLE_SYSTEM = (honorific: string, childName: string, answerChars: number) =>
  `${honorific}가 ${childName}에게 들려준 이야기를 우리집 신문 기사로 엮어라. JSON:
{"titles":["제목 후보 3개. 각각 16자 이내. 대답에 나온 물건·음식·장소·사람·말 그대로를 넣는다. 예) '고등어 굽던 화순 부엌', '88년 카세트 테이프', '밥은 먹고 다니냐'. 꿈·현실·추억·기억·따뜻한·소중한·응원·행복·사랑·중요성·이야기 같은 추상어 금지"],
 "quote":"대답에서 그대로 복사한 한 문장 (40자 이내). 한 글자도 바꾸지 않는다. 마땅한 문장이 없으면 null",
 "body":"${honorific}의 1인칭 글",
 "next":"다음 주에 이어서 물으면 좋을 질문 하나 (존댓말, 40자 안팎) 또는 null"}
본문 규칙:
- ${honorific}가 실제로 한 말만으로 만든다. 모든 문장은 대답 속에 근거가 있어야 한다.
- 대답에 없는 사실·감정·교훈·당부·회상을 절대 덧붙이지 않는다. "~해야 해", "~가 소중하더라", "그 시절이 그리워" 같은 마무리 금지.
- 군말(음, 그러니까)과 같은 말 반복만 정리한다. 사투리·어미·말버릇·말끝 흐림은 그대로 둔다.
- 길이: 핵심만 담은 짧은 글. ${Math.min(450, Math.max(80, Math.round(answerChars * 0.6)))}자 이내. 전체 말씀은 따로 보관되니 다 옮기려 하지 않는다.
- 대답 중 장면이 가장 선명하고 마음이 담긴 부분을 고른다. 곁가지·설명·반복은 뺀다.
- 문단 1~3개, 문단 사이 빈 줄.`;

const normText = (s: string) => String(s || "").replace(/[\s.,!?~…'"“”‘’·-]/g, "");

// 받아쓰기를 그대로 보여줄 때 쓰는 최소 정리 (공백·같은 군말 반복만)
export function tidyTranscript(t: string) {
  return String(t || "")
    .replace(/\s+/g, " ")
    .replace(/(음|어|그러니까)[,\s]+(?=(음|어|그러니까)[,\s])/g, "")
    .trim();
}


// 제목: 추상어 없는 첫 후보 → 없으면 인용구 앞부분 → 그래도 없으면 첫 후보
const ABSTRACT = /꿈|현실|추억|기억|따뜻|소중|응원|행복|사랑|중요|이야기|순간|모습/;
export function pickTitle(cands: any, quote: string | null, question: string) {
  const list = (Array.isArray(cands) ? cands : [cands]).map((t) => String(t || "").trim()).filter(Boolean);
  const good = list.find((t) => !ABSTRACT.test(t));
  if (good) return good.slice(0, 30);
  if (quote) return (quote.length > 18 ? quote.slice(0, 17) + "…" : quote);
  return (list[0] || question).slice(0, 30);
}

export async function writeArticle(input: {
  honorific: string;
  childName: string;
  question: string;
  turns: { asked: string; transcript: string }[];
}): Promise<{ title: string; body: string; quote: string | null; nextQuestion: string | null; fallback: boolean }> {
  const talk = input.turns.map((t) => `Q. ${t.asked}\nA. ${t.transcript}`).join("\n\n").slice(0, 9000);
  const said = input.turns.map((t) => t.transcript).join("\n");
  const answerChars = said.replace(/\s+/g, " ").trim().length;
  const out = await chatJSON(
    ARTICLE_SYSTEM(input.honorific, input.childName, answerChars),
    `처음 질문: ${input.question}\n\n${talk}`,
    0.3,
    process.env.ARTICLE_MODEL || "gpt-4.1" // 결과물이 상품이라 기사만 상위 모델
  );
  let body = String(out.body || "").slice(0, 6000);
  // 안전장치 1: 기사가 대답보다 부풀면 부모님 말 원문으로
  const fallback = !body.trim() || body.length > Math.min(answerChars * 1.2 + 40, 700);
  if (fallback) {
    const raw = input.turns.map((t) => tidyTranscript(t.transcript)).filter(Boolean).join("\n\n");
    body = raw.length > 450 ? raw.slice(0, 440).replace(/\s+\S*$/, "") + "…" : raw;
  }
  // 안전장치 2: 인용구가 대답에 그대로 없으면 뺀다
  let quote: string | null = out.quote ? String(out.quote).replace(/^["“]|["”]$/g, "").slice(0, 80) : null;
  if (quote && !normText(said).includes(normText(quote))) quote = null;
  return {
    title: pickTitle(out.titles ?? out.title, quote, input.question),
    body,
    quote,
    nextQuestion: out.next ? String(out.next).slice(0, 120) : null,
    fallback,
  };
}

// 자녀가 직접 쓴 질문을 부모님께 보내기 좋은 말투로
export async function polishQuestion(input: { honorific: string; childName: string; text: string }): Promise<string> {
  const out = await chatJSON(
    TONE +
      "\n" +
      MOMENT +
      `\n자녀가 쓴 질문의 뜻은 그대로 두고, 부모님이 받았을 때 편하게 답할 수 있는 한 문장으로 다듬어라.
부모님은 "${input.honorific}", 자녀는 "${input.childName}"라고 부른다.
JSON: {"text":"다듬은 질문"}`,
    input.text.slice(0, 300)
  );
  return String(out.text || input.text).trim();
}

export async function transcribe(buf: ArrayBuffer, mime: string): Promise<string> {
  const ext = mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "webm";
  const form = new FormData();
  form.append("file", new Blob([buf], { type: mime }), `audio.${ext}`);
  form.append("model", "whisper-1");
  form.append("language", "ko");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY()}` },
    body: form,
  });
  if (!res.ok) throw new Error("STT 실패: " + (await res.text()));
  return (await res.json()).text as string;
}
