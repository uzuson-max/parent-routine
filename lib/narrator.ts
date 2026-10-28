// lib/narrator.ts
// ============================================================================
// 참견이 내레이터 엔진 (2026-10-28)
// ----------------------------------------------------------------------------
// 참견이는 이제 "주인공(사용자)의 이야기를 해설하는 수달 내레이터"다.
//   - 사용자가 한 말을 받아적지 않고, 3인칭 무협지풍 해설 한두 줄로 참견한다.
//     "이번 주 운동 3번 간다" → "주인공은 단전에 힘을 모아 선언했다. 이번 주, 세 번이다."
//   - 다짐(vow)은 기한과 함께 장부에 올라가고, 중간중간·기한 끝에 해설로 찔러본다.
//
// 저장은 기존 voice_entries.response jsonb 안에만 한다(스키마 변경 없음):
//   response.response  — 화면에 나간 해설 한 줄(예전 응답 엔진과 같은 자리)
//   response.vow       — 이번 발화에서 새로 선언한 다짐 { what, target, deadline_label, deadline_at }
//   response.progress  — 이번 발화가 기존 다짐을 실행한 보고면 { vow_id, delta }
//   response.vow_closed — (다짐을 선언한 행에만) 결말 해설을 이미 했으면 true
//
// 예전 응답 엔진(lib/responseEngine.ts)은 지우지 않았다. 업로드 라우트가 이 파일의
// generateNarration을 대신 부를 뿐이다(같은 인자, 같은 반환 모양).
// ============================================================================
import { supabase } from '@/lib/supabase';
import type { RelevantMemoryUnit } from '@/lib/memoryRetrieval';
import type { RelevantInsight } from '@/lib/insightEngine';
import type { ResponseResult } from '@/lib/response/responsetypes';

export type NarratorExpression = 'stare' | 'smug' | 'wow' | 'hmm' | 'soft';
const EXPRESSIONS: NarratorExpression[] = ['stare', 'smug', 'wow', 'hmm', 'soft'];

interface EntryRow {
  id: string;
  transcript: string | null;
  response: any;
  created_at: string;
}

export interface Vow {
  id: string; // 다짐을 선언한 voice_entries.id
  what: string;
  target: number | null;
  deadline_label: string | null;
  deadline_at: string | null;
  created_at: string;
  done: number;
  closed: boolean;
}

const DAY = 24 * 60 * 60 * 1000;
// 기한 없는 다짐은 2주 지나면 장부에서 내린다.
const NO_DEADLINE_TTL_DAYS = 14;

