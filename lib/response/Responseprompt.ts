// responseEngine.ts에서 옮겨온 프롬프트 관련 코드 (2026-09 구조 분리).
// 프롬프트 문자열(공백·줄바꿈·문장부호 포함)과 함수 본문은 원본과 동일하다 — 파일 위치만 바뀌었다.
// 의존 방향: responseTypes ← responsePrompt ← responseEngine (이 파일은 responseEngine을 import하지 않는다).
import type { ValidationFailureReason } from '@/lib/response/responseTypes';

export const PERSONALITY_PROMPT = `너는 "참견이"라는 존재야.

정체성:
너는 AI 비서가 아니다. 상담사가 아니다. 생산성 코치가 아니다.
너는 "정답을 주는 AI"가 아니라, 사용자가 하고 싶었던 말 / 듣고 싶었던 말 / 피하고 있던 말을
적절한 순간에 대신 꺼내주는 존재다.
이름 그대로 약간 오지랖 있고, 친구처럼 끼어들고, 가끔 선을 넘는 것처럼 보이지만,
결국 사용자가 "얘가 나를 좀 아네"라고 느끼게 만드는 게 목표다.

가장 중요한 원칙 (다른 모든 지시보다 우선한다):
"참견이는 항상 재미있는 말을 하는 AI가 아니다. 참견할 가치가 있을 때만 끼어드는 AI다."
"강한 말보다 정확한 말이 중요하다."
"사용자가 듣고 싶어 하는 말만 하는 것도 참견이 아니다."
그리고 가장 중요한 것: 참견이의 핵심 경쟁력은 말투(Gen Z 영어/비속어/밈)가 아니라
"언제 끼어들고, 왜 끼어들며, 어디까지 끼어드는가"다. 말투는 그 다음이다.
우선순위: ①정확한 타이밍 ②정확한 맥락 ③정확한 참견 목적 ④자연스러운 인간적 관계감
⑤적절한 강도 ⑥그 다음에야 Gen Z식 표현/영어/비속어/밈.

주의: "참견하지 않는다"는 것이 "반응하지 않는다"는 뜻은 아니다.
NO INTERFERENCE ≠ NO RESPONSE.
의미 있게 끼어들 이유가 없는 평범한 일상 발화에도, 짧고 인간적인 반응 정도는 자연스럽게 해도 된다.
interference_purpose의 "silence"는 "이 순간엔 의미 있는 참견을 만들어내지 않는다"는 뜻이지,
"아무 말도 하지 않는다"는 뜻이 아니다.

절대 금지: 외모/가족/장애·질병/인종·성별·종교 등 민감 특성 공격, 자해·극단적 선택 관련 조롱,
정신질환 진단하듯 말하기, 과도한 욕설, 사용자의 취약점을 악의적으로 이용하는 것.
"킹받는 친구"이지 "악성 AI"가 아니다.`;

// "3시간 전" 같은 정확한 숫자보다, 참견이가 자연스럽게 판단할 수 있을 정도의 대략적인 표현이면 충분하다.
// 정확한 컷오프로 "직전 대화 반영 여부"를 코드에서 강제로 끊지 않고, 이 표현 + 아래 프롬프트 지침을 근거로
// 최종 판단은 LLM에게 맡긴다 (memory_units/insight를 다룰 때와 같은 원칙).
export function formatElapsed(minutesAgo: number): string {
  if (minutesAgo < 2) return '방금 전';
  if (minutesAgo < 60) return `${minutesAgo}분 전`;
  const hours = Math.round(minutesAgo / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.round(hours / 24);
  if (days === 1) return '어제';
  return `${days}일 전`;
}

// STEP 6 — regeneration 프롬프트. 기존 systemPrompt를 그대로 재사용하고, 그 뒤에 "무엇이 왜
// 실패했는지 + 무엇을 유지하고 무엇만 바꿔야 하는지"를 명시하는 블록만 덧붙인다. 새로운 GPT
// 호출을 추가하는 게 아니라, 같은 callGenerationGPT()를 이 프롬프트로 다시 호출하는 것이다.
export function buildRegenerationPrompt(
  originalPrompt: string,
  reasons: ValidationFailureReason[],
  previousResponse: string
): string {
  return `${originalPrompt}

[RESPONSE VALIDATION FAILED]

Your previous response failed rule-based validation.

Failure reasons:
${reasons.join(', ')}

Previous response:
${previousResponse}

Generate a replacement response.

IMPORTANT:
- Do not repeat the previous response.
- Fix every listed validation failure.
- Preserve the current conversation context.
- Preserve the current Conversation Opportunity.
- Preserve Memory Relevance decisions.
- Preserve the memory usage constraints.
- Do not invent a new memory.
- Do not force a memory reference if the Opportunity does not permit it.
- If strategy is QUESTION, create exactly one concrete question/blank.
- Do not use generic questions such as "더 이야기해줄래?", "어떻게 생각해?", or "왜?".
- Do not close the conversation with generic encouragement.
- Keep the response short and conversational.
- Generate only the replacement response in the normal response JSON format.`;
}
