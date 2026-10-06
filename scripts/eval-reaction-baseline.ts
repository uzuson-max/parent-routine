//
// Reaction-First 전환 Step 0 — 현재 제품 응답 엔진의 baseline 평가 (2026-10-06).
//
// - 제품 코드는 한 줄도 바꾸지 않는다. 운영과 같은 경로를 그대로 호출만 한다:
//     analyzeTranscriptOnly() (= 운영 분석 프롬프트·모델·temperature, DB 조회 없음)
//     → generateResponseCore() (= 운영 프롬프트 → 생성 → 검증 → repair/재생성 → fallback, DB 조회 없음)
// - 평가 문장은 이 파일 안에만 있다. 프롬프트·예시 어디에도 넣지 않는다(평가 오염 방지).
// - 운영과 다른 점(고정값): 관계 단계 3, 닉네임 없음, 최근 대화 없음, 전화 불가, 실제 기억 검색(retrieval) 없음.
//   기억 케이스(M1·M2)는 기억 후보를 직접 넣는다 — retrieval이 그 기억을 실제로 찾는지는 이 평가 범위 밖이다.
// - 자동 지표(auto_hints)는 사람 평가를 돕는 "힌트"일 뿐 판정이 아니다. 참견이다움 등 사람 평가 칸은 비워 둔다.
//
// 실행 (PowerShell, 레포 루트에서):
//   $env:OPENAI_API_KEY = Read-Host "key"        ← key: 가 나오면 키만 붙여넣기 (화면·파일에 출력하지 않음)
//   npx.cmd tsx scripts/eval-reaction-baseline.ts          ← 케이스당 3회 (기본값)
//   npx.cmd tsx scripts/eval-reaction-baseline.ts 1        ← 빠른 확인용 1회
// 출력: 콘솔 요약 + eval-reaction-baseline-<시각>.json (전체 기록) + eval-reaction-baseline-<시각>.csv (사람 평가용, 엑셀로 열기)
import { writeFileSync } from 'fs';
import type { RelevantMemoryUnit } from '../lib/memoryRetrieval';
import { intentNeedsAnswer } from '../lib/response/understanding';

// ---- OpenAI 429/5xx 재시도 (운영 코드는 전역 fetch를 쓰므로 전역 fetch를 감싼다. 응답 내용은 그대로) ----
const origFetch = globalThis.fetch.bind(globalThis);
let rateLimitWaits = 0;
globalThis.fetch = (async (url: any, init?: any) => {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await origFetch(url, init);
      if ((res.status === 429 || res.status >= 500) && attempt < 8) {
        const ra = Number(res.headers.get('retry-after'));
        const waitMs = Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(60000, 2000 * 2 ** attempt);
        rateLimitWaits++;
        console.log(`     (OpenAI ${res.status} — ${Math.round(waitMs / 1000)}초 대기 후 재시도)`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      return res;
    } catch (e) {
      if (attempt >= 8) throw e;
      await new Promise((r) => setTimeout(r, Math.min(60000, 2000 * 2 ** attempt)));
    }
  }
}) as typeof fetch;

// ==================================================================================================
// 평가 세트
// ==================================================================================================
type Group = 'current_turn' | 'memory' | 'regression_v18' | 'answer_regression';
interface EvalCase {
  id: string;
  group: Group;
  transcript: string;
  memories: RelevantMemoryUnit[];
  // 원문에서 응답에 반드시 살아 있어야 하는 구체 anchor(숫자 등). 자동 힌트용.
  mustKeep?: RegExp[];
}

function memoryFixture(id: number, content: string, rawQuote: string, subject: string): RelevantMemoryUnit {
  return {
    id,
    memory_type: 'intention',
    subject,
    content,
    emotion: null,
    temporal_context: '한 달쯤 전',
    importance: 0.6,
    status: 'open',
    created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    last_referenced_at: null,
    relevanceScore: 5,
    relevanceReason: 'eval fixture',
    stance: 'positive',
    raw_quote: rawQuote,
  };
}