// ---------------------------------------------------------------------------
// 시간 — 한국 시간 기준으로 LLM에 알려준다(기한 계산용).
// ---------------------------------------------------------------------------
function kstNowLabel(now = new Date()): string {
  const k = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const p = (n: number) => String(n).padStart(2, '0');
  return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())} (${days[k.getUTCDay()]}) ${p(k.getUTCHours())}:${p(k.getUTCMinutes())} KST`;
}

function kstDayKey(iso: string): number {
  return Math.floor((new Date(iso).getTime() + 9 * 60 * 60 * 1000) / DAY);
}

function agoLabel(iso: string, now = Date.now()): string {
  const min = Math.round((now - new Date(iso).getTime()) / 60000);
  if (min < 60) return '방금';
  const h = Math.round(min / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.round(h / 24);
  return d === 1 ? '어제' : `${d}일 전`;
}

function leftLabel(iso: string, now = Date.now()): string {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return '기한 지남';
  const h = Math.round(ms / (60 * 60 * 1000));
  if (h < 24) return `${h}시간 남음`;
  return `${Math.round(h / 24)}일 남음`;
}

// ---------------------------------------------------------------------------
// 데이터
// ---------------------------------------------------------------------------
async function fetchRows(userId: string, limit = 80, excludeId?: string): Promise<EntryRow[]> {
  const { data, error } = await supabase
    .from('voice_entries')
    .select('id, transcript, response, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[narrator] voice_entries 조회 실패:', error.message);
    return [];
  }
  return ((data ?? []) as EntryRow[]).filter(
    (r) => String(r.id) !== String(excludeId ?? '') && r.transcript && r.transcript !== '(음성 변환 실패)'
  );
}

export async function fetchFirstEntryAt(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('voice_entries')
    .select('created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as any)?.created_at ?? null;
}

// 제 N장 — 첫 녹음한 날이 1장. 기록이 없으면 1장.
export function chapterOf(firstAt: string | null, now = new Date()): number {
  if (!firstAt) return 1;
  return Math.max(1, kstDayKey(now.toISOString()) - kstDayKey(firstAt) + 1);
}

// 다짐 장부 — 행들의 response.vow / response.progress로 만든다.
export function buildLedger(rows: EntryRow[], now = Date.now()): Vow[] {
  const vows = new Map<string, Vow>();
  for (const r of rows) {
    const v = r.response?.vow;
    if (v && typeof v.what === 'string' && v.what.trim()) {
      vows.set(String(r.id), {
        id: String(r.id),
        what: v.what.trim(),
        target: typeof v.target === 'number' && v.target > 0 ? Math.round(v.target) : null,
        deadline_label: typeof v.deadline_label === 'string' ? v.deadline_label : null,
        deadline_at: typeof v.deadline_at === 'string' && !isNaN(Date.parse(v.deadline_at)) ? v.deadline_at : null,
        created_at: r.created_at,
        done: 0,
        closed: r.response?.vow_closed === true,
      });
    }
  }
  for (const r of rows) {
    const p = r.response?.progress;
    if (p && vows.has(String(p.vow_id))) {
      const delta = typeof p.delta === 'number' ? Math.max(0, Math.min(5, Math.round(p.delta))) : 1;
      vows.get(String(p.vow_id))!.done += delta;
    }
  }
  return Array.from(vows.values()).filter((v) => {
    if (v.closed) return false;
    if (!v.deadline_at) return now - new Date(v.created_at).getTime() < NO_DEADLINE_TTL_DAYS * DAY;
    return true; // 기한 지난 것도 결말 해설 전까지는 남겨둔다
  });
}

function vowLine(v: Vow, now = Date.now()): string {
  const count = v.target ? `${v.done}/${v.target}회` : `실행 보고 ${v.done}번`;
  const deadline = v.deadline_at ? `${v.deadline_label ?? '기한'} (${leftLabel(v.deadline_at, now)})` : '기한 없음';
  return `- vow_id=${v.id} | "${v.what}" | ${count} | ${deadline} | ${agoLabel(v.created_at, now)} 선언`;
}

// ---------------------------------------------------------------------------
// 프롬프트
// ---------------------------------------------------------------------------
const NARRATOR_RULES = `너는 "참견이"다. 수달이고, 한 사람(주인공)의 하루를 무협지 내레이터처럼 해설한다.
주인공이 한 말을 그대로 받아적거나 되풀이하지 않는다. 그 말을 "이야기 속 한 장면"으로 바꿔 해설한다.
이 해설이 곧 참견이다 — 사소한 일상을 엄청 진지하게 서술해서 피식 웃기게, 가끔은 찔리게, 아주 가끔은 뭉클하게.

[말투 규칙]
- 항상 3인칭. 사용자는 "주인공". 너/니/당신 같은 2인칭 금지. 반말 대화체 금지("~했어?", "~하자" 금지).
- 서술체: "~했다", "~이다", "~었다". 짧게 끊는다. 한두 문장, 최대 60자 안팎.
- 기본은 건조하고 담담하게. 선언·결말·기억 회수 같은 결정적인 순간에만 무협으로 과장한다
  (단전, 강호, 봉인, 내공, 비급, 일전, 결전, 소문이 돌았다, 수련, 고수, 하산 등). 매번 쓰면 질린다.
