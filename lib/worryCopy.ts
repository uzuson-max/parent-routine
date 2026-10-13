// lib/worryCopy.ts
// 걱정 병에서 참견이가 하는 말 — 걱정 병 탭(app/screens/WorriesScreen.tsx)에서 쓴다.
// 홈 바다(components/Sea.tsx)에도 같은 문장이 있다. 문장을 바꾸면 두 곳을 같이 바꿀 것.
// 말투 원칙: 사용자는 "니", 명령형·공손체 없이.

export type WorryAnswer = "hit" | "half" | "miss";

export const MIN_FOR_RATE = 5; // lib/worryBottles.ts와 같은 값

// 수달이 다가와서 하는 첫 마디
export function worryAsk(text: string): string {
  if (/망할|망치|망하/.test(text)) return "야. 니가 이때 망할 것 같다며.";
  if (/놓칠|늦을|늦/.test(text)) return "야. 니가 이때 늦을 것 같다며.";
  if (/안\s*올|없을|반토막|모자랄|부족/.test(text)) return "야. 니가 이때 안 될 것 같다며.";
  if (/떨어질|틀릴|실패|안\s*될|안될|못\s*할/.test(text)) return "야. 니가 이때 안 될 거라며.";
  return "야. 니가 이때 이거 걱정했잖아.";
}

export const WORRY_REACT: Record<WorryAnswer, string[]> = {
  hit: ["헐 진짜 맞았네. 이번 건 촉이 좋았다.", "맞았어? 니 촉 좀 무섭다."],
  half: ["반만 맞은 걸로 쳐줄게.", "애매하네. 반쯤으로 적어둘게."],
  miss: ["거봐. 또 빗나감.", "그렇게 걱정하더니 멀쩡했네?"],
};

export function worryVerdict(rate: number): string {
  if (rate < 30) return "니 걱정, 거의 다 헛걱정이었어.";
  if (rate < 45) return "생각보다 많이 빗나가는데?";
  if (rate < 65) return "반반이네. 동전 던지기랑 비슷해.";
  return "어… 니 걱정 꽤 잘 맞는다.";
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
