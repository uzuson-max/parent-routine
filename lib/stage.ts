// lib/stage.ts
// ============================================================================
// 강 스테이지 — "니를 찾아가는 돌다리" 1구간(7일) 설정.
// ----------------------------------------------------------------------------
// 하루에 돌 하나. 질문은 짝으로 설계돼 있고, 정해진 날(4·5·6·7일)에는
// 수달이 조개를 들고 기다리다가 "그때 니 목소리"를 꺼내 준다.
//   - 받아둔 날 → 돌아오는 날:  3→4(중요 vs 붙잡고 있는 것), 1→5(부러움 vs 버킷리스트), 3→6(바라는 나), 2→7(다짐 결산)
//   - 질문 문구/짝을 바꾸려면 이 파일만 고치면 된다(화면·API는 이걸 읽기만 한다).
// 말투: 사용자는 "니", 명령형 금지, 질문으로 끝. 매운맛도 반말 질문형.
// 문장(10-21): 말 걸듯 한 문장으로. 막힐 때만 괄호로 살짝 돕기. "녹음해둔다" 같은 기계 멘트·날짜 표현 금지.
// ============================================================================

export const STAGE_ID = "river1";
export type StageTone = "mild" | "spicy";

export interface StageDay {
  day: number;
  // 받는 것 — 화면엔 안 보임(설계용 메모)
  what: string;
  question: Record<StageTone, string>;
  // 같은 날 이어서 묻는 두 번째 질문(6일차: 남이 보는 나 → 듣고 싶은 소개)
  followUp?: Record<StageTone, string>;
  // 이 날 답하고 나면 꺼내 줄 과거 목소리(일차). 없으면 돌아오는 순간 없음.
  recall?: number[];
  // 목소리 앞에 수달이 하는 말(고정 문구). recall 순서대로 목소리 사이사이에 들어간다.
  intro?: Record<StageTone, string[]>;
  // 마지막 한마디를 AI가 만들 때 줄 지시
  outroGuide?: string;
  // 엔진 기억에 저장할 때 붙일 의미(질문 맥락). [첫 질문, 두 번째 질문]
  memoryLabel: [string, string?];
  // 앵커 — 이 대답에서 나온 기억은 이 중요도 밑으로 내려가지 않는다(홈 바다·편지에서 더 자주 돌아오게)
  importanceFloor: number;
}

