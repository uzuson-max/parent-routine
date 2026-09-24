
// ============================================================================
// 참견이 개입 모델 — "무엇 때문에 개입하는가"(InterventionType)와
// "어떤 채널로 전달할 수 있는가"(ChannelPolicy)를 분리해서 정의하는 파일.
//
// 세 가지 판단은 서로 다른 곳에서 한다 (한 GPT 호출로 합치지 않는다):
//   A. Memory Decision       — 기억할 가치가 있는가?        → memoryPipeline / retention
//   B. Intervention Decision — 지금 개입할 가치가 있는가?    → 각 엔진(interventionEngine, memoryCallbackEngine,
//                                                              insightCallbackEngine, responseEngine 화면 응답)
//   C. Delivery Decision     — 어떤 채널로, 언제 보낼 것인가? → 이 파일의 CHANNEL_POLICY + pushGate.ts
//
// PASSIVE_MEMORY 같은 타입은 두지 않는다. "개입하지 않는다(NONE)"는 기억 저장 여부와 무관하다.
// ============================================================================

export type InterventionType =
  | 'REMINDER' // 사용자가 명시적으로 "다시 알려줘"라고 요청 — 지정 시각 기준으로 발동
  | 'COMMITMENT_CHECK' // 사용자가 스스로 말한 약속 — 기한이 지난 뒤에만 결과를 확인
  | 'RETURN_MEMORY' // 새 발화/시간 흐름과 과거 기억 사이의 연결 — 참견이의 핵심 기능
  | 'FOLLOW_UP' // 사용자 반응이 있을 때만, 대화 안에서 이어지는 추가 질문
  | 'NONE'; // 개입하지 않음 (기억은 별도로 저장될 수 있음)

export type Channel = 'screen' | 'letter' | 'sms' | 'call';

// 각 (타입, 채널) 조합의 전달 규칙.
//   immediate — 사용자가 지금 앱/대화 안에 있으므로 바로 반환 가능 (push gate 대상 아님)
//   gated     — 선제적 push. pushGate(쿨다운/하루 상한/조용한 시간/중복 topic 등)를 통과해야만 발송
//   bypass    — 사용자가 직접 요청한 것이라 일반 쿨다운을 건너뜀 (단, 만료/채널 허용은 여전히 검사)
//   forbidden — 이 조합은 사용하지 않음
export type ChannelRule = 'immediate' | 'gated' | 'bypass' | 'forbidden';

export const CHANNEL_POLICY: Record<InterventionType, Record<Channel, ChannelRule>> = {
  REMINDER: {
    screen: 'forbidden', // 리마인더는 지정 시각에 앱 밖으로 찾아가는 것 — 화면 반응과는 별개
    letter: 'forbidden', // 편지는 시간 정확도가 필요한 채널이 아님
    sms: 'bypass',
    call: 'bypass', // 전화는 현재 리마인더 중심의 별도 정책. 지금 엔진은 sms만 사용한다.
  },
  COMMITMENT_CHECK: {
    screen: 'immediate',
    letter: 'gated',
    sms: 'gated',
    call: 'forbidden', // 예전 3차 SMS → 전화 승격 사다리는 폐지
  },
  RETURN_MEMORY: {
    screen: 'immediate', // "그러고 보니 예전에 제주도 한 달 살기 얘기했었잖아" — 대화 중엔 바로 가능
    letter: 'gated', // Letter Opportunity 엔진이 나중에 고를 수 있는 선택지. 지금은 자동 생성 안 함.
    sms: 'gated',
    call: 'forbidden',
  },
  FOLLOW_UP: {
    screen: 'immediate', // 사용자가 답한 대화 안에서만
    letter: 'forbidden',
    sms: 'forbidden', // 반응 없는 사용자에게 선제 발송 금지
    call: 'forbidden',
  },
  NONE: {
    screen: 'forbidden',
    letter: 'forbidden',
    sms: 'forbidden',
    call: 'forbidden',
  },
};

export function channelRule(type: InterventionType, channel: Channel): ChannelRule {
  return CHANNEL_POLICY[type][channel];
}

export function isPushChannel(channel: Channel): boolean {
  return channel === 'sms' || channel === 'call' || channel === 'letter';
}

// ---- 시간 정책 (타입이 아니라 전달/스케줄링 쪽 상수) --------------------------------------

// REMINDER: 약속 시각 몇 분 전에 알려줄지. "토요일 9시 출발" → 토요일 8시에 발송.
export const REMINDER_LEAD_MINUTES = 60;
// REMINDER: 약속 시각이 이만큼 지나도록 못 보냈으면(크론 지연 등) 버린다 — 늦은 리마인더는 소음이다.
export const REMINDER_GRACE_AFTER_EVENT_MINUTES = 30;

// COMMITMENT_CHECK: 기한이 지나고 이만큼 뒤에 결과를 묻는다 ("토요일 아침 운동" → 토요일 오후).
export const COMMITMENT_CHECK_DELAY_HOURS = 3;
// COMMITMENT_CHECK: 기한을 알 수 없는 약속은 말한 시점 + 이만큼을 기한으로 간주한다.
export const COMMITMENT_DEFAULT_DUE_HOURS = 24;
// COMMITMENT_CHECK: 기한이 지나고 이만큼이 지나면 묻지 않고 폐기한다.
export const COMMITMENT_EXPIRE_AFTER_DUE_HOURS = 72;
