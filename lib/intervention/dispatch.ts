import { supabase } from '@/lib/supabase';
import { sendSolapiSms } from '@/lib/solapi';
import { fitInterventionSms } from '@/lib/intervention/smsFit';
import { Channel, InterventionType, channelRule } from '@/lib/intervention/interventionTypes';
import { createLetter } from '@/lib/letters';
import { hasPushSubscription, sendWebPush } from '@/lib/webPush';

// ============================================================================
// Delivery 계층 — 이미 "보내기로 결정되고 push gate까지 통과한" 개입을 실제로 발송하고 기록한다.
// 여기서는 개입 여부를 판단하지 않는다 (그건 각 엔진 + pushGate의 몫).
//
// 발송 성공 시 intervention_log에 한 줄 남긴다 — pushGate가 쿨다운/하루 상한/중복 topic을 판단할 때
// 읽는 유일한 발송 기록이다. REMINDER도 기록된다(→ 발송 후 일반 쿨다운이 다시 시작되는 근거).
// ============================================================================

export interface PushDelivery {
  userId: string;
  phone: string | null; // 앱 알림을 받을 수 있으면 없어도 된다
  type: InterventionType;
  channel: Extract<Channel, 'sms' | 'push'>; // 판단(게이트)용 채널. 실제로는 앱 알림이 되면 앱 알림, 아니면 문자로 간다.
  body: string; // 헤더 없는 본문
  header?: string | null; // "참견이 등장." 같은 스탬프 — 최종 조립은 solapi.composeSms()가 한 번만 한다
  reason: string; // 사람이 읽을 수 있는 개입 사유 (예: "commitment_check: 토요일 아침 운동")
  topicKey?: string | null;
  memoryId?: number | null;
  triggerEntryId?: string | null; // voice_entries.id (uuid)
  relatedInsightId?: number | null; // insight 콜백이면 그 insight id — 편지 탭에서 같은 발견이 두 번 보이지 않게
}

/** 이 사용자에게 먼저 찾아갈 수단이 있는지 — 앱 알림 구독이 있거나 전화번호가 있으면 true. */
export async function canReach(userId: string, phone: string | null): Promise<boolean> {
  if (phone) return true;
  return hasPushSubscription(userId);
}

export async function deliverPush(d: PushDelivery): Promise<{ text: string; subject?: string; via: 'push' | 'sms' }> {
  const rule = channelRule(d.type, d.channel);
  if (rule === 'forbidden' || rule === 'immediate') {
    throw new Error(`[dispatch] ${d.type} + ${d.channel}는 push로 보낼 수 없음 (rule=${rule})`);
  }

  // 1순위: 앱 알림(무료, 참견이 얼굴로 온다). 받을 수 있는 기기가 하나라도 있으면 문자는 보내지 않는다.
  if (await hasPushSubscription(d.userId)) {
    const pushed = await sendWebPush(d.userId, {
      title: d.header || '참견이',
      body: d.body,
      url: '/',
      tag: d.topicKey ?? undefined,
    });
    if (pushed.sent > 0) {
      await logAndLetter(d, 'push', d.body);
      return { text: d.body, via: 'push' };
    }
    // 모든 기기에서 실패(구독 만료 등) → 아래 문자로 넘어간다
  }
  if (!d.phone) {
    throw new Error(`[dispatch] ${d.type}: 앱 알림도 안 되고 전화번호도 없어 보내지 못함`);
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

  await logAndLetter(d, 'sms', fitted.body);
  return { text: composed.text, subject: composed.subject, via: 'sms' };
}

// 발송 기록(push gate가 읽는 유일한 기록) + 편지 탭에 남기기. 둘 다 실패해도 발송 결과는 그대로.
async function logAndLetter(d: PushDelivery, via: 'push' | 'sms', text: string) {
  const { error } = await supabase.from('intervention_log').insert({
    user_id: d.userId,
    trigger_entry_id: d.triggerEntryId ?? null,
    chosen_memory_id: d.memoryId ?? null,
    decision: 'intervene',
    reason: d.reason,
    channel: via,
    intervention_type: d.type,
    topic_key: d.topicKey ?? null,
  });
  if (error) {
    // 이미 발송은 됐다. 기록 실패는 쿨다운이 안 걸리는 문제로 이어지므로 크게 남긴다.
    console.error('[dispatch] intervention_log 기록 실패 (발송은 완료됨):', error.message);
  }

  // 편지 = 참견이가 먼저 꺼낸 말. 실제로 보낸 문장을 편지 탭에 남겨서 문자를 지워도 다시 볼 수 있게 한다.
  // 발송은 이미 끝났으니 편지 저장이 실패해도 발송 결과는 그대로 둔다.
  try {
    await createLetter({
      userId: d.userId,
      title: via === 'push' ? '알림으로 보낸 참견' : '문자로 보낸 참견',
      content: text,
      sourceType: d.relatedInsightId ? 'insight' : d.type === 'RETURN_MEMORY' ? 'memory_callback' : 'system',
      relatedInsightId: d.relatedInsightId ?? null,
      relatedMemoryUnitId: d.memoryId ?? null,
      metadata: { channel: via, intervention_type: d.type, topic_key: d.topicKey ?? null },
    });
  } catch (letterErr: any) {
    console.error('[dispatch] 편지 저장 실패 (발송은 완료됨):', letterErr?.message);
  }
}
