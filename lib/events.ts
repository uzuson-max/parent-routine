// lib/events.ts
import { supabase } from '@/lib/supabase';
import { scheduleEvent } from '@/lib/intervention/eventSchedule';
import type { ScheduledEvent } from '@/lib/analysis';

// ============================================================================
// 사용자가 말한 일정을 commitment_memory(kind='event')에 자동으로 저장한다 — "기억할까?"라고 묻지 않는다.
// 같은 일정을 여러 번 말해도(앞뒤 3시간 안에 이미 저장된 일정이 있으면) 한 번만 저장한다.
// 저장하면 interventionEngine이 그날 아침/끝난 뒤에 찾아간다(lib/intervention/eventSchedule.ts).
// ============================================================================

export async function saveScheduledEvent(
  userId: string,
  entryId: string,
  phone: string | null,
  ev: ScheduledEvent
): Promise<{ saved: boolean; id?: string }> {
  const at = new Date(ev.at);
  const from = new Date(at.getTime() - 3 * 60 * 60 * 1000).toISOString();
  const to = new Date(at.getTime() + 3 * 60 * 60 * 1000).toISOString();

  const { data: dup, error: dupErr } = await supabase
    .from('commitment_memory')
    .select('id')
    .eq('user_id', userId)
    .eq('kind', 'event')
    .gte('target_date', from)
    .lte('target_date', to)
    .limit(1);
  if (dupErr) throw new Error(`[events] 중복 확인 실패: ${dupErr.message}`);
  if (dup && dup.length) return { saved: false, id: (dup[0] as any).id };

  const sch = scheduleEvent(at, new Date());
  const { data, error } = await supabase
    .from('commitment_memory')
    .insert({
      voice_entry_id: entryId,
      user_id: userId,
      user_phone: phone,
      commitment: ev.what,
      fulfilled: false,
      progress_count: 0,
      kind: 'event',
      target_date: at.toISOString(),
      // 아침 알림을 못 보낼 상황이면 바로 "끝난 뒤 확인" 단계부터
      intervention_stage: sch.dayNudgeAt ? 0 : 1,
      next_intervention_at: (sch.dayNudgeAt ?? sch.checkAt).toISOString(),
    })
    .select('id')
    .single();
  if (error) throw new Error(`[events] 일정 저장 실패: ${error.message}`);
  return { saved: true, id: (data as any)?.id };
}
