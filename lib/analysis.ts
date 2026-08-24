import { supabase } from '@/lib/supabase';

interface AnalysisResult {
  type: 'excuse' | 'contradiction' | 'repetition' | 'none';
  summary: string;
  call_line: string;
  tone: 'playful' | 'firm';
  contradictions: string[];        // 오늘 발화 안에서 발견된 모순 (ResultScreen 표시용)
  goal_matched: boolean;          // 오늘 발화가 과거 활성 약속 중 하나를 건드렸는가
  matched_commitment_id: string | null; // 어떤 과거 약속(voice_entries.id)을 지적했는가
  new_commitments: string[];      // 오늘 발화에서 새로 확인된 "하겠다"는 확정적 약속들
  context_facts: string[];        // 나중에 참견할 때 유용한 개인적 맥락/사실
  detected_pattern: string | null; // 반복되는 이야기로 보이는 것 (있으면 하나, 없으면 null)
}

const PERSONA_PROMPTS: Record<string, string> = {
  boss: `너는 팩폭형 꼰대 상사야. 반말 반, 존댓말 반 섞어서 권위적이지만 은근히 챙기는 티가 나게 말해. "김대리~" 같은 호칭은 쓰지 말고, 짧고 단호하게 몰아붙여.`,
  coach: `너는 냉정한 행동경제학 코치야. 감정 배제하고, 사용자의 자기합리화 패턴을 데이터/논리로 반박하듯 차갑게 짚어. "그건 핑계고 실제로는..." 같은 화법을 써.`,
  mom: `너는 잔소리 폭발 직전인 엄마야. "아이고 정말~", "내가 몇 번을 말했니" 같은 감탄사와 함께 애정 섞인 잔소리로 몰아붙여.`,
  friend: `너는 다정한데 은근히 사람 뼈 때리는 친구야. 부드러운 말투로 시작해서 마지막에 정곡을 찌르는 한마디를 반드시 넣어.`,
};

// 활성 약속 하나의 최소 정보 (프롬프트에 넣을 형태)
interface ActiveCommitment {
  id: string;
  goal: string;
  said_at: string;          // 언제 이 약속을 했는지 (요일 표현으로 변환해서 넘김)
  commitment_until: string;
}

function toKoreanWeekday(iso: string): string {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const d = new Date(iso);
  return days[d.getDay()] + '요일';
}

// 같은 user_phone의 아직 안 끝난(active) 과거 약속들을 조회 (voice_entries 기반 — 통화 스케줄링용, 기존 로직 그대로 유지)
async function fetchActiveCommitments(phone: string, excludeEntryId?: string): Promise<ActiveCommitment[]> {
  const now = new Date().toISOString();
  let query = supabase
    .from('voice_entries')
    .select('id, target_goal, created_at, commitment_until')
    .eq('user_phone', phone)
    .eq('goal_status', 'active')
    .not('target_goal', 'is', null)
    .neq('target_goal', '')
    .gt('commitment_until', now)
    .order('created_at', { ascending: false })
    .limit(5);

  if (excludeEntryId) {
    query = query.neq('id', excludeEntryId);
  }

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

// 아직 안 지킨(fulfilled=false) 과거 commitment_memory 기록 조회 — 참견 멘트에 풍부한 기억을 더해주는 용도
async function fetchUnfulfilledCommitmentMemories(phone: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('commitment_memory')
    .select('commitment')
    .eq('user_phone', phone)
    .eq('fulfilled', false)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('[analysis] fetchUnfulfilledCommitmentMemories failed:', error.message);
    return [];
  }
  return (data ?? []).map((r: any) => r.commitment).filter(Boolean);
}

// 자주 반복되는 패턴 조회 — occurrence_count 높은 순
async function fetchTopPatterns(phone: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('pattern_memory')
    .select('pattern, occurrence_count')
    .eq('user_phone', phone)
    .order('occurrence_count', { ascending: false })
    .limit(3);

  if (error) {
    console.error('[analysis] fetchTopPatterns failed:', error.message);
    return [];
  }
  return (data ?? []).map((r: any) => r.pattern).filter(Boolean);
}

