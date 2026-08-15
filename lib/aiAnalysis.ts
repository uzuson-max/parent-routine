import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

const ANALYSIS_SYSTEM_PROMPT = `
너는 사용자의 하루 음성 일기를 분석하는 AI다. 다음 JSON 스키마로만 응답한다 (설명 금지, JSON만):

{
  "excuses": string[],
  "intentions": string[],
  "contradictions": string[],
  "callout": string
}
`;

export type AnalysisResult = {
  excuses: string[];
  intentions: string[];
  contradictions: string[];
  callout: string;
};

// voice_entries.analysis(jsonb) 컬럼 하나에 통째로 저장할 형태
export async function analyzeTranscript(transcript: string): Promise<AnalysisResult> {
  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    system: ANALYSIS_SYSTEM_PROMPT,
    messages: [{ role: "user", content: transcript }],
  });

  const block = res.content.find((b) => b.type === "text");
  const raw = block && "text" in block ? block.text : "{}";
  return safeParseJson(raw);
}

function safeParseJson(raw: string): AnalysisResult {
  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return { excuses: [], intentions: [], contradictions: [], callout: "" };
  }
}

// voice_entries.call_message 컬럼에 저장할 실제 팩폭 멘트 생성
export async function generateCallout({
  userSpeech,
  contradictions,
  intensity,
}: {
  userSpeech: string;
  contradictions: string[];
  intensity: string;
}): Promise<string> {
  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 200,
    system: `너는 반말로 팩폭하는 AI 친구다. 사용자의 방금 변명과 과거 모순 기록을 연결해서
    2~3문장짜리 통화용 팩폭 멘트를 만든다. intensity가 high일수록 더 직설적으로.
    TTS로 읽히므로 이모지/특수문자 없이 자연스러운 구어체로. 문장만 출력.`,
    messages: [{ role: "user", content: JSON.stringify({ userSpeech, contradictions, intensity }) }],
  });
  const block = res.content.find((b) => b.type === "text");
  return block && "text" in block ? block.text.trim() : "";
}
