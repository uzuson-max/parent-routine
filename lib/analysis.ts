import { supabase } from '@/lib/supabase';

interface AnalysisResult {
  type: 'excuse' | 'contradiction' | 'repetition' | 'none';
  summary: string;
  call_line: string;
  tone: 'playful' | 'firm';
  contradictions: string[];       // 오늘 발화 안에서 발견된 모순 (ResultScreen 표시용)
  goal_matched: boolean;          // 오늘 발화가 과거 활성 약속 중 하나를 건드렸는가
  matched_commitment_id: string | null; // 어떤 과거 약속(voice_entries.id)을 지적했는가
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
  said_at: string;         // 언제 이 약속을 했는지 (요일 표현으로 변환해서 넘김)
  commitment_until: string;
}

function toKoreanWeekday(iso: string): string {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const d = new Date(iso);
  return days[d.getDay()] + '요일';
}

// 같은 user_phone의 아직 안 끝난(active) 과거 약속들을 조회
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

async function callGPT(
  transcript: string,
  targetGoal: string,
  persona: string,
  activeCommitments: ActiveCommitment[]
): Promise<AnalysisResult> {
  const personaInstruction = PERSONA_PROMPTS[persona] || PERSONA_PROMPTS.coach;

  const commitmentsBlock = activeCommitments.length > 0
    ? activeCommitments.map(c => `- (${c.said_at}에 한 약속, id=${c.id}) "${c.goal}"`).join('\n')
    : '(아직 안 끝난 과거 약속 없음)';

  const systemPrompt = `${personaInstruction}

너의 임무는 사용자가 "아직 안 지킨 과거 약속들" 목록과, 방금 한 말(핑계/상태)을 대조해서
가장 관련 있는 약속 하나를 콕 집어 모순을 지적하는 것이야.

아직 안 지킨 과거 약속 목록:
${commitmentsBlock}

방금 한 말이 오늘 새로 세운 목표(target_goal)라면 그건 약속 목록과 대조할 필요 없어 (아직 안 어겼으니까).
방금 한 말이 위 목록 중 하나와 관련된 핑계/회피/모순으로 보이면:
1. 정확히 "[요일]에 [약속 내용]이라고 하지 않았어?" 형태로 언제 약속했는지부터 짚어라
2. 지금 하는 말과의 모순을 지적해라
3. 페르소나 말투로 1~2문장 마무리

관련된 과거 약속이 하나도 없으면 goal_matched는 false, matched_commitment_id는 null로 하고,
call_line은 오늘 발화 자체에 대한 가벼운 반응으로만 만들어라 (없는 모순을 억지로 만들지 마라).

반드시 아래 JSON 형식으로만 답해. 다른 텍스트 없이 JSON만:
{
  "type": "excuse|contradiction|repetition|none",
  "summary": "오늘 상황 요약 한 문장",
  "call_line": "전화로 읽을 멘트, 2~3문장",
  "tone": "playful|firm",
  "contradictions": ["오늘 발화 안에서 발견된 모순들"],
  "goal_matched": true or false,
  "matched_commitment_id": "위 목록의 id 중 하나 또는 null"
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
  return JSON.parse(json.choices[0].message.content) as AnalysisResult;
}

export async function analyzeAndSchedule(
  entryId: string,
  transcript: string,
  phone: string,
  targetGoal: string,
  persona: string
) {
  // 1. 아직 안 끝난 과거 약속 조회 (핵심 신규 로직)
  const activeCommitments = await fetchActiveCommitments(phone, entryId);

  // 2. GPT 분석 (과거 약속 목록을 명시적으로 대조)
  const analysis = await callGPT(transcript, targetGoal, persona, activeCommitments);

  // 3. 발신 스케줄
  const delayMinutes = 1 + Math.floor(Math.random() * 5);
  const scheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000);

  // 4. 이번 발화 자체가 새 목표라면, 이번 항목을 새로운 활성 약속으로 등록 (기본 7일)
  const commitmentUntil = targetGoal
    ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    : null;

  await supabase
    .from('voice_entries')
    .update({
      analysis,
      call_message: analysis.call_line,
      scheduled_at: scheduledAt.toISOString(),
      call_state: 'pending',
      commitment_until: commitmentUntil,
      goal_status: targetGoal ? 'active' : 'n/a',
    })
    .eq('id', entryId);

  // 5. 이번 발화가 과거 약속을 "지적"했다면, 그 과거 약속은 지금 이 순간 판단 근거로 쓰인 것.
  //    "위반이 확정됐다"고 자동으로 broken 처리하지는 않음 (오탐 위험) — 사람이 나중에 결과 보고 판단하는 걸 기본값으로 둠.
  //    다만 완전히 지나간 약속(commitment_until < now)은 별도 정리 크론에서 expired로 정리 (PART 4-1 참고)
}

// 마감 지난 활성 약속들을 expired로 정리 (선택 — 크론에 붙이거나 analyzeAndSchedule 호출 시 같이 돌려도 됨)
export async function expireOldCommitments() {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('voice_entries')
    .update({ goal_status: 'expired' })
    .eq('goal_status', 'active')
    .lt('commitment_until', now);
  if (error) console.error('[analysis] expireOldCommitments failed:', error.message);
}