export const STAGE_DAYS: StageDay[] = [
  {
    day: 1,
    memoryLabel: ["언젠가 해보고 싶다고 꼽은 것"],
    importanceFloor: 0.85,
    what: "언젠가 하고 싶은 것",
    question: {
      mild: "너 혹시 \"언젠가 이건 꼭 해본다\" 싶은 버킷리스트 같은 거 있어? (바로 안 떠오르면 눈 감고 잠깐 생각해 보고 말해줘~)",
      spicy: "너 혹시 \"언젠가 꼭 해본다\"고 말만 하는 버킷리스트 같은 거 있어? (안 떠오르면 눈 감고 잠깐 생각해 보고 말해줘~)",
    },
  },
  {
    day: 2,
    memoryLabel: ["이번 주 안에 꼭 하겠다고 한 것(본인 예측)"],
    importanceFloor: 0.7,
    what: "이번 주 안에 할 것(예측)",
    question: {
      mild: "이번 주에 \"이건 진짜 해야지!\" 싶은 일 있어? 딱 하나만 다짐해 볼래?",
      spicy: "이번 주엔 \"이건 진짜 한다!\" 싶은 거 있어? 딱 하나만 걸어볼래?",
    },
  },
  {
    day: 3,
    memoryLabel: ["인생에서 가장 중요하다고 꼽은 가치와 그 이유"],
    importanceFloor: 0.9,
    what: "인생에서 가장 중요한 가치 + 왜",
    question: {
      mild: "니 인생에서 제일 중요한 게 뭐야? 왜 그게 제일 중요하다고 생각했어?",
      spicy: "니 인생에서 제일 중요한 게 뭐야? 왜 하필 그거야?",
    },
  },
  {
    day: 4,
    memoryLabel: ["요즘 자기도 모르게 붙잡고 있는 것(시간·돈·생각)"],
    importanceFloor: 0.75,
    what: "요즘 붙잡고 있는 것(집착)",
    question: {
      mild: "요즘 너도 모르게 자꾸 붙잡고 있는 거 있어? 시간이든 돈이든 생각이든.",
      spicy: "요즘 너도 모르게 집착하고 있는 거 있지? 시간이든 돈이든 생각이든.",
    },
    recall: [3],
    intro: {
      mild: ["잠깐. 저번에 니가 이렇게 말했거든."],
      spicy: ["근데 이거 기억나? 니가 제일 중요하다던 거."],
    },
    outroGuide:
      "3일차 답(제일 중요한 가치)과 오늘 답(요즘 붙잡고 있는 것)을 나란히 놓고 한마디. 둘이 어긋나면 그 틈을 짚고, 맞닿아 있으면 놀리지 말고 '오 그건 맞네' 하고 인정. 돈·건강·돌봄 같은 현실 사정은 게으름으로 몰지 않는다.",
  },
  {
    day: 5,
    memoryLabel: ["요즘 잘돼서 부러운 사람과 부러운 점"],
    importanceFloor: 0.75,
    what: "요즘 부러운 사람",
    question: {
      mild: "요즘 솔직히 잘돼서 좀 배 아픈 사람 있어? 아는 사람이든 아니든. 뭐가 그렇게 부러웠어?",
      spicy: "요즘 잘나가서 솔직히 배 아픈 사람 있지? 아는 사람이든 아니든. 뭐가 그렇게 부러웠어?",
    },
    recall: [1],
    intro: {
      mild: ["음… 첫날 니가 이랬거든."],
      spicy: ["부럽다며~ 근데 첫날 니가 뭐랬더라."],
    },
    outroGuide:
      "1일차 답(버킷리스트)과 오늘 답(부러운 사람)을 연결. 부러운 게 결국 니가 미루는 그거인지 묻는다. 둘이 전혀 관련 없으면 억지로 잇지 말고 '이건 또 다른 얘기네' 정도로 솔직하게.",
  },
  {
    day: 6,
    memoryLabel: ["남들이 자신을 소개할 거라 예상한 말", "듣고 싶은 자기소개"],
    importanceFloor: 0.85,
    what: "남이 보는 나 + 듣고 싶은 나",
    question: {
      mild: "너를 아는 친구가 다른 사람한테 너를 소개하는 중이야. 그 친구가 뭐라고 소개할 것 같아?",
      spicy: "너 없을 때 친구가 누구한테 너를 소개하는 중이야. 뭐라고 할 것 같아? 솔직하게.",
    },
    followUp: {
      mild: "그 친구가 진짜 그렇게 소개할 것 같아? 혹시 \"이렇게 소개해 줬으면 좋겠다\" 싶은 부분도 있어?",
      spicy: "ㅋㅋ진짜 그렇게 말할 것 같아? 그럼 \"이렇게 소개해 줘!\" 싶은 건 뭐야?",
    },
    recall: [3],
    intro: {
      mild: ["잠깐, 저번에 니가 제일 중요하다고 한 거 기억나?"],
      spicy: ["근데 니가 제일 중요하다던 거, 이거였잖아."],
    },
    outroGuide:
      "오늘 두 대답(남들이 할 소개 vs 듣고 싶은 소개)의 차이를 짚고, 듣고 싶은 소개가 3일차 가치와 닮았으면 그 연결을 말한다. 실제 남들의 생각을 아는 척하지 않는다.",
  },
  {
    day: 7,
    memoryLabel: ["일주일 전 다짐을 어떻게 했는지 돌아본 이야기"],
    importanceFloor: 0.85,
    what: "이번 주 다짐 결과 — 일주일 결산",
    question: {
      mild: "이번 주에 \"이건 진짜 해야지\" 했던 거 있잖아. 어떻게 됐어? 했든 못 했든 그 얘기 해줘.",
      spicy: "이번 주에 \"진짜 한다!\" 했던 거 있잖아. 어떻게 됐어? 했든 못 했든 들어볼게.",
    },
    recall: [2],
    intro: {
      mild: ["잠깐, 그때 니가 이렇게 다짐했거든."],
      spicy: ["근데 그때 니가 뭐라고 다짐했더라~"],
    },
    outroGuide:
      "2일차 다짐과 오늘 이야기를 나란히 놓고 한마디. 했으면 진심으로 인정하고, 못 했으면 가볍게 놀리되 현실 사정(돈·건강·돌봄·일)은 게으름으로 몰지 않는다(했는지 단정하지 말고 오늘 대답을 따른다). 일주일을 마무리하는 느낌으로, 질문은 하나 이하.",
  },
];

export const STAGE_LENGTH = STAGE_DAYS.length;

export function stageDay(day: number): StageDay | undefined {
  return STAGE_DAYS.find((d) => d.day === day);
}

// 하루 하나 — 한국 시간 기준 날짜(YYYY-MM-DD)
export function kstDate(iso: string | Date): string {
  const t = typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
  return new Date(t + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// 돌아오는 순간 — 말풍선과 목소리를 번갈아 재생하는 조각들.
// voice: day(강 N일차 대답) 또는 entryId(바다에 던져둔 자유 녹음 — 엔진 기억이 찾아낸 것). label은 화면에 붙는 이름.
export type ReturnSegment =
  | { kind: "say"; text: string }
  | { kind: "voice"; day?: number; entryId?: string; label?: string; quote?: string };

// 엔진(lib/memoryPipeline.ts)에 넘기는 질문 맥락
export interface StageMemoryContext {
  question: string;
  label: string;
  importanceFloor: number;
}

export function stageMemoryContext(day: number, part: number): StageMemoryContext | null {
  const cfg = stageDay(day);
  if (!cfg) return null;
  const label = part === 2 ? cfg.memoryLabel[1] : cfg.memoryLabel[0];
  const question = part === 2 ? cfg.followUp?.mild : cfg.question.mild;
  if (!label || !question) return null;
  return { question, label, importanceFloor: cfg.importanceFloor };
}