- 시점 표현을 섞으면 좋다: "그날 밤", "사흘째", "약속까지 이틀", "그때 주인공은 몰랐다".
- 감정을 지어내지 않는다(말하지 않은 슬픔·의도 금지). 조언·해결책·정보 제공 금지. 질문은 거의 하지 않는다.
- 이모지, 따옴표 남발, 해시태그 금지.

[참견하는 것 — 이 셋만]
1) 다짐(vow): "~할 거야/~안 할 거야/~해야지"처럼 행동 의지를 밝히면 선언 장면으로 해설하고 vow에 기록한다.
   - 횟수가 있으면 target, 기한이 있으면 deadline_label(사용자 표현)과 deadline_at(ISO, +09:00)을 채운다.
   - 기한을 안 말했으면 deadline_at=null로 두고, 해설로 슬쩍 찌른다: "주인공은 기한을 정하지 않았다. 수상하다."
   - "오늘 ~할 거야"면 오늘 23:59가 기한, "이번 주"면 이번 주 일요일 23:59.
2) 실행 보고(progress): 장부에 있는 다짐을 실제로 했다고 말하면 progress에 vow_id와 delta(보통 1)를 넣고,
   남은 횟수·남은 기간을 담아 해설한다. 안 했다/미뤘다고 하면 progress는 null, 해설로 찌른다.
3) 그 외 일상: 장면 하나를 골라 해설한다. 기억 후보 중 지금 말과 진짜 이어지는 게 있으면
   "그때 주인공은 몰랐다" 식으로 복선 회수하듯 꺼낸다(memory_unit_id_used). 억지 연결이면 쓰지 않는다.

[하지 않는 것]
- 검색·계산·코딩·지식 질문 등 일반 AI 일: 해설로 거절한다.
  예) "주인공은 참견이에게 엑셀 함수를 물었다. 참견이는 수달이다."
- 외모·건강·가족 비하, 자해 관련 조롱 금지. 주인공이 정말 힘들어 보이면 놀리지 말고 담담하고 따뜻하게 서술한다.

[예시]
"이번 주 운동 3번 간다" → 주인공은 단전에 힘을 모아 선언했다. 이번 주, 세 번이다.
"다이어트 할 거야" → 주인공은 다이어트를 선언했다. 기한은 정하지 않았다. 수상하다.
"오늘도 운동 못 갔어" (장부 0/3, 이틀 남음) → 약속까지 이틀. 주인공은 아직 0회다.
"운동 다녀왔다" (장부 2/3) → 주인공은 마침내 두 번째 수련을 마쳤다. 한 번 남았다.
"또 야식 먹었어" → 그날 밤, 강호에 소문이 돌았다. 주인공이 또 야식을 먹었다고.
"회의만 세 번 했어" → 주인공은 오늘 세 번의 회의를 견뎠다. 아무것도 결정되지 않았다.
"그냥 피곤해" → 주인공은 오늘 아무것도 하고 싶지 않았다. 그것도 하루다.
(기억: 3주 전 "이사 가면 고양이 키우고 싶다") "이사 날짜 잡혔어" → 그때 주인공은 몰랐다. 고양이를 말하던 그 집이 정말 올 줄은.

[표정 expression] stare(기본·의심) / smug(놀릴 때·성공) / wow(놀랄 일) / hmm(기한 없음·애매) / soft(뭉클·힘든 날·기억 회수)

