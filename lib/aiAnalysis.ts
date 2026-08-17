import Anthropic from "@anthropic-ai/sdk";
import { PERSONA_PROMPTS, DEFAULT_PERSONA, resolvePersona, type Persona } from "./personas";

const anthropic = new Anthropic();

const ANALYSIS_SYSTEM_PROMPT = `
너는 사용자의 하루 음성 일기를 분석하는 AI다. 다음 JSON 스키마로만 응답한다 (설명 금지, JSON만):

{
  "excuses": string[],
  "intentions": string[],
  "contradictions": string[],
  "callout": string,
  "emotion": string,
  "topics": string[],
  "concerns": string[],
  "goals": string[],
  "commitments": string[],
  "important_facts": string[],
  "patterns": string[],
  "ai_observation": string
}

각 필드 설명:
- emotion: 발화에서 느껴지는 주된 감정 한 단어 (예: fatigue, anxiety, excitement)
- topics: 언급된 주제 키워드들
- concerns: 사용자가 걱정하거나 신경쓰는 것들
- goals: 사용자가 하려고/하고 싶다고 말한 것들
- commitments: 사용자가 명시적으로 하겠다고 약속한 것들 (goals보다 구체적/확정적인 것만)
- important_facts: 나중에 기억해두면 좋을 구체적 사실
- patterns: 이번 발화 안에서 감지되는 반복적 언행 패턴 (없으면 빈 배열)
- ai_observation: 이 발화에 대한 AI의 한 문장짜리 관찰 (사용자에게 보여지지 않는 내부용, 다음 통화 참고자료)
`;

export type AnalysisResult = {
  excuses: string[];
  intentions: string[];
  contradictions: string[];
  callout: string;
  emotion: string;
  topics: string[];
  concerns: string[];
  goals: string[];
  commitments: string[];
  important_facts: string[];
  patterns: string[];
  ai_observation: string;
};

function emptyAnalysisResult(): AnalysisResult {
  return {
    excuses: [],
    intentions: [],
    contradictions: [],
    callout: "",
    emotion: "",
    topics: [],
    concerns: [],
    goals: [],
    commitments: [],
    important_facts: [],
    patterns: [],
    ai_observation: "",
  };
}

// voice_entries.analysis(jsonb) 컬럼 하나에 통째로 저장할 형태
export async function analyzeTranscript(transcript: string): Promise<AnalysisResult> {
  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 700,
    system: ANALYSIS_SYSTEM_PROMPT,
    messages: [{ role: "user", content: transcript }],
  });

  const block = res.content.find((b) => b.type === "text");
  const raw = block && "text" in block ? block.text : "{}";
  return safeParseJson(raw);
}

function safeParseJson(raw: string): AnalysisResult {
  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    // 필드 누락 방어: 새 필드가 응답에 없어도 기본값으로 채움
    return { ...emptyAnalysisResult(), ...parsed };
  } catch {
    return emptyAnalysisResult();
  }
}

// 통화용 팩폭 멘트 생성. persona가 없으면 기존과 동일하게 기본(fact) 톤으로 동작 — 기존 호출부 하위호환.
export async function generateCallout({
  userSpeech,
  contradictions,
  intensity,
  persona,
  pastPatterns,
}: {
  userSpeech: string;
  contradictions: string[];
  intensity: string;
  persona?: string | null;
  pastPatterns?: string[];
}): Promise<string> {
  const resolvedPersona: Persona = resolvePersona(persona);
  const personaInstruction = PERSONA_PROMPTS[resolvedPersona];

  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 200,
    system: `${personaInstruction}
사용자의 방금 변명과 과거 모순/패턴 기록을 연결해서 2~3문장짜리 통화용 멘트를 만든다.
intensity가 high일수록 더 직설적으로. TTS로 읽히므로 이모지/특수문자 없이 자연스러운 구어체로.
사용자를 지속적으로 모욕하거나 자존감을 훼손하는 표현은 쓰지 않는다. 문장만 출력.`,
    messages: [
      {
        role: "user",
        content: JSON.stringify({ userSpeech, contradictions, intensity, pastPatterns: pastPatterns ?? [] }),
      },
    ],
  });
  const block = res.content.find((b) => b.type === "text");
  return block && "text" in block ? block.text.trim() : "";
}
