// backend/services/aiAnalysis.js
// 녹음 완료 직후 1회 호출: STT 결과를 받아 excuses/intentions/contradictions/ai_callout_seed를 추출

const Anthropic = require("@anthropic-ai/sdk");
const anthropic = new Anthropic();

const ANALYSIS_SYSTEM_PROMPT = `
너는 사용자의 하루 음성 일기를 분석하는 AI다. 다음 JSON 스키마로만 응답한다 (설명 금지, JSON만):

{
  "excuses": string[],        // 사용자가 댄 핑계/변명 (없으면 빈 배열)
  "intentions": string[],     // "~할 거야" 같은 다짐/계획
  "contradictions": string[], // 이번 발화 안에서 스스로 모순되는 지점 (예: "바쁘다면서 게임 얘기함")
  "ai_callout_seed": string   // 통화 오프닝에 쓸 한 문장짜리 팩폭 소재 (너무 길지 않게, 위트있게)
}
`;

async function analyzeTranscript(transcript) {
  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    system: ANALYSIS_SYSTEM_PROMPT,
    messages: [{ role: "user", content: transcript }],
  });

  const raw = res.content.find((b) => b.type === "text")?.text ?? "{}";
  return safeParseJson(raw);
}

function safeParseJson(raw) {
  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch (e) {
    return { excuses: [], intentions: [], contradictions: [], ai_callout_seed: "" };
  }
}

// 턴2 웹훅에서 사용: 사용자의 실시간 변명(userSpeech) + 과거 모순을 엮어 팩폭 한 문단 생성
async function generateCallout({ userSpeech, contradictions, intensity }) {
  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 200,
    system: `너는 반말로 팩폭하는 AI 친구다. 사용자의 방금 변명과 과거 모순 기록을 연결해서
    2~3문장짜리 통화용 팩폭 멘트를 만든다. intensity가 high일수록 더 직설적으로.
    TTS로 읽히므로 이모지/특수문자 없이 자연스러운 구어체로. 문장만 출력.`,
    messages: [
      { role: "user", content: JSON.stringify({ userSpeech, contradictions, intensity }) },
    ],
  });
  return res.content.find((b) => b.type === "text").text.trim();
}

module.exports = { analyzeTranscript, generateCallout };
