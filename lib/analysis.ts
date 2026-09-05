

import { supabase } from '@/lib/supabase';

interface AnalysisResult {
  type: 'excuse' | 'contradiction' | 'repetition' | 'none';
  summary: string;
  goal: string | null;
  commitment: string | null;
  commitment_type: 'explicit' | 'inferred' | null;
  commitment_confidence: 'high' | 'medium' | 'low' | null;
  excuse: string | null;
  emotion: string | null;
  intervention_needed: boolean;
  intervention_reason: string | null;
  call_line: string;
  tone: 'playful' | 'firm';
  contradictions: string[];
  goal_matched: boolean;
  matched_commitment_id: string | null;
  new_commitments: string[];
  context_facts: string[];
  detected_pattern: string | null;
  fulfilled_commitments: string[];
  commitment_context_updates: { commitment_id: string; context: string }[];
  memory_candidates: { memory_type: MemoryType; content: string }[];
}

type MemoryType = 'interest' | 'project' | 'preference' | 'thought';
const MEMORY_TYPES: MemoryType[] = ['interest', 'project', 'preference', 'thought'];

const PERSONA_PROMPTS: Record<string, string> = {
  boss: `너는 팩폭형 꼰대 상사야. 반말 반, 존댓말 반 섞어서 권위적이지만 은근히 챙기는 티가 나게 말해. "김대리~" 같은 호칭은 쓰지 말고, 짧고 단호하게 몰아붙여.`,
  coach: `너는 냉정한 행동경제학 코치야. 감정 배제하고, 사용자의 자기합리화 패턴을 데이터/논리로 반박하듯 차갑게 짚어. "그건 핑계고 실제로는..." 같은 화법을 써.`,
  mom: `너는 잔소리 폭발 직전인 엄마야. "아이고 정말~", "내가 몇 번을 말했니" 같은 감탄사와 함께 애정 섞인 잔소리로 몰아붙여.`,
  friend: `너는 다정한데 은근히 사람 뼈 때리는 친구야. 부드러운 말투로 시작해서 마지막에 정곡을 찌르는 한마디를 반드시 넣어.`,
};

interface ActiveCommitment {
  id: string;
  goal: string;
  said_at: string;
  commitment_until: string;
}

function toKoreanWeekday(iso: string): string {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const d = new Date(iso);
  return days[d.getDay()] + '요일';
}

async function fetchActiveCommitments(userId: string, excludeEntryId?: string): Promise<ActiveCommitment[]> {
  const now = new Date().toISOString();
  let query = supabase
    .from('voice_entries')
    .select('id, target_goal, created_at, commitment_until')
    .eq('user_id', userId)
    .eq('goal_status', 'active')
    .not('target_goal', 'is', null)
    .neq('target_goal', '')
    .gt('commitment_until', now)
    .order('created_at', { ascending: false })
    .limit(5);

  if (excludeEntryId) query = query.neq('id', excludeEntryId);

  const { data, error } = await query;
  if (error) {
    console.error('[analysis] fetchActiveCommitments failed:', error.message);
    return [];
  }
  return (data ?? []).map((r: any) => ({
    id: r.id,
    goal: r.target_goal,
    said_at: toKoreanWeekday(r.created_at),
    commitment_until: r.commitment_until,
  }));
}

async function fetchUnfulfilledCommitmentMemories(userId: string): Promise<{ id: string; commitment: string }[]> {
  const { data, error } = await supabase
    .from('commitment_memory')
    .select('id, commitment')
    .eq('user_id', userId)
    .eq('fulfilled', false)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('[analysis] fetchUnfulfilledCommitmentMemories failed:', error.message);
    return [];
  }
  return (data ?? []).filter((r: any) => r.commitment);
}

async function fetchTopPatterns(userId: string): Promise<{ pattern: string; occurrence_count: number }[]> {
  const { data, error } = await supabase
    .from('pattern_memory')
    .select('pattern, occurrence_count')
    .eq('user_id', userId)
    .order('occurrence_count', { ascending: false })
    .limit(3);

  if (error) {
    console.error('[analysis] fetchTopPatterns failed:', error.message);
    return [];
  }
  return (data ?? []).filter((r: any) => r.pattern);
}