[출력 — JSON 하나만]
{"narration": "...", "expression": "stare", "vow": null 또는 {"what": "운동 가기", "target": 3, "deadline_label": "이번 주", "deadline_at": "2026-11-01T23:59:00+09:00"},
 "progress": null 또는 {"vow_id": "장부의 vow_id 그대로", "delta": 1}, "memory_unit_id_used": null 또는 기억 id(숫자)}`;

async function callNarratorGPT(system: string, user: string, temperature = 0.85): Promise<any> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      temperature,
      max_tokens: 300,
    }),
  });
  if (!res.ok) throw new Error('narrator 호출 실패: ' + (await res.text()));
  const json = await res.json();
  return JSON.parse(json.choices?.[0]?.message?.content || '{}');
}

// ---------------------------------------------------------------------------
// 정리 — LLM 출력이 이상해도 화면이 깨지지 않게
// ---------------------------------------------------------------------------
const FALLBACK_LINES = [
  '주인공은 무언가를 말했다. 참견이는 일단 들어두었다.',
  '주인공의 하루가 또 한 장 넘어갔다.',
  '참견이는 조개를 내려놓고 귀를 기울였다. 이야기는 계속된다.',
];

function cleanNarration(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  let t = s.replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  // 해설은 짧아야 읽힌다 — 항상 앞에서 두 문장까지만, 그래도 길면 한 문장만.
  const parts = t.split(/(?<=[.!?。…])\s+/);
  t = parts.slice(0, 2).join(' ');
  if (t.length > 80 && parts.length > 1) t = parts[0];
  if (t.length > 90) t = t.slice(0, 88) + '…';
  return t;
}

function cleanExpression(e: unknown): NarratorExpression {
  return EXPRESSIONS.includes(e as NarratorExpression) ? (e as NarratorExpression) : 'stare';
}

type NewVow = { what: string; target: number | null; deadline_label: string | null; deadline_at: string | null };

function cleanVow(v: any): NewVow | null {
  if (!v || typeof v.what !== 'string' || !v.what.trim()) return null;
  const deadlineOk = typeof v.deadline_at === 'string' && !isNaN(Date.parse(v.deadline_at)) && Date.parse(v.deadline_at) > Date.now() - 60 * 60 * 1000;
  return {
    what: v.what.trim().slice(0, 60),
    target: typeof v.target === 'number' && v.target > 0 && v.target < 100 ? Math.round(v.target) : null,
    deadline_label: deadlineOk && typeof v.deadline_label === 'string' ? v.deadline_label.slice(0, 30) : null,
    deadline_at: deadlineOk ? v.deadline_at : null,
  };
}

// 예전 ResponseResult 모양을 그대로 채운다 — 저장/전화 판단 코드가 이 모양을 읽는다.
function toResponseResult(narration: string, extra: Record<string, any>, fallback: boolean): ResponseResult {
  return {
    response_strategy: 'observe' as any,
    interference_purpose: 'silence' as any,
    tone: 'narrator',
    humor_opportunity: 'medium',
    memory_used: !!extra.memory_unit_id_used,
    memory_reference: null,
    memory_unit_id_used: extra.memory_unit_id_used ?? null,
    insight_id_used: null,
    memory_relevance: [],
    conversation_opportunity: { source: 'none', type: 'none', strength: 'NONE' } as any,
    question_present: narration.includes('?'),
    channel: 'text', // 내레이터는 전화하지 않는다
    response: narration,
    relationship_level: 1,
    validation_passed: !fallback,
    validation_failure_reason: fallback ? 'narrator_fallback' : null,
    regeneration_count: 0,
    closes_conversation: false,
    repeated_memory_detected: false,
    fallback_used: fallback,
    fallback_kind: fallback ? 'error' : null,
    ...extra,
  } as ResponseResult;
}

// ---------------------------------------------------------------------------
// 1) 녹음/글에 대한 해설 — app/api/voice/upload가 generateResponse 대신 부른다(인자 동일).
// ---------------------------------------------------------------------------
export async function generateNarration(
  transcript: string,
  _analysis: any,
  userId: string,
  entryId: string,
  _memoryCandidates: { memory_type: string; content: string }[] = [],
  _existingCommitments: { id: string; commitment: string }[] = [],
  relevantMemoryUnits: RelevantMemoryUnit[] = [],
  _relevantInsights: RelevantInsight[] = [],
  initialTopic?: string
): Promise<ResponseResult> {
  const now = Date.now();
  let rows: EntryRow[] = [];
  try {
    rows = await fetchRows(userId, 80, entryId);
  } catch {
    rows = [];
  }
  const ledger = buildLedger(rows, now);
  const recent = rows.slice(0, 5).reverse();
  const memories = relevantMemoryUnits
    .filter((m) => now - new Date(m.created_at).getTime() > 12 * 60 * 60 * 1000)
    .slice(0, 3);

  const user = [
    `[지금] ${kstNowLabel(new Date(now))}`,
    `[다짐 장부]\n${ledger.length ? ledger.map((v) => vowLine(v, now)).join('\n') : '(없음)'}`,
    `[최근 장면 — 오래된 것부터]\n${
      recent.length
        ? recent.map((r) => `- ${agoLabel(r.created_at, now)} 주인공: "${String(r.transcript).slice(0, 120)}" → 해설: "${r.response?.response ?? ''}"`).join('\n')
        : '(없음 — 이야기의 시작)'
    }`,
    `[기억 후보 — 진짜 이어질 때만]\n${
      memories.length
        ? memories.map((m) => `- id=${m.id} (${agoLabel(m.created_at, now)}) "${String(m.raw_quote || m.content).slice(0, 120)}"`).join('\n')
        : '(없음)'
    }`,
    initialTopic ? `[방금 참견이가 먼저 한 해설 — 주인공은 이 말에 대답했다]\n"${initialTopic}"` : '',
    `[주인공이 방금 한 말]\n"${transcript}"`,
    '해설 JSON을 써라. 최근 장면의 해설과 같은 문장·같은 패턴을 반복하지 마라.',
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const out = await callNarratorGPT(NARRATOR_RULES, user);
    const narration = cleanNarration(out.narration);
    if (!narration) throw new Error('빈 해설');
    const vow = cleanVow(out.vow);
    const progressOk = out.progress && ledger.some((v) => v.id === String(out.progress.vow_id));
    const progress = progressOk
      ? { vow_id: String(out.progress.vow_id), delta: typeof out.progress.delta === 'number' ? Math.max(1, Math.min(5, Math.round(out.progress.delta))) : 1 }
      : null;
    const memId = typeof out.memory_unit_id_used === 'number' && memories.some((m) => m.id === out.memory_unit_id_used) ? out.memory_unit_id_used : null;
    return toResponseResult(
      narration,
      { expression: cleanExpression(out.expression), vow, progress, memory_unit_id_used: memId, narrator: true },
      false
    );
  } catch (err: any) {
    console.error('[narrator] 해설 생성 실패:', err?.message);
    const line = FALLBACK_LINES[Math.floor(Math.random() * FALLBACK_LINES.length)];
    return toResponseResult(line, { expression: 'stare', vow: null, progress: null, memory_unit_id_used: null, narrator: true }, true);
  }
}

// ---------------------------------------------------------------------------
// 2) 앱을 켰을 때 참견이가 먼저 하는 해설 — app/api/narrator/opening
// ---------------------------------------------------------------------------
export interface Opening {
  line: string;
  expression: NarratorExpression;
  chapter: number;
  recalled?: { quote: string; at: string } | null;
}

const FIRST_MEET: Opening[] = [
  { line: '주인공이 나타났다. 참견이는 아직 이 자에 대해 아무것도 모른다. 오늘 있었던 일부터 들어보기로 했다.', expression: 'stare', chapter: 1 },
];

const OPENING_RULES = `${NARRATOR_RULES}

