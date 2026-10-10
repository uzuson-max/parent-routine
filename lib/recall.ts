// lib/recall.ts
import { supabase } from '@/lib/supabase';

// ============================================================================
// "참견이가 꺼내 온 기억" — 화면이 기억 소환 순간을 보여줄 수 있게, 응답 엔진이 실제로 쓴
// memory_unit 하나의 원문과 시각을 붙여준다.
//   - voice/upload: 녹음에 대한 대답이 과거 기억을 썼을 때(responseResult.memory_unit_id_used)
//   - user/proactive-line: 홈에 들어왔을 때 참견이가 먼저 꺼낸 기억
// 스키마 변경 없음. 읽기만 한다. 실패하면 null — 소환 연출만 빠지고 대답은 그대로 나간다.
// ============================================================================

export interface Recall {
  memory_unit_id: number;
  quote: string; // 사용자가 그때 실제로 한 말(raw_quote). 없으면 content.
  at: string; // ISO — 그 말을 한 시각
}

export async function loadRecall(memoryUnitId: number | null | undefined): Promise<Recall | null> {
  if (!memoryUnitId) return null;
  try {
    const { data, error } = await supabase
      .from('memory_units')
      .select('id, raw_quote, content, created_at')
      .eq('id', memoryUnitId)
      .maybeSingle();
    if (error || !data) return null;
    const quote = String((data as any).raw_quote || (data as any).content || '').trim();
    if (!quote) return null;
    return { memory_unit_id: (data as any).id as number, quote, at: (data as any).created_at as string };
  } catch {
    return null;
  }
}
