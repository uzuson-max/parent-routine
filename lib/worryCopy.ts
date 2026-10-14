// lib/worryCopy.ts
// 걱정 병에서 참견이가 하는 말 — 홈 바다(components/Sea.tsx)와 걱정 병 탭(app/screens/WorriesScreen.tsx)이 같이 쓴다.
// 말투 원칙
//   - 사용자는 "니", 명령형·공손체 없이, 문장 끝에 마침표 없이 (lib/casualText.ts)
//   - 걱정을 비웃지 않는다. "헛걱정", "거봐", "또 빗나감"처럼 이긴 척하는 말 금지
//   - 맞았으면 같이 아쉬워하고, 빗나갔으면 같이 안도한다. 편 드는 친구 말투

export type WorryAnswer = "hit" | "half" | "miss";

export const MIN_FOR_RATE = 5; // lib/worryBottles.ts와 같은 값

// 수달이 다가와서 하는 첫 마디 — 따지는 게 아니라 궁금해서 물어보는 느낌
export function worryAsk(text: string): string {
  if (/망할|망치|망하/.test(text)) return "야 니가 이때 망할 것 같다며\n그래서 어땠어?";
  if (/놓칠|늦을|늦/.test(text)) return "야 니가 이때 늦을 것 같다며\n그래서 어땠어?";
  if (/안\s*올|없을|반토막|모자랄|부족/.test(text)) return "야 니가 이때 모자랄 것 같다며\n그래서 어땠어?";
  if (/떨어질|틀릴|실패|안\s*될|안될|못\s*할/.test(text)) return "야 니가 이때 안 될 것 같다며\n그래서 어땠어?";
  return "야 이때 이거 걱정했었잖아\n그래서 어땠어?";
}

export const WORRY_REACT: Record<WorryAnswer, string[]> = {
  hit: ["아 진짜 그렇게 됐구나\n고생했다", "에고 맞았네\n그래도 지나갔다", "그랬구나\n그거 버틴 것도 대단한 거임"],
  half: ["반만 맞았으면 선방이지", "반쯤이면 그래도 다행이다", "아슬아슬했네\n그래도 넘겼다"],
  miss: ["오 다행이다\n괜찮았네", "걱정한 거보다 훨씬 괜찮았네", "다행이다 진짜\n이건 놔줘도 되겠다"],
};

export function worryVerdict(rate: number): string {
  if (rate < 30) return "걱정한 거 대부분 괜찮게 지나갔어";
  if (rate < 45) return "걱정한 것보다 잘 풀린 게 더 많네";
  if (rate < 65) return "반은 맞고 반은 괜찮았네";
  return "니 촉 은근 잘 맞는다";
}

// 날짜 대신 흐릿하게
export function worryWhen(iso: string): string {
  const days = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  if (days < 1) return "오늘";
  if (days < 2) return "어제";
  if (days < 7) return "며칠 전";
  if (days < 30) return "몇 주 전";
  return "한 달 전쯤";
}
