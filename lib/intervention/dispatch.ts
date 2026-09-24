import { supabase } from '@/lib/supabase';
import { sendSolapiSms } from '@/lib/solapi';
import { fitInterventionSms } from '@/lib/intervention/smsFit';
import { Channel, InterventionType, channelRule } from '@/lib/intervention/interventionTypes';

// ============================================================================
// Delivery 계층 — 이미 "보내기로 결정되고 push gate까지 통과한" 개입을 실제로 발송하고 기록한다.
// 여기서는 개입 여부를 판단하지 않는다 (그건 각 엔진 + pushGate의 몫).
//
// 발송 성공 시 intervention_log에 한 줄 남긴다 — pushGate가 쿨다운/하루 상한/중복 topic을 판단할 때
// 읽는 유일한 발송 기록이다. REMINDER도 기록된다(→ 발송 후 일반 쿨다운이 다시 시작되는 근거).
// ============================================================================

export interface PushDelivery {
  userId: string;
  phone: string;
  type: InterventionType;
  channel: Extract<Channel, 'sms'>; // 현재 선제 push는 sms만 이 경로를 쓴다
  body: string; // 헤더 없는 본문
  header?: string | null; // "참견이 등장." 같은 스탬프 — 최종 조립은 solapi.composeSms()가 한 번만 한다
  reason: string; // 사람이 읽을 수 있는 개입 사유 (예: "commitment_check: 토요일 아침 운동")
  topicKey?: string | null;
  memoryId?: number | null;
  triggerEntryId?: string | null; // voice_entries.id (uuid)
}

export async function deliverPush(d: PushDelivery): Promise<{ text: string; subject?: string }> {
  const rule = channelRule(d.type, d.channel);
  if (rule === 'forbidden' || rule === 'immediate') {
    throw new Error(`[dispatch] ${d.type} + ${d.channel}는 push로 보낼 수 없음 (rule=${rule})`);
  }

 // 자동 개입 메시지는 SMS(90바이트) 전용. 넘으면 축약/재작성하고, 끝내 못 맞추면 보내지 않는다.
  // sendSolapiSms도 기본 SMS 전용이라 90바이트 초과면 Solapi 호출 전에 한 번 더 막힌다(이중 방어).
  const fitted = await fitInterventionSms(d.body, d.header);
  if (!fitted) {
    throw new Error(`[dispatch] ${d.type} 메시지를 90바이트 이하로 줄이지 못해 발송하지 않음`);
  }
  const composed = await sendSolapiSms(d.phone, fitted.body, {
    header: fitted.header,
    logTag: 'Intervention SMS',
  });

  const { error } = await supabase.from('intervention_log').insert({
    user_id: d.userId,
    trigger_entry_id: d.triggerEntryId ?? null,
    chosen_memory_id: d.memoryId ?? null,
    decision: 'intervene',
    reason: d.reason,
    channel: d.channel,
    intervention_type: d.type,
    topic_key: d.topicKey ?? null,
  });
  if (error) {
    // 이미 발송은 됐다. 기록 실패는 쿨다운이 안 걸리는 문제로 이어지므로 크게 남긴다.
    console.error('[dispatch] intervention_log 기록 실패 (발송은 완료됨):', error.message);
  }

  return { text: composed.text, subject: composed.subject };
}