// event_memory에는 context_facts가 만든 row(title=null)와 memory_candidates가 만든 row(title=memory_type)가 섞여 있다.
// title이 있는 row만 "기억 후보"로 취급해서 읽어온다.
async function fetchMemoryCandidates(userId: string): Promise<{ memory_type: MemoryType; content: string }[]> {
  const { data, error } = await supabase
    .from('event_memory')
    .select('title, content')
    .eq('user_id', userId)
    .not('title', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('[analysis] fetchMemoryCandidates failed:', error.message);
    return [];
  }
  return (data ?? [])
    .filter((r: any) => r.content && MEMORY_TYPES.includes(r.title))
    .map((r: any) => ({ memory_type: r.title as MemoryType, content: r.content as string }));
}

async function callGPT(
  transcript: string,
  persona: string,
  activeCommitments: ActiveCommitment[],
  unfulfilledMemories: { id: string; commitment: string }[],
  topPatterns: { pattern: string; occurrence_count: number }[],
  memoryCandidates: { memory_type: MemoryType; content: string }[]
): Promise<AnalysisResult> {
  const personaInstruction = PERSONA_PROMPTS[persona] || PERSONA_PROMPTS.coach;

  const commitmentsBlock = activeCommitments.length > 0
    ? activeCommitments.map(c => `- (${c.said_at}에 한 약속, id=${c.id}) "${c.goal}"`).join('\n')
    : '(아직 안 끝난 과거 약속 없음)';

  const memoryBlock = unfulfilledMemories.length > 0
    ? unfulfilledMemories.map(m => `- (id=${m.id}) "${m.commitment}"`).join('\n')
    : '(기록된 과거 약속 없음)';

  const patternBlock = topPatterns.length > 0
    ? topPatterns.map(p => `- "${p.pattern}" (지금까지 ${p.occurrence_count}번 반복 감지됨)`).join('\n')
    : '(아직 감지된 반복 패턴 없음)';

  const memoryCandidatesBlock = memoryCandidates.length > 0
    ? memoryCandidates.map(m => `- (${m.memory_type}) "${m.content}"`).join('\n')
    : '(아직 기록된 기억 후보 없음)';

  const systemPrompt = `${personaInstruction}

너는 사용자가 그냥 아무 말이나 편하게 한 음성 녹음을 듣고 있다.
사용자는 목표나 약속을 "제출"한 게 아니라 그냥 이야기했을 뿐이다. 그 안에서 스스로 목표/약속/핑계/감정/패턴을 찾아내라.

이 단계는 순수 "사실 추출" 단계다. 실제로 사용자에게 어떻게 말할지는 이후 별도 단계(response engine)가 결정한다.
너는 여기서 사용자의 내면을 함부로 확정하지 않는다. 특히 아래 필드들은 "실제로 일어난 일 / 실제로 한 말"만 담아라:
- context_facts: 사용자가 실제로 한 말이나 실제로 일어난 사건만 짧은 문장으로 담아라. "사용자는 사실 ~한 욕구가 있다", "사용자는 ~를 두려워한다" 같은 심리적 해석·추론 문장은 여기 넣지 마라. 그건 사실이 아니라 해석이고, 이 필드는 나중에 event_memory에 그대로 누적 저장되므로 추측을 사실처럼 쌓으면 안 된다.

아직 안 끝난 과거 약속 목록:
${commitmentsBlock}

과거에 기록된, 아직 이행 여부가 불확실한 약속들:
${memoryBlock}

이 사용자에게서 반복적으로 감지된 패턴:
${patternBlock}

[사용자가 이전에 이야기한 것들]
아래는 사용자가 예전에 한 말 중에서, 지속적인 관심사/프로젝트/취향/생각으로 판단되어 따로 기억해둔 것들이다.
이건 오늘 발화를 "이해하는 데 참고하는 배경"일 뿐이다. 이걸 근거로 오늘 발화에 없는 내용을 새로 만들어내거나, 오늘 발화를 이 기억에 억지로 끼워 맞추지 마라.
${memoryCandidatesBlock}

판단 기준:

- commitment: 오늘 발화에서 사용자가 실제 행동 의지를 명확히 표현한 것 중 대표 1개 (없으면 null). commitment는 참견이가 발화 속에서 "발견해서 만들어내는" 게 아니다 — 사용자가 실제로 행동하겠다는 의지를 표현했을 때만 후보가 된다. 아래는 기본적으로 commitment가 아니다(=null):
  - 생각/희망/가능성 표현: "~하고 싶어", "~해보고 싶기도 해", "~할까 하는 생각이 들어", "~하면 좋겠다"
  - 필요성만 표현(아직 "하겠다"가 아님): "~해야 할 것 같아", "~해야 하는데"
  - 과거/현재 상황을 그냥 이야기하는 것(예: 뭔가를 미뤘다는 회고): "~해야 하는데 또 미뤘어" — 이건 새 commitment가 아니라 그냥 오늘 상황 묘사다.
  이런 발화들은 사용자가 실제로 확정한 게 아니라 그냥 생각을 말한 것이므로, commitment로 착각해서 만들어내면 안 된다. 애매하면 무조건 null이 기본값이다.
  commitment 후보가 되려면 명확한 행동 의지 표현이 있어야 한다: "오늘 ~할 거야", "이번 주말에 ~할 거야", "내일 ~해볼 거야" 처럼 "하겠다/할 것이다"가 뚜렷해야 한다.
- commitment_type: commitment가 null이면 이것도 null. commitment가 있을 때만: 사용자가 시점/행동을 명확하게 선언했으면 "explicit" (예: "이번 주에 반드시 운동 세 번 할 거야", "오늘 퇴근하고 운동 갈 거야"). explicit만큼 뚜렷하진 않지만 그래도 실제 행동 의지가 발화에 충분히 드러나는 경우에만 "inferred"를 아주 보수적으로 써라 — 위에서 말한 생각/필요성/회고 표현은 inferred의 대상이 아니다. inferred를 쓸지 null을 쓸지 애매하면 null을 우선해라.
- commitment_confidence: explicit이면 "high", inferred면 "medium" 또는 "low" (얼마나 막연한지에 따라). commitment가 null이면 null.
- intervention_needed: 이건 "화면에 짧게 반응하는 것"과는 완전히 다른, 훨씬 엄격한 기준이다. true가 되면 실제로 전화가 걸릴 수 있다는 뜻이다. 아래 경우에만 true로 판단해라 (기본은 false):
  - 같은 핑계나 같은 목표를 여러 번 반복하는 게 위 기록에서 확인됨
  - 같은 약속을 여러 번 미루고 있는 게 확인됨
  - 오늘 발화가 과거 약속과 명백히 모순됨
  - 사용자가 "이건 꼭 해야 한다"고 explicit하게 선언했는데 그 뒤로 실행 기록이 전혀 없음이 위 기록에서 확인됨
  단순히 오늘 목표를 처음 말한 것만으로는 intervention_needed를 true로 하지 마라 (반복/모순의 증거가 있을 때만). 애매하면 false로 판단해라 — 화면 참견은 별도 단계에서 항상 일어나니, 여기서 무리하게 true를 내지 않아도 된다.
- intervention_reason: intervention_needed가 true일 때만, 아래 중 하나로: "repeated_excuse" | "repeated_unfulfilled_commitment" | "contradiction_detected" | "unfulfilled_explicit_commitment". false면 null.
- fulfilled_commitments: 위 "아직 이행 여부가 불확실한 약속들" 중, 오늘 발화로 미루어 사용자가 이미 완료했다고 확인되는 것들의 원문. 애매하면 넣지 마라.
- commitment_context_updates: 오늘 발화가 위 "아직 이행 여부가 불확실한 약속들" 목록에 있는 특정 약속과 명확하게 관련된 상황(지연 이유, 방해 요소, 진행 상황 등)을 담고 있을 때만 채운다. 각 항목은 { "commitment_id": "...", "context": "..." } 형태이고, commitment_id는 반드시 위 목록에 표시된 (id=...) 값을 그대로 써야 한다 (지어내지 마라). context는 짧은 사실 문장 하나로.
  - 관련성이 조금이라도 애매하면 넣지 마라. 오늘 발화가 그 약속을 아예 언급하지 않거나, 그냥 다른 화제(감정/잡담/전혀 다른 주제)라면 절대 억지로 연결하지 마라.
  - 이번 발화로 그 약속이 fulfilled_commitments에 이미 포함됐다면(=완료로 확정됐다면), 같은 약속에 대해 commitment_context_updates에는 넣지 마라. 완료된 약속은 상황 업데이트가 필요 없다.
  - 관련된 게 하나도 없으면 빈 배열 []을 반환해라.
- memory_candidates: 이건 context_facts와 완전히 다른 목적이다. context_facts는 "오늘 실제로 있었던 일"을 담는 거고, memory_candidates는 "이 사람을 계속 이해하는 데 나중에도 의미가 있을 만한 것"만 담는다. 그래서 같은 발화라도 필요하면 두 필드 모두에 들어갈 수 있다.
  담아야 하는 것: 지속적인 관심사, 실제로 해보고 싶다고 말한 프로젝트나 아이디어, 개인적인 취향, 앞으로도 반복해서 나올 법한 생각.
  담으면 안 되는 것: 오늘 하루 있었던 일(뭘 먹었는지, 날씨, 출퇴근 등), 일시적인 감정, 한 번 하고 지나갈 사소한 이야기, 그리고 사용자가 말하지 않은 걸 GPT가 성향으로 일반화한 것("사용자는 창업에 관심이 많다" 같은 건 절대 안 됨 — 사용자가 실제로 한 말의 의미만 보존해서 짧게 적어라, 예: "식물 가게를 직접 해보고 싶어 한다").
  예) "식물 가게를 해보고 싶어" / "언젠가 내 식물 가게를 운영해보고 싶어" → memory_candidate 됨. "오늘 식물 물 줬어" → 안 됨.
  각 항목은 { "memory_type": "interest|project|preference|thought", "content": "..." } 형태. 애매하면 넣지 마라 — 확신 없으면 빈 배열이 기본이다.

말투 원칙: 상담사/비서 말투 금지. 짧고 자연스럽게, 필요할 때만 장난스럽게, 과하게 친절하지 않게.
예) "말씀하신 내용이 조금 모호하네요" (X) → 그냥 자연스럽게 반응하거나 call_line을 짧게.

intervention_needed가 true일 때만 call_line을 실제로 통화에서 쓸 거니, 그 경우엔:
1. "[요일]에 [약속 내용]이라고 하지 않았어?" 식으로 언제 약속했는지부터 짚고
2. 지금과의 모순/반복을 지적하고
3. 페르소나 말투로 1~2문장 마무리
intervention_needed가 false면 call_line은 짧은 반응 한 마디로만 채워라 (실제 통화엔 안 쓰임).

반드시 아래 JSON 형식으로만 답해:
{
  "type": "excuse|contradiction|repetition|none",
  "summary": "오늘 상황 요약 한 문장",
  "goal": "..." or null,
  "commitment": "..." or null,
  "commitment_type": "explicit|inferred" or null,
  "commitment_confidence": "high|medium|low" or null,
  "excuse": "..." or null,
  "emotion": "...",
  "intervention_needed": true or false,
  "intervention_reason": "..." or null,
  "call_line": "...",
  "tone": "playful|firm",
  "contradictions": [],
  "goal_matched": true or false,
  "matched_commitment_id": "..." or null,
  "new_commitments": [],
  "context_facts": [],
  "detected_pattern": "..." or null,
  "fulfilled_commitments": [],
  "commitment_context_updates": [],
  "memory_candidates": []
}`;

  const userPrompt = `방금 녹음한 말: "${transcript}"`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.8,
      }),
    });

    if (!res.ok) throw new Error('분석 실패: ' + (await res.text()));
    const json = await res.json();
    const parsed = JSON.parse(json.choices[0].message.content);

    return {
      type: parsed.type ?? 'none',
      summary: parsed.summary ?? '',
      goal: parsed.goal ?? null,
      commitment: parsed.commitment ?? null,
      commitment_type: parsed.commitment_type ?? null,
      commitment_confidence: parsed.commitment_confidence ?? null,
      excuse: parsed.excuse ?? null,
      emotion: parsed.emotion ?? null,
      intervention_needed: parsed.intervention_needed ?? false,
      intervention_reason: parsed.intervention_reason ?? null,
      call_line: parsed.call_line ?? '',
      tone: parsed.tone ?? 'playful',
      contradictions: parsed.contradictions ?? [],
      goal_matched: parsed.goal_matched ?? false,
      matched_commitment_id: parsed.matched_commitment_id ?? null,
      new_commitments: parsed.new_commitments ?? [],
      context_facts: parsed.context_facts ?? [],
      detected_pattern: parsed.detected_pattern ?? null,
      fulfilled_commitments: parsed.fulfilled_commitments ?? [],
      commitment_context_updates: Array.isArray(parsed.commitment_context_updates)
        ? parsed.commitment_context_updates.filter(
            (u: any) => u && typeof u.commitment_id === 'string' && typeof u.context === 'string'
          )
        : [],
      memory_candidates: Array.isArray(parsed.memory_candidates)
        ? parsed.memory_candidates.filter(
            (m: any) =>
              m &&
              typeof m.content === 'string' &&
              m.content.trim().length > 0 &&
              MEMORY_TYPES.includes(m.memory_type)
          )
        : [],
    };
  } catch (err) {
    console.error('[callGPT] 분석 중 오류 발생:', err);
    return {
      type: 'none',
      summary: transcript ? `${transcript.slice(0, 20)}...` : '내용 없음',
      goal: null,
      commitment: null,
      commitment_type: null,
      commitment_confidence: null,
      excuse: null,
      emotion: null,
      intervention_needed: false,
      intervention_reason: null,
      call_line: '',
      tone: 'playful',
      contradictions: [],
      goal_matched: false,
      matched_commitment_id: null,
      new_commitments: [],
      context_facts: [],
      detected_pattern: null,
      fulfilled_commitments: [],
      commitment_context_updates: [],
      memory_candidates: [],
    };
  }
}

