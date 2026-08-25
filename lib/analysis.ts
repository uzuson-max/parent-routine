// lib/analysis.ts
import { supabase } from '@/lib/supabase';

interface AnalysisResult {
  type: 'excuse' | 'contradiction' | 'repetition' | 'none';
  summary: string;                // 오늘 발화 핵심 요약
  goal: string | null;            // 사용자가 이루려는 것
  commitment: string | null;      // 오늘 새로 한 확정적 약속 (대표 1개, 없으면 null)
  excuse: string | null;          // 오늘 말한 핑계/회피 논리 (없으면 null)
  emotion: string | null;         // 현재 감정 상태 한 단어/짧은 구
  intervention_needed: boolean;   // AI가 지금 개입(팩폭)할 필요가 있는가
  call_line: string;
  tone: 'playful' | 'firm';
  contradictions: string[];
  goal_matched: boolean;
  matched_commitment_id: string | null;
  new_commitments: string[];      // 오늘 새로 확인된 확정적 약속들 (commitment_memory에 저장될 전체 목록)
  context_facts: string[];
  detected_pattern: string | null;
  fulfilled_commitments: string[]; // 과거 미이행 약속(unfulfilledMemories) 중, 오늘 발화로 "완료했다"고 확인된 것들 (원문 그대로)
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

// 아직 안 지킨(fulfilled=false) 과거 commitment_memory 기록 조회
async function fetchUnfulfilledCommitmentMemories(phone: string): Promise<{ id: string; commitment: string }[]> {
  const { data, error } = await supabase
    .from('commitment_memory')
    .select('id, commitment')
    .eq('user_phone', phone)
    .eq('fulfilled', false)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('[analysis] fetchUnfulfilledCommitmentMemories failed:', error.message);
    return [];
  }
  return (data ?? []).filter((r: any) => r.commitment);
}

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
  unfulfilledMemories: { id: string; commitment: string }[],
  topPatterns: string[]
): Promise<AnalysisResult> {
  const personaInstruction = PERSONA_PROMPTS[persona] || PERSONA_PROMPTS.coach;

  const commitmentsBlock = activeCommitments.length > 0
    ? activeCommitments.map(c => `- (${c.said_at}에 한 약속, id=${c.id}) "${c.goal}"`).join('\n')
    : '(아직 안 끝난 과거 약속 없음)';

  const memoryBlock = unfulfilledMemories.length > 0
    ? unfulfilledMemories.map(m => `- "${m.commitment}"`).join('\n')
    : '(기록된 과거 약속 없음)';

  const patternBlock = topPatterns.length > 0
    ? topPatterns.map(p => `- "${p}"`).join('\n')
    : '(아직 감지된 반복 패턴 없음)';

  const systemPrompt = `${personaInstruction}

너의 임무는 사용자가 "아직 안 지킨 과거 약속들" 목록과, 방금 한 말(핑계/상태)을 대조해서
가장 관련 있는 약속 하나를 콕 집어 모순을 지적하는 것이야.

아직 안 끝난 과거 약속 목록 (스케줄용):
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

반대로, 오늘 발화에서 사용자가 "위 과거 약속 목록 중 하나를 이미 완료했다"고 말하는 것으로 보이면
(예: "어제 헬스장 갔다왔어" 처럼), 그 약속 원문을 fulfilled_commitments 배열에 그대로 넣어라. 애매하면 넣지 마라.

관련된 과거 약속이 하나도 없으면 goal_matched는 false, matched_commitment_id는 null로 하고,
call_line은 오늘 발화 자체에 대한 가벼운 반응으로만 만들어라 (없는 모순을 억지로 만들지 마라).

추가로 아래 항목들도 오늘 발화만 보고 판단해라:
- goal: 사용자가 이루려는 것 (오늘 새로 말한 목표가 있으면 그것, 없으면 null)
- commitment: 오늘 새로 확정적으로 "하겠다"고 한 것 중 대표 1개 (없으면 null)
- excuse: 오늘 말한 핑계/회피 논리 (없으면 null)
- emotion: 현재 감정 상태를 한 단어~짧은 구로 (예: "피곤함", "부담감", "평온함")
- intervention_needed: 지금 팩폭/참견이 필요한 상황인가 (true/false)
- new_commitments: 사용자가 오늘 새로 확정적으로 "하겠다"고 한 것들 전체 목록 (commitment와 겹쳐도 됨)
- context_facts: 나중에 참견할 때 참고하면 좋을 개인적 사실/상황
- detected_pattern: 오늘 발화가 기존에 반복되던 패턴과 같은 이야기로 보이면 그 패턴을 한