const CASES: EvalCase[] = [
  // ---- Current-turn reaction ----
  { id: 'C1 늦은 시간', group: 'current_turn', transcript: '벌써 22시 36분이네. 이제 잘 시간이 되어가고 있어.', memories: [], mustKeep: [/22|10시|열시|시간/] },
  { id: 'C2 비', group: 'current_turn', transcript: '오늘 비 온다.', memories: [] },
  { id: 'C3 배고픔', group: 'current_turn', transcript: '배고프다.', memories: [] },
  { id: 'C4 청소함', group: 'current_turn', transcript: '오늘 청소했어.', memories: [] },
  { id: 'C5 고양이 털 청소', group: 'current_turn', transcript: '고양이 털 때문에 청소해도 또 쌓여.', memories: [] },
  { id: 'C6 친구 퇴사', group: 'current_turn', transcript: '친구가 갑자기 퇴사했어.', memories: [] },
  { id: 'C7 17만원', group: 'current_turn', transcript: '나 17만원 썼어.', memories: [], mustKeep: [/17/] },

  // ---- Memory connection (기억 후보를 직접 주입) ----
  {
    id: 'M1 퇴사↔제주도',
    group: 'memory',
    transcript: '나 진짜 회사 그만두고 싶다.',
    memories: [memoryFixture(900101, '퇴사하면 제주도에서 한 달 살아보고 싶다', '퇴사하면 제주도 한 달 살아보고 싶다', '제주도 한 달 살기')],
  },
  {
    id: 'M2 식물',
    group: 'memory',
    transcript: '요즘 식물 키우는 게 재밌어.',
    memories: [memoryFixture(900102, '식물을 좀 제대로 키워보고 싶다', '식물을 좀 제대로 키워보고 싶다', '식물 키우기')],
  },

  // ---- 기존 V18/V21 세트 (원문 그대로) ----
  { id: 'R1 소파', group: 'regression_v18', transcript: '고양이가 소파를 다 긁어놨어.', memories: [] },
  { id: 'R2 잠', group: 'regression_v18', transcript: '고양이 때문에 잠을 못 잤어.', memories: [] },
  { id: 'R3 털 날림', group: 'regression_v18', transcript: '고양이 털도 너무 많이 날려서 방 청소해야 할 것 같아.', memories: [] },
  { id: 'R4 닭도리탕', group: 'regression_v18', transcript: '닭도리탕이랑 배랑 여러가지 음식을 먹고 있어.', memories: [], mustKeep: [/닭도리탕/] },
  { id: 'R5 항공권', group: 'regression_v18', transcript: '지난주에 제주도 항공권을 17만원에 봤어.', memories: [], mustKeep: [/17/, /항공권/] },
  { id: 'R6 친구 그만뒀대', group: 'regression_v18', transcript: '친구가 갑자기 회사를 그만뒀대.', memories: [] },
  { id: 'R7 빡빡', group: 'regression_v18', transcript: '어제 친구가 갑자기 머리를 빡빡 밀고 왔어.', memories: [] },
  { id: 'R8 발표 3번', group: 'regression_v18', transcript: '회사에서 발표를 3번이나 다시 했어.', memories: [], mustKeep: [/3|세/, /발표/] },
  { id: 'R9 또 미뤘어', group: 'regression_v18', transcript: '처음에는 괜찮았는데 결국 또 미뤘어.', memories: [] },

  // ---- answer 경로 회귀 (질문/의견/알림 요청 — 이후 단계에서 망가지지 않는지 보는 기준선) ----
  {
    id: 'Q1 여행지 질문',
    group: 'answer_regression',
    transcript:
      '다음주 연휴니까 내가 지금 전주에 살고 있으니까 쉽게 가기 어려운 강원도 쪽을 가보는 것도 방법일 것 같고 아니면 리프레쉬를 할 겸 중국 선전 3박 4일도 나쁘지 않을 것 같고 일본도 괜찮은데 일본은 연휴 때 비행기값이 너무 비싸고 아무튼 그렇다고 제주도 가기도 싫고 어디 가야 되냐',
    memories: [],
  },
  {
    id: 'Q2 의견 요청',
    group: 'answer_regression',
    transcript: '유명하다고 해서 점 한번 보러 가고 싶은데 20만 원이나 한대. 너무 비싼 것 같아. 요즘은 GPT로도 많이 본다더라. 너라면 어떻게 생각해?',
    memories: [],
  },
  { id: 'Q3 알림 요청', group: 'answer_regression', transcript: '토요일 아침에 갈 건데 그때 알려줘.', memories: [] },
];