async function storeAutoMemories(
  entryId: string,
  userId: string,
  analysis: AnalysisResult,
  unfulfilledMemories: { id: string; commitment: string }[]
) {
  if (analysis.context_facts.length > 0) {
    const rows = analysis.context_facts.map((c) => ({
      voice_entry_id: entryId,
      user_id: userId,
      content: c,
    }));
    const { error } = await supabase.from('event_memory').insert(rows);
    if (error) console.error('[analysis] event_memory insert failed:', error.message);
  }

  // memory_candidates: context_facts와 완전히 별도의 저장 경로. 같은 event_memory 테이블을 쓰되,
  // title에 memory_type을 채워서 구분한다 (context_facts row는 title이 항상 null).
  if (analysis.memory_candidates.length > 0) {
    // 같은 응답 안에서 GPT가 같은 content를 중복으로 반환한 경우 우선 로컬에서 한 번 정리
    const seen = new Set<string>();
    const uniqueCandidates = analysis.memory_candidates.filter((m) => {
      if (seen.has(m.content)) return false;
      seen.add(m.content);
      return true;
    });

    for (const candidate of uniqueCandidates) {
      // 복잡한 유사도 검색은 하지 않고, 동일 content가 이미 저장돼 있는지만 단순 확인 (완전 일치 기준)
      const { data: existing, error: dupCheckError } = await supabase
        .from('event_memory')
        .select('id')
        .eq('user_id', userId)
        .eq('title', candidate.memory_type)
        .eq('content', candidate.content)
        .limit(1)
        .maybeSingle();

      if (dupCheckError) {
        console.error('[analysis] memory_candidates 중복 확인 실패:', dupCheckError.message);
        continue; // 확인 실패 시 안전하게 이번 항목은 건너뜀 (무한 중복 적재보다는 누락이 낫다)
      }
      if (existing) continue; // 이미 같은 기억이 저장돼 있음 — 새로 안 만듦

      const { error: insertError } = await supabase.from('event_memory').insert({
        voice_entry_id: entryId,
        user_id: userId,
        content: candidate.content,
        title: candidate.memory_type,
      });
      if (insertError) console.error('[analysis] memory_candidates insert failed:', insertError.message);
    }
  }

  if (analysis.detected_pattern) {
    const { data: existing, error: fetchError } = await supabase
      .from('pattern_memory')
      .select('id, occurrence_count')
      .eq('user_id', userId)
      .eq('pattern', analysis.detected_pattern)
      .maybeSingle();

    if (fetchError) {
      console.error('[analysis] pattern_memory fetch failed:', fetchError.message);
    } else if (existing) {
      const { error } = await supabase
        .from('pattern_memory')
        .update({ occurrence_count: (existing.occurrence_count ?? 0) + 1, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (error) console.error('[analysis] pattern_memory update failed:', error.message);
    } else {
      const { error } = await supabase.from('pattern_memory').insert({
        user_id: userId,
        pattern: analysis.detected_pattern,
        occurrence_count: 1,
        updated_at: new Date().toISOString(),
      });
      if (error) console.error('[analysis] pattern_memory insert failed:', error.message);
    }
  }

  const fulfilledMatchedIds = new Set<string>();
  if (analysis.fulfilled_commitments.length > 0 && unfulfilledMemories.length > 0) {
    const matchedIds = unfulfilledMemories
      .filter((m) => analysis.fulfilled_commitments.includes(m.commitment))
      .map((m) => m.id);
    if (matchedIds.length > 0) {
      for (const id of matchedIds) {
        fulfilledMatchedIds.add(id);
        const { data: row } = await supabase
          .from('commitment_memory')
          .select('progress_count, target_count')
          .eq('id', id)
          .maybeSingle();
        const nextProgress = (row?.progress_count ?? 0) + 1;
        const isFullyDone = !row?.target_count || nextProgress >= row.target_count;
        const { error } = await supabase
          .from('commitment_memory')
          .update({ progress_count: nextProgress, fulfilled: isFullyDone })
          .eq('id', id);
        if (error) console.error('[analysis] commitment_memory progress update failed:', error.message);
      }
    }
  }

  // 자유 발화 중 기존 commitment와 명확히 관련된 상황만 last_context/last_context_at로 연결한다.
  // intervention_stage / status / next_intervention_at / fulfilled / progress_count는 절대 건드리지 않는다.
  if (analysis.commitment_context_updates.length > 0 && unfulfilledMemories.length > 0) {
    const knownIds = new Set(unfulfilledMemories.map((m) => m.id));
    const now = new Date().toISOString();

    for (const update of analysis.commitment_context_updates) {
      // GPT가 이번 요청에서 실제로 보여준 목록 밖의 id를 지어내 돌려준 경우 무시 (안전장치)
      if (!knownIds.has(update.commitment_id)) {
        console.error('[analysis] commitment_context_updates: 알 수 없는 commitment_id 무시:', update.commitment_id);
        continue;
      }
      // 이번 발화로 같은 commitment가 동시에 fulfilled 처리됐다면 context는 저장하지 않는다.
      if (fulfilledMatchedIds.has(update.commitment_id)) continue;
      if (!update.context) continue;

      const { error } = await supabase
        .from('commitment_memory')
        .update({ last_context: update.context, last_context_at: now })
        .eq('id', update.commitment_id)
        .eq('user_id', userId)
        .eq('fulfilled', false);
      if (error) console.error('[analysis] commitment_memory context update failed:', error.message);
    }
  }
}

export async function confirmCommitment(
  entryId: string,
  userId: string,
  phone: string | null,
  commitment: string,
  commitmentType: 'explicit' | 'inferred' | null,
  commitmentConfidence: 'high' | 'medium' | 'low' | null,
  targetCount: number | null = null
) {
  // 개입 엔진(lib/interventionEngine.ts)이 이 commitment를 찾으려면 next_intervention_at이 채워져 있어야 한다.
  const firstInterventionAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from('commitment_memory').insert({
    voice_entry_id: entryId,
    user_id: userId,
    user_phone: phone,
    commitment,
    fulfilled: false,
    target_count: targetCount,
    progress_count: 0,
    intervention_stage: 0,
    next_intervention_at: firstInterventionAt,
  });
  if (error) {
    console.error('[analysis] confirmCommitment insert failed:', error.message);
    throw error;
  }
  return { commitment, commitmentType, commitmentConfidence };
}

export async function analyzeAndSchedule(entryId: string, transcript: string, userId: string, persona: string) {
  const activeCommitments = await fetchActiveCommitments(userId, entryId);
  const unfulfilledMemories = await fetchUnfulfilledCommitmentMemories(userId);
  const topPatterns = await fetchTopPatterns(userId);
  const memoryCandidates = await fetchMemoryCandidates(userId);

  const analysis = await callGPT(transcript, persona, activeCommitments, unfulfilledMemories, topPatterns, memoryCandidates);

  await storeAutoMemories(entryId, userId, analysis, unfulfilledMemories);

  const commitmentUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

   return { analysis, commitmentUntil, memoryCandidates, unfulfilledMemories };
}

export async function expireOldCommitments() {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('voice_entries')
    .update({ goal_status: 'expired' })
    .eq('goal_status', 'active')
    .lt('commitment_until', now);
  if (error) console.error('[analysis] expireOldCommitments failed:', error.message);
}