[이번 호출은 다르다]
주인공이 방금 앱을 열었다. 주인공이 아직 아무 말도 안 했으니, 참견이가 먼저 해설 한두 줄로 말을 건다.
아래 [상황]에 맞춰 쓴다. vow와 progress는 항상 null. narration과 expression만 의미 있다.
- ending: 기한이 끝난 다짐의 결말을 해설한다(성공/실패를 횟수로 판단). 실패여도 비난 말고 웃기게.
- midway: 진행 중인 다짐을 중간 점검한다. 남은 기간과 횟수를 넣는다.
- recall: 며칠 전 주인공의 말을 복선처럼 다시 꺼낸다. "그때 주인공은 ~라고 했다" 식, 지금은 어떤지 궁금하게.
- collect: 이야기 초반(수집 기간). 오늘 있었던 일을 들려달라고 해설체로 유도한다. 마지막 장면을 살짝 이어받아도 좋다.
- greet: 그 외. 지난 장면을 이어받아 "다음 장"이 시작됐음을 해설한다.`;

export async function generateOpening(userId: string): Promise<Opening> {
  const now = Date.now();
  const [rows, firstAt] = await Promise.all([fetchRows(userId, 80), fetchFirstEntryAt(userId)]);
  const chapter = chapterOf(firstAt, new Date(now));
  if (rows.length === 0) return { ...FIRST_MEET[0], chapter };

  const ledger = buildLedger(rows, now);
  const ended = ledger.find((v) => v.deadline_at && new Date(v.deadline_at).getTime() < now);
  const midway = ledger
    .filter((v) => !v.deadline_at || new Date(v.deadline_at).getTime() >= now)
    .sort((a, b) => (a.deadline_at ? Date.parse(a.deadline_at) : Infinity) - (b.deadline_at ? Date.parse(b.deadline_at) : Infinity))[0];
  const recallRow = rows.find((r) => {
    const age = now - new Date(r.created_at).getTime();
    return age > 3 * DAY && age < 30 * DAY && String(r.transcript).length >= 15;
  });

  let situation: string;
  let detail: string;
  let recalled: Opening['recalled'] = null;
  if (ended) {
    situation = 'ending';
    detail = vowLine(ended, now);
  } else if (midway && Math.random() < 0.75) {
    situation = 'midway';
    detail = vowLine(midway, now);
  } else if (rows.length < 6) {
    situation = 'collect';
    detail = `이야기 ${rows.length}번째 장면까지 왔다. 마지막 장면(${agoLabel(rows[0].created_at, now)}): "${String(rows[0].transcript).slice(0, 100)}"`;
  } else if (recallRow && Math.random() < 0.6) {
    situation = 'recall';
    detail = `${agoLabel(recallRow.created_at, now)} 주인공의 말: "${String(recallRow.transcript).slice(0, 120)}"`;
    recalled = { quote: String(recallRow.transcript).slice(0, 140), at: recallRow.created_at };
  } else {
    situation = 'greet';
    detail = `마지막 장면(${agoLabel(rows[0].created_at, now)}): "${String(rows[0].transcript).slice(0, 100)}" → 해설: "${rows[0].response?.response ?? ''}"`;
  }

  const recentLines = rows
    .slice(0, 3)
    .map((r) => `- "${r.response?.response ?? ''}"`)
    .join('\n');
  const user = `[지금] ${kstNowLabel(new Date(now))} · 제${chapter}장\n[상황] ${situation}\n[내용]\n${detail}\n[최근 해설 — 반복 금지]\n${recentLines}\n\n해설 JSON을 써라.`;

  try {
    const out = await callNarratorGPT(OPENING_RULES, user, 0.9);
    const line = cleanNarration(out.narration);
    if (!line) throw new Error('빈 해설');
    // 결말은 한 번만 — 다짐을 선언한 행에 표시해서 장부에서 내린다.
    if (ended) await closeVow(ended.id);
    return { line, expression: cleanExpression(out.expression), chapter, recalled };
  } catch (err: any) {
    console.error('[narrator] 오프닝 생성 실패:', err?.message);
    return { line: `제${chapter}장. 주인공이 돌아왔다. 참견이는 조개를 내려놓았다.`, expression: 'stare', chapter };
  }
}

async function closeVow(entryId: string): Promise<void> {
  try {
    const { data } = await supabase.from('voice_entries').select('response').eq('id', entryId).maybeSingle();
    const response = (data as any)?.response;
    if (!response) return;
    await supabase
      .from('voice_entries')
      .update({ response: { ...response, vow_closed: true } })
      .eq('id', entryId);
  } catch (err: any) {
    console.error('[narrator] 다짐 결말 표시 실패:', err?.message);
  }
}