// ==================================================================================================
// 자동 힌트 (판정이 아니다 — 사람 평가를 빠르게 하기 위한 표시)
// ==================================================================================================
const sentencesOf = (t: string) => t.split(/(?<=[.!?？~…])\s*/).map((s) => s.trim()).filter(Boolean);
const normText = (t: string) => t.replace(/[\s.,!?？~…"'“”‘’ㅋㅎㅠㅜ]/g, '');
function coverOf(part: string, src: string): number {
  const a = normText(part);
  const b = normText(src);
  if (a.length < 2) return 0;
  let hit = 0;
  for (let i = 0; i < a.length - 1; i++) if (b.includes(a.slice(i, i + 2))) hit++;
  return Math.round((hit / (a.length - 1)) * 100) / 100;
}

// 재진술(paraphrase) 힌트: 응답에서 흔한 어미·조사·감탄을 걷어낸 뒤, 원문에 없는 "새 음절"이 몇 개인지 센다.
// "오늘 비가 오는구나" ← "오늘 비 온다" → 새 음절 0개(재진술) / "우산 챙겨야겠네" → 새 음절 다수(반응 가능성).
// 2-gram 겹침만으로는 "비 온다 → 비가 오는구나" 같은 활용형 재진술을 못 잡아서 추가한 보조 지표다.
const ENDING_STRIP_RE =
  /(했구나|였구나|는구나|구나|었네|았네|겠네|네요|이네|네|다니|라니|이라니|했어|였어|어요|아요|이야|야|지만|는데|은데|거든|잖아|다는|라는|겠다|구만|군)(?=[\s.,!?？~…]|$)/g;
const PARTICLE_STRIP_RE = /(이나|이랑|에서|으로|까지|부터|한테|에게|이|가|은|는|을|를|에|도|만|의|로|랑|와|과)(?=[\s.,!?？~…]|$)/g;
function syllables(t: string): string[] {
  return Array.from(t.replace(/[^가-힣0-9A-Za-z]/g, ''));
}
function novelSyllableCount(response: string, transcript: string): number {
  const src = new Set(syllables(transcript));
  const stripped = response.replace(/[ㅋㅎㅠㅜ]+/g, ' ').replace(ENDING_STRIP_RE, '').replace(PARTICLE_STRIP_RE, '');
  return syllables(stripped).filter((ch) => !src.has(ch)).length;
}

const WH_RE = /(왜|뭐|뭘|뭔|무슨|무엇|웬|어땠|어떻게|어떤|어쩌다|어디|언제|누구|누가|얼마|몇|어느)/;
const CURIOUS_RE = /(궁금|알고 싶|(했|였|인|된|는|던|은|할)지\s*(궁금|모르겠))/;
const CAUSAL_RE = /((일|사정|사연|이유|계기|까닭|문제|결심|결단|변화)(이|가|을|를)?\s*(있었|있|생겼|생긴|났|내렸|한)[^.!?]*?(나 보|나봐|것 같|모양|을까|ㄹ까|까\?|까$|던 걸까|었을까))|무슨\s*일|때문(인가|이었나|일까)|(해서|라서|어서|아서)\s*그런(가|지|거)/;
const EMOTION_ATTR_RE = /((너|니|네)(도|가|는)?\s*[^.!?]{0,12}(걱정|속상|서운|우울|스트레스|힘들|짜증|불안|외롭|섭섭)[^.!?]{0,6}(겠|었겠|았겠|을 것|ㄹ 것))|(걱정됐겠|속상했겠|서운했겠|우울하겠|스트레스\s*받겠|많이 힘들었겠)/;

type QuestionKindHint = 'none' | 'information_question_hint' | 'rhetorical_reaction_hint' | 'unclear';
function questionKindHint(response: string, transcript: string): { kind: QuestionKindHint; why: string[] } {
  const why: string[] = [];
  const qSentences = sentencesOf(response).filter((s) => /[?？]/.test(s));
  const curious = CURIOUS_RE.test(response);
  if (qSentences.length === 0 && !curious) return { kind: 'none', why };
  if (curious) why.push('궁금/간접질문');
  let info = curious;
  let rhetorical = false;
  for (const s of qSentences) {
    if (WH_RE.test(s)) {
      info = true;
      why.push(`의문사: "${s}"`);
    } else if (coverOf(s, transcript) >= 0.5 || /(아직도|진짜|정말|벌써|다고\s*[?？]|라고\s*[?？]|이나\s*[?？]|는데\s*[?？])/.test(s)) {
      rhetorical = true;
      why.push(`반문 후보: "${s}"`);
    } else {
      why.push(`판단 보류: "${s}"`);
    }
  }
  if (info) return { kind: 'information_question_hint', why };
  if (rhetorical) return { kind: 'rhetorical_reaction_hint', why };
  return { kind: 'unclear', why };
}

function autoHints(c: EvalCase, response: string) {
  const sents = sentencesOf(response);
  const covers = sents.map((s) => coverOf(s, c.transcript));
  const q = questionKindHint(response, c.transcript);
  const parrotSents = sents.filter(
    (s, i) => !/[?？]\s*[ㅋㅎ\s]*$/.test(s) && (covers[i] >= 0.6 || novelSyllableCount(s, c.transcript) <= 2)
  );
  return {
    sentence_cover: covers, // 문장별 원문 2-gram 겹침 비율 (1에 가까울수록 원문 반복)
    max_sentence_cover: covers.length ? Math.max(...covers) : 0,
    novel_syllables: novelSyllableCount(response, c.transcript), // 어미·조사를 걷어낸 뒤 원문에 없는 음절 수
    // 문장별 재진술 힌트: 원문 2-gram과 많이 겹치거나(≥0.6) 새로 얹은 음절이 거의 없음(≤2).
    // 물음표로 끝나는 반문("헐, 갑자기 퇴사했다고?")은 원문을 되받는 게 정상 형태라 제외한다.
    parroting_sentences: parrotSents,
    parroting_hint: parrotSents.length > 0 && parrotSents.length === sents.length, // 모든 문장이 재진술
    partial_parroting_hint: parrotSents.length > 0 && parrotSents.length < sents.length, // 일부 문장만 재진술 (예: 재진술 + 질문)
    question_mark_count: (response.match(/[?？]/g) ?? []).length,
    question_kind_hint: q.kind,
    question_kind_why: q.why,
    causal_hint: CAUSAL_RE.test(response),
    emotion_attribution_hint: EMOTION_ATTR_RE.test(response),
    anchor_preserved_hint: c.mustKeep ? c.mustKeep.every((re) => re.test(response)) : null,
    ends_with_assessment_ne_hint: /(네|겠다|겠네)[.!~…\sㅋㅎ]*$/.test(response) && !/[?？]/.test(response), // "~네/~겠다"로 끝나는 평가형
  };
}

// 사람 평가 칸 — 자동으로 채우지 않는다.
// 권장 기입값: Y / N / ? (애매) — naturalness·참견이다움은 1~5점.
const HUMAN_FIELDS = [
  'parroting',
  'reaction_present',
  'grounding',
  'unsupported_causality',
  'unsupported_emotion_attribution',
  'information_question',
  'naturalness_1to5',
  'chamgyeoni_ness_1to5',
  'human_note',
] as const;

// ==================================================================================================
// 실행
// ==================================================================================================
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY가 필요합니다. (예: $env:OPENAI_API_KEY = Read-Host "key")');
    process.exit(1);
  }
  const runs = Math.max(1, Number(process.argv[2] ?? 3) || 3);
  const { analyzeTranscriptOnly } = await import('../lib/analysis');
  const { generateResponseCore } = await import('../lib/responseEngine');

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonFile = `eval-reaction-baseline-${stamp}.json`;
  const csvFile = `eval-reaction-baseline-${stamp}.csv`;
  const rows: any[] = [];

  console.log(`Reaction-First Step 0 baseline · 케이스 ${CASES.length}개 × ${runs}회 = ${CASES.length * runs}건`);
  console.log('(제품 코드 무수정 · DB 조회 없음 · 관계단계 3 / 최근 대화 없음 / 전화 불가 고정)\n');

  for (const c of CASES) {
    for (let run = 1; run <= runs; run++) {
      const started = Date.now();
      try {
        const analysis: any = await analyzeTranscriptOnly(c.transcript);
        const r: any = await generateResponseCore({
          transcript: c.transcript,
          analysis,
          memoryCandidates: [],
          existingCommitments: [],
          relevantMemoryUnits: c.memories,
          relevantInsights: [],
          initialTopic: undefined,
          relationshipLevel: 3,
          nickname: null,
          callAllowed: false,
          recentTurns: [],
        });
        const opp = r.conversation_opportunity ?? {};
        const row = {
          case_id: c.id,
          group: c.group,
          run,
          transcript: c.transcript,
          injected_memory: c.memories.map((m) => m.raw_quote ?? m.content),
          // ---- 요청 수집 항목 ----
          generated_response: r.response,
          // 현재 엔진에는 모드 구분이 없다(단일 answer-first 경로). 이후 분기 기준(intentNeedsAnswer)으로 "들어갈 모드"만 기록한다.
          response_mode: 'single_path_baseline',
          response_mode_would_be: intentNeedsAnswer(analysis?.utterance_intent ?? null, analysis?.user_question ?? null) ? 'answer' : 'reaction',
          // 현재 엔진에는 reaction_target이 없다. 가장 가까운 기존 필드(conversation_opportunity)를 대신 기록한다.
          reaction_target: null,
          opportunity_source: opp.source ?? null,
          opportunity_type: opp.type ?? null,
          opportunity_strength: opp.strength ?? null,
          anchor_quote: opp.anchor_quote ?? null,
          anchor_fact: opp.anchor_fact ?? null,
          question_target: opp.question_target ?? null,
          question_present: r.question_present,
          memory_relevance: r.memory_relevance ?? [],
          memory_used: r.memory_used,
          memory_unit_id_used: r.memory_unit_id_used,
          validation_passed: r.validation_passed,
          validation_failure_reason: r.validation_failure_reason,
          regeneration_count: r.regeneration_count,
          repaired: r.repaired,
          fallback_used: r.fallback_used,
          fallback_kind: r.fallback_kind,
          // ---- 참고 ----
          utterance_intent: analysis?.utterance_intent ?? null,
          user_question: analysis?.user_question ?? null,
          analysis_emotion: analysis?.emotion ?? null,
          response_strategy: r.response_strategy,
          interference_purpose: r.interference_purpose,
          first_generation_response: r.initial_trace?.raw?.response ?? null,
          first_generation_failure: r.initial_trace?.validation?.failure_reason ?? null,
          latency_ms: Date.now() - started,
          auto_hints: autoHints(c, r.response ?? ''),
          // ---- 사람 평가 (비워 둠) ----
          human: Object.fromEntries(HUMAN_FIELDS.map((f) => [f, ''])),
        };
        rows.push(row);
        const h = row.auto_hints;
        const flags = [
          r.fallback_used ? `FALLBACK(${r.fallback_kind})` : '',
          r.regeneration_count ? `regen${r.regeneration_count}` : '',
          r.repaired ? 'repair' : '',
          h.parroting_hint ? 'parrot?' : h.partial_parroting_hint ? 'part-parrot?' : '',
          h.question_kind_hint !== 'none' ? h.question_kind_hint.replace('_hint', '') : '',
          h.causal_hint ? 'causal?' : '',
          h.emotion_attribution_hint ? 'emotion?' : '',
          h.anchor_preserved_hint === false ? 'anchor-lost?' : '',
          r.memory_unit_id_used ? `mem#${r.memory_unit_id_used}` : '',
        ].filter(Boolean);
        console.log(`  ${c.id} #${run} [${row.utterance_intent}→${row.response_mode_would_be}] "${r.response}"${flags.length ? `  {${flags.join(' ')}}` : ''}`);
      } catch (e: any) {
        rows.push({ case_id: c.id, group: c.group, run, transcript: c.transcript, error: e?.message ?? String(e) });
        console.log(`  ${c.id} #${run} 실패: ${e?.message}`);
      }
      writeFileSync(jsonFile, JSON.stringify(rows, null, 2));
    }
  }

  // ---- 사람 평가용 CSV (엑셀에서 한글이 깨지지 않도록 BOM) ----
  const cols = [
    'case_id', 'group', 'run', 'transcript', 'injected_memory', 'generated_response',
    'response_mode_would_be', 'utterance_intent', 'opportunity_source', 'opportunity_type', 'anchor_quote', 'question_target',
    'question_present', 'memory_relevance', 'memory_unit_id_used', 'validation_passed', 'validation_failure_reason',
    'regeneration_count', 'repaired', 'fallback_used', 'fallback_kind', 'first_generation_response',
    'hint_max_cover', 'hint_novel_syllables', 'hint_parroting', 'hint_partial_parroting', 'hint_question_kind', 'hint_causal', 'hint_emotion_attr', 'hint_anchor_preserved',
    ...HUMAN_FIELDS,
  ];
  const lines = [cols.join(',')];
  for (const r of rows) {
    if (r.error) {
      lines.push([r.case_id, r.group, r.run, r.transcript, '', `ERROR: ${r.error}`].map(csvCell).join(','));
      continue;
    }
    const h = r.auto_hints;
    const vals: Record<string, unknown> = {
      ...r,
      hint_max_cover: h.max_sentence_cover,
      hint_novel_syllables: h.novel_syllables,
      hint_parroting: h.parroting_hint,
      hint_partial_parroting: h.partial_parroting_hint,
      hint_question_kind: h.question_kind_hint,
      hint_causal: h.causal_hint,
      hint_emotion_attr: h.emotion_attribution_hint,
      hint_anchor_preserved: h.anchor_preserved_hint,
      ...r.human,
    };
    lines.push(cols.map((k) => csvCell(vals[k])).join(','));
  }
  writeFileSync(csvFile, '\uFEFF' + lines.join('\r\n'));

  // ---- 콘솔 요약 ----
  const ok = rows.filter((r) => !r.error);
  const cnt = (f: (r: any) => boolean, rs = ok) => rs.filter(f).length;
  console.log(`\n==== 요약 · 유효 ${ok.length}/${rows.length} · 429 대기 ${rateLimitWaits}번 ====`);
  console.log('| group | n | fallback | regen | repair | parrot? | part-parrot? | info-Q? | rhetorical? | causal? | emotion? | anchor-lost? |');
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const g of ['current_turn', 'memory', 'regression_v18', 'answer_regression'] as Group[]) {
    const rs = ok.filter((r) => r.group === g);
    console.log(
      `| ${g} | ${rs.length} | ${cnt((r) => r.fallback_used, rs)} | ${cnt((r) => r.regeneration_count > 0, rs)} | ${cnt((r) => r.repaired, rs)} | ${cnt((r) => r.auto_hints.parroting_hint, rs)} | ${cnt((r) => r.auto_hints.partial_parroting_hint, rs)} | ${cnt((r) => r.auto_hints.question_kind_hint === 'information_question_hint', rs)} | ${cnt((r) => r.auto_hints.question_kind_hint === 'rhetorical_reaction_hint', rs)} | ${cnt((r) => r.auto_hints.causal_hint, rs)} | ${cnt((r) => r.auto_hints.emotion_attribution_hint, rs)} | ${cnt((r) => r.auto_hints.anchor_preserved_hint === false, rs)} |`
    );
  }
  const mem = ok.filter((r) => r.group === 'memory');
  console.log(`\n기억 케이스: memory_relevance YES ${cnt((r) => (r.memory_relevance ?? []).some((m: any) => m.relevance === 'YES'), mem)}/${mem.length} · 실제 사용(memory_unit_id_used) ${cnt((r) => !!r.memory_unit_id_used, mem)}/${mem.length}`);
  const lat = ok.map((r) => r.latency_ms).sort((a, b) => a - b);
  if (lat.length) console.log(`지연(분석+생성) 중앙값 ${lat[Math.floor(lat.length / 2)]}ms · 최대 ${lat[lat.length - 1]}ms`);
  console.log(`\n저장: ${jsonFile}\n사람 평가용: ${csvFile}  (human 칸: Y/N/? · naturalness/참견이다움 1~5)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
