
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
}

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

// phone → userId 기준으로 변경 (STEP1 이후 voice_entries가 user_id를 갖게 됐는데 여기만 안 바뀌어 있었음)
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

async function callGPT(
  transcript: string,
  persona: string,
  activeCommitments: ActiveCommitment[],
  unfulfilledMemories: { id: string; commitment: string }[],
  topPatterns: { pattern: string; occurrence_count: number }[]
): Promise<AnalysisResult> {
  const personaInstruction = PERSONA_PROMPTS[persona] || PERSONA_PROMPTS.coach;

  const commitmentsBlock = activeCommitments.length > 0
    ? activeCommitments.map(c => `- (${c.said_at}에 한 약속, id=${c.id}) "${c.goal}"`).join('\n')
    : '(아직 안 끝난 과거 약속 없음)';

  const memoryBlock = unfulfilledMemories.length > 0
    ? unfulfilledMemories.map(m => `- "${m.commitment}"`).join('\n')
    : '(기록된 과거 약속 없음)';

  const patternBlock = topPatterns.length > 0
    ? topPatterns.map(p => `- "${p.pattern}" (지금까지 ${p.occurrence_count}번 반복 감지됨)`).join('\n')
    : '(아직 감지된 반복 패턴 없음)';

  const systemPrompt = `${personaInstruction}

너는 사용자가 그냥 아무 말이나 편하게 한 음성 녹음을 듣고 있다.
사용자는 목표나 약속을 "제출"한 게 아니라 그냥 이야기했을 뿐이다. 그 안에서 스스로 목표/약속/핑계/감정/패턴을 찾아내라.

아직 안 끝난 과거 약속 목록:
${commitmentsBlock}

과거에 기록된, 아직 이행 여부가 불확실한 약속들:
${memoryBlock}

이 사용자에게서 반복적으로 감지된 패턴:
${patternBlock}

판단 기준:

- commitment: 오늘 발화에서 새로 확정적으로 "하겠다"고 한 것 중 대표 1개 (없으면 null)
- commitment_type: 사용자가 명확하게 선언했으면 "explicit" (예: "이번 주에 반드시 운동 세 번 할 거야"), 확정적 약속은 아니고 의지/필요성만 표현했으면 "inferred" (예: "운동 좀 해야 할 것 같아"). commitment가 null이면 이것도 null.
- commitment_confidence: explicit이면 "high", inferred면 "medium" 또는 "low" (얼마나 막연한지에 따라). commitment가 null이면 null.
- intervention_needed: 지금 전화로 직접 개입할 만큼 중요한 순간인가. 아래 경우에만 true로 판단해라 (기본은 false):
  - 같은 핑계나 같은 목표를 여러 번 반복하는 게 위 기록에서 확인됨
  - 같은 약속을 여러 번 미루고 있는 게 확인됨
  - 오늘 발화가 과거 약속과 명백히 모순됨
  - 사용자가 "이건 꼭 해야 한다"고 explicit하게 선언했는데 그 뒤로 실행 기록이 전혀 없음이 위 기록에서 확인됨
  단순히 오늘 목표를 처음 말한 것만으로는 intervention_needed를 true로 하지 마라 (반복/모순의 증거가 있을 때만).
- intervention_reason: intervention_needed가 true일 때만, 아래 중 하나로: "repeated_excuse" | "repeated_unfulfilled_commitment" | "contradiction_detected" | "unfulfilled_explicit_commitment". false면 null.
- fulfilled_commitments: 위 "아직 이행 여부가 불확실한 약속들" 중, 오늘 발화로 미루어 사용자가 이미 완료했다고 확인되는 것들의 원문. 애매하면 넣지 마라.

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
  "fulfilled_commitments": []
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

  if (analysis.fulfilled_commitments.length > 0 && unfulfilledMemories.length > 0) {
    const matchedIds = unfulfilledMemories
      .filter((m) => analysis.fulfilled_commitments.includes(m.commitment))
      .map((m) => m.id);
    if (matchedIds.length > 0) {
      // 완료 처리 + progress_count도 함께 1 증가 (target_count 있는 반복형 약속 대비)
      for (const id of matchedIds) {
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
}

// 사용자가 "기억해둬"를 눌렀을 때만 호출
export async function confirmCommitment(
  entryId: string,
  userId: string,
  phone: string | null,
  commitment: string,
  commitmentType: 'explicit' | 'inferred' | null,
  commitmentConfidence: 'high' | 'medium' | 'low' | null,
  targetCount: number | null = null
) {
  const { error } = await supabase.from('commitment_memory').insert({
    voice_entry_id: entryId,
    user_id: userId,
    user_phone: phone,
    commitment,
    fulfilled: false,
    target_count: targetCount,
    progress_count: 0,
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

  const analysis = await callGPT(transcript, persona, activeCommitments, unfulfilledMemories, topPatterns);

  await storeAutoMemories(entryId, userId, analysis, unfulfilledMemories);

  const commitmentUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  return { analysis, commitmentUntil };
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