async function callGPT(
  transcript: string,
  targetGoal: string,
  persona: string,
  activeCommitments: ActiveCommitment[],
  unfulfilledMemories: string[],
  topPatterns: string[]
): Promise<AnalysisResult> {
  const personaInstruction = PERSONA_PROMPTS[persona] || PERSONA_PROMPTS.coach;

  const commitmentsBlock = activeCommitments.length > 0
    ? activeCommitments.map(c => `- (${c.said_at}에 한 약속, id=${c.id}) "${c.goal}"`).join('\n')
    : '(아직 안 끝난 과거 약속 없음)';

  const memoryBlock = unfulfilledMemories.length > 0
    ? unfulfilledMemories.map(m => `- "${m}"`).join('\n')
    : '(기록된 과거 약속 없음)';

  const patternBlock = topPatterns.length > 0
    ? topPatterns.map(p => `- "${p}"`).join('\n')
    : '(아직 감지된 반복 패턴 없음)';

  const systemPrompt = `${personaInstruction}

너의 임무는 사용자가 "아직 안 지킨 과거 약속들" 목록과, 방금 한 말(핑계/상태)을 대조해서
가장 관련 있는 약속 하나를 콕 집어 모순을 지적하는 것이야.

아직 안 지킨 과거 약속 목록 (스케줄용):
${commitmentsBlock}

과거에 기록된, 아직 이행 여부가 불확실한 약속들 (참고용 기억):
${memoryBlock}

이 사용자에게서 반복적으로 감지된 패턴:
${patternBlock}

방금 한 말이 오늘 새로 세운 목표(target_goal)라면 그건 약속 목록과 대조할 필요 없어 (아직 안 어겼으니까).
방금 한 말이 위 목록 중 하나와 관련된 핑계/회피/모순으로 보이면:
1. 정확히 "[요일]에 [약속 내용]이라고 하지 않았어?" 형태로 언제 약속했는지부터 짚어라
2. 지금 하는 말과의 모순을 지적해라
3. 페르소나 말투로 1~2문장 마무리

관련된 과거 약속이 하나도 없으면 goal_matched는 false, matched_commitment_id는 null로 하고,
call_line은 오늘 발화 자체에 대한 가벼운 반응으로만 만들어라 (없는 모순을 억지로 만들지 마라).

추가로 아래 세 가지도 오늘 발화만 보고 판단해라 (없으면 빈 배열/null로):
- new_commitments: 사용자가 오늘 새로 확정적으로 "하겠다"고 한 것들 (목표보다 구체적/확정적인 것만, 애매한 다짐은 제외)
- context_facts: 나중에 참견할 때 참고하면 좋을 개인적 사실/상황 (예: 이직 준비 중이다, 요즘 잠을 못 잔다 등)
- detected_pattern: 오늘 발화가 기존에 반복되던 패턴과 같은 이야기로 보이면 그 패턴을 한 문장으로, 아니면 null

반드시 아래 JSON 형식으로만 답해. 다른 텍스트 없이 JSON만:
{
  "type": "excuse|contradiction|repetition|none",
  "summary": "오늘 상황 요약 한 문장",
  "call_line": "전화로 읽을 멘트, 2~3문장",
  "tone": "playful|firm",
  "contradictions": ["오늘 발화 안에서 발견된 모순들"],
  "goal_matched": true or false,
  "matched_commitment_id": "위 목록의 id 중 하나 또는 null",
  "new_commitments": ["오늘 새로 확정한 약속들"],
  "context_facts": ["기억해둘 맥락들"],
  "detected_pattern": "반복 패턴 한 문장 또는 null"
}`;

  const userPrompt = `사용자가 오늘 새로 말한 목표(있다면): "${targetGoal || '(없음)'}"
방금 녹음한 말: "${transcript}"`;

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
    call_line: parsed.call_line ?? '',
    tone: parsed.tone ?? 'playful',
    contradictions: parsed.contradictions ?? [],
    goal_matched: parsed.goal_matched ?? false,
    matched_commitment_id: parsed.matched_commitment_id ?? null,
    new_commitments: parsed.new_commitments ?? [],
    context_facts: parsed.context_facts ?? [],
    detected_pattern: parsed.detected_pattern ?? null,
  };
}

async function storeStructuredMemories(
  entryId: string,
  phone: string,
  analysis: AnalysisResult
) {
  if (analysis.new_commitments.length > 0) {
    const rows = analysis.new_commitments.map((c) => ({
      voice_entry_id: entryId,
      user_phone: phone,
      commitment: c,
      fulfilled: false,
    }));
    const { error } = await supabase.from('commitment_memory').insert(rows);
    if (error) console.error('[analysis] commitment_memory insert failed:', error.message);
  }

  if (analysis.context_facts.length > 0) {
    const rows = analysis.context_facts.map((c) => ({
      voice_entry_id: entryId,
      user_phone: phone,
      content: c,
    }));
    const { error } = await supabase.from('event_memory').insert(rows);
    if (error) console.error('[analysis] event_memory insert failed:', error.message);
  }

  if (analysis.detected_pattern) {
    const { data: existing, error: fetchError } = await supabase
      .from('pattern_memory')
      .select('id, occurrence_count')
      .eq('user_phone', phone)
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
        user_phone: phone,
        pattern: analysis.detected_pattern,
        occurrence_count: 1,
        updated_at: new Date().toISOString(),
      });
      if (error) console.error('[analysis] pattern_memory insert failed:', error.message);
    }
  }
}

export async function analyzeAndSchedule(
  entryId: string,
  transcript: string,
  phone: string,
  targetGoal: string,
  persona: string
) {
  const activeCommitments = await fetchActiveCommitments(phone, entryId);
  const unfulfilledMemories = await fetchUnfulfilledCommitmentMemories(phone);
  const topPatterns = await fetchTopPatterns(phone);

  const analysis = await callGPT(transcript, targetGoal, persona, activeCommitments, unfulfilledMemories, topPatterns);

  const delayMinutes = 1 + Math.floor(Math.random() * 5);
  const scheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000);

  const commitmentUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await storeStructuredMemories(entryId, phone, analysis);

  return {
    analysis,
    scheduledAt,
    commitmentUntil,
  };
}
