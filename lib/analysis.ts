import { supabase } from '@/lib/supabase';

interface AnalysisResult {
  type: 'excuse' | 'contradiction' | 'repetition';
  summary: string;
  call_line: string;
  tone: 'playful' | 'firm';
}

async function callGPT(transcript: string, recentSummaries: string[]): Promise<AnalysisResult> {
  const systemPrompt = `너는 사용자의 아침 음성 녹음을 듣고 "참견"하는 캐릭터야.
사용자가 무심코 뱉은 핑계, 모순된 말, 반복되는 패턴 중 하나를 정확히 짚어내야 해.
비꼬지만 애정 있는 톤으로, 1~2문장짜리 전화 멘트를 만들어.
반드시 아래 JSON 형식으로만 답해:
{"type": "excuse|contradiction|repetition", "summary": "요지 한 문장", "call_line": "전화로 읽을 멘트 1~2문장", "tone": "playful|firm"}`;

  const userPrompt = `오늘 녹음 내용: "${transcript}"
${recentSummaries.length > 0 ? `최근 며칠간 이 사람이 한 말 요약: ${recentSummaries.join(' / ')}` : ''}`;

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
    }),
  });

  if (!res.ok) throw new Error('분석 실패: ' + (await res.text()));
  const json = await res.json();
  return JSON.parse(json.choices[0].message.content) as AnalysisResult;
}

export async function analyzeAndSchedule(entryId: string, transcript: string, phone: string) {
  // 반복 패턴 판단을 위해 같은 번호의 최근 요약 몇 개 조회
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

  const analysis = await callGPT(transcript, recentSummaries);

  const delayMinutes = 1 + Math.floor(Math.random() * 5); // 1~5분
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
