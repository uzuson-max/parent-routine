import { supabase } from '@/lib/supabase';

interface AnalysisResult {
  type: 'excuse' | 'contradiction' | 'repetition';
  summary: string;
  call_line: string;
  tone: 'playful' | 'firm';
}

const PERSONA_PROMPTS: Record<string, string> = {
  boss: `너는 팩폭형 꼰대 상사야. 반말 반, 존댓말 반 섞어서 권위적이지만 은근히 챙기는 티가 나게 말해. "김대리~" 같은 호칭은 쓰지 말고, 짧고 단호하게 몰아붙여.`,
  coach: `너는 냉정한 행동경제학 코치야. 감정 배제하고, 사용자의 자기합리화 패턴을 데이터/논리로 반박하듯 차갑게 짚어. "그건 핑계고 실제로는..." 같은 화법을 써.`,
  mom: `너는 잔소리 폭발 직전인 엄마야. "아이고 정말~", "내가 몇 번을 말했니" 같은 감탄사와 함께 애정 섞인 잔소리로 몰아붙여.`,
  friend: `너는 다정한데 은근히 사람 뼈 때리는 친구야. 부드러운 말투로 시작해서 마지막에 정곡을 찌르는 한마디를 반드시 넣어.`,
};

async function callGPT(
  transcript: string,
  targetGoal: string,
  persona: string,
  recentSummaries: string[]
): Promise<AnalysisResult> {
  const personaInstruction = PERSONA_PROMPTS[persona] || PERSONA_PROMPTS.coach;

  const systemPrompt = `${personaInstruction}

너의 임무는 사용자가 어제/오늘 설정한 목표와, 방금 아침에 뱉은 말(핑계/상태)을 대조해서 모순을 집요하게 파고드는 것이야.
반드시 이 구조를 따라:
1. 사용자가 세운 목표를 먼저 언급 ("어제는 [목표]를 한다고 해놓고")
2. 지금 한 말과의 모순을 정확히 지적 ("왜 지금 [핑계]를 대는가")
3. 페르소나 말투로 1~2문장 마무리 멘트

최근 반복 패턴이 있다면 그것도 짚어라 (예: "이번 주만 세 번째야").

반드시 아래 JSON 형식으로만 답해. 다른 텍스트 없이 JSON만:
{"type": "excuse|contradiction|repetition", "summary": "오늘 상황 요약 한 문장", "call_line": "전화로 읽을 멘트, 목표-모순-페르소나 톤 다 반영해서 2~3문장", "tone": "playful|firm"}`;

  const userPrompt = `사용자가 설정한 오늘의 목표: "${targetGoal}"
방금 아침에 녹음한 말: "${transcript}"
${recentSummaries.length > 0 ? `최근 며칠간 이 사람의 패턴: ${recentSummaries.join(' / ')}` : '(과거 기록 없음, 첫 녹음)'}`;

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
      temperature: 0.9,
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
  const { data: recent } = await supabase
    .from('voice_entries')
    .select('analysis')
    .eq('user_phone', phone)
    .not('analysis', 'is', null)
    .order('created_at', { ascending: false })
    .limit(3);

  const recentSummaries = (recent || [])
    .map(r => r.analysis?.summary)
    .filter(Boolean) as string[];

  const analysis = await callGPT(transcript, targetGoal, persona, recentSummaries);

  const delayMinutes = 1 + Math.floor(Math.random() * 5);
  const scheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000);

  await supabase
    .from('voice_entries')
    .update({
      analysis,
      call_message: analysis.call_line,
      scheduled_at: scheduledAt.toISOString(),
      call_state: 'pending',
    })
    .eq('id', entryId);
}
