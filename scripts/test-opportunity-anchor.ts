
//
// Opportunity STEP 1 — anchor 기록 확인 스크립트 (DB 읽기/쓰기 없음, 앱 동작에 영향 없음)
// 실행: OPENAI_API_KEY=sk-... npx tsx scripts/test-opportunity-anchor.ts [반복횟수=3]
//
// 실제 테스트 발화(voice_entries 889a6532…)를 그때 저장된 analysis 그대로 넣고, 운영과 똑같은
// buildSystemPrompt() → generation GPT 호출(gpt-4o-mini, temperature 0.9, json_object) → buildGeneratedResult()
// 경로를 N번 돌려서 conversation_opportunity(anchor 포함)와 response를 출력한다.
// temperature가 0.9라 결과가 매번 달라지므로 1회가 아니라 여러 번 돌려서 본다.
//
// 운영 경로와 다른 점: validation/regeneration 단계는 생략한다 (STEP 1은 "무엇을 붙잡았는가"를 보는 게 목적).
// relationshipLevel=5, 닉네임 없음, 기억/최근대화 없음 — 실제 저장 기록의 memory_relevance가 []였고,
// 직전 턴은 1시간 40분 전의 다른 화제였다.

import { buildSystemPrompt } from '../lib/response/responseprompt';
import { buildGeneratedResult } from '../lib/response/responseutils';

const TRANSCRIPT = '아 이번 주 토요일에는 고양이 털도 너무 많이 날려고 해서 방 청소해야 할 것 같아';

// 실제 저장된 analysis (voice_entries.analysis, 2026-09-24 19:07 UTC)
const ANALYSIS = {
  type: 'none',
  summary: '사용자는 이번 주 토요일에 방 청소를 해야 할 것 같다고 언급했다.',
  goal: null,
  commitment: null,
  commitment_type: null,
  commitment_confidence: null,
  excuse: null,
  emotion: null,
  detected_pattern: null,
  contradictions: [],
  intervention_needed: false,
  intervention_reason: null,
  fulfilled_commitments: [],
};

const PREVIOUS_RESPONSE = '고양이 털로 청소하니까 더 귀찮겠네. 어떤 청소 방법 쓰는지 궁금해! 너만의 노하우가 있어?';

async function callGenerationGPT(systemPrompt: string): Promise<any> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }],
      response_format: { type: 'json_object' },
      temperature: 0.9,
    }),
  });
  if (!res.ok) throw new Error('generation 호출 실패: ' + (await res.text()));
  const json = await res.json();
  return JSON.parse(json.choices[0].message.content);
}

function compact(s: string): string {
  return s.replace(/\s+/g, '');
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY가 필요합니다.');
    process.exit(1);
  }
  const runs = Number(process.argv[2] ?? 3) || 3;

  const systemPrompt = buildSystemPrompt({
    transcript: TRANSCRIPT,
    analysis: ANALYSIS,
    memoryCandidates: [],
    existingCommitments: [],
    relevantMemoryUnits: [],
    relevantInsights: [],
    initialTopic: undefined,
    relationshipLevel: 5,
    nickname: null,
    callAllowed: false,
    recentTurns: [],
  });

  console.log(`발화: "${TRANSCRIPT}"`);
  console.log(`기존 응답(변경 전 실제 기록): "${PREVIOUS_RESPONSE}"\n`);

  for (let i = 1; i <= runs; i++) {
    const parsed = await callGenerationGPT(systemPrompt);
    const result = buildGeneratedResult(parsed, false, [], [], 5, new Set(), new Set());
    const opp = result.conversation_opportunity;
    const quoteInTranscript = opp.anchor_quote !== null && compact(TRANSCRIPT).includes(compact(opp.anchor_quote));

    console.log(`==== RUN ${i} ====`);
    console.log('conversation_opportunity =', JSON.stringify(opp, null, 2));
    console.log(`anchor_quote가 원문 구간인가: ${opp.anchor_quote === null ? '(null)' : quoteInTranscript ? 'YES' : 'NO'}`);
    console.log(`strategy=${result.response_strategy}, purpose=${result.interference_purpose}`);
    console.log(`response: "${result.response}"\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
