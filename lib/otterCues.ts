// lib/otterCues.ts
// ============================================================================
// 참견이(수달)가 언제, 어떻게 반응할지 — 한 곳에서만 정한다. 화면 컴포넌트는 이벤트만 넘기고 결과를 그린다.
// ----------------------------------------------------------------------------
// 원칙
//   1) 실제 상태에서만 말한다. 저장 안 된 걸 아는 척하지 않고, 새 인사이트를 지어내지 않는다.
//      (기억 회상은 기존 경로 그대로 — 홈 말풍선/기억 캡슐이 서버 데이터로만 한다. 여기서 만들지 않는다.)
//   2) 기능 안내는 처음 한 번만. 이미 쓴 기능은 다시 설명하지 않는다(기기에 기억).
//   3) 할 말 없으면 조용히. 대부분의 반응은 표정/움직임만이고 말은 null이다.
//   4) AI를 부르지 않는다. 전부 규칙 + 이미 있는 데이터.
//   5) 출석·연속 기록·개수 자랑·평가 없음.
// 말투: 반말, 명령형 종결/과공손체 없음(질문형·제안형 "~해도 돼"·혼잣말).
// 테스트: scripts/test-otter-cues.ts
// ============================================================================
import type { OtterExpression } from '@/components/Otter';
import { kstLabel } from '@/lib/reminders/rules';

export interface OtterCue {
  expression: OtterExpression;
  line: string | null; // null = 말 없이 표정/움직임만
  ms: number; // 얼마나 보여줄지
  motion?: 'nod' | 'hop' | 'peek' | 'look'; // 바깥 CSS가 쓰는 짧은 움직임 이름
}

export type OtterEvent =
  | { type: 'home_first_visit' }
  | { type: 'note_saved' }
  | { type: 'note_reopened'; createdAt: string; previousOpenedAt: string | null }
  | { type: 'reminder_set'; remindAt: string; channel: 'push' | 'sms' | null }
  | { type: 'reminder_failed'; id: number; title: string }
  | { type: 'deep_arrive'; night: boolean; nextReminder: { title: string; at: string } | null }
  | { type: 'idle' };

// ---- 기기에 남기는 "이미 겪은 것" — 첫 안내를 한 번만 하기 위한 기록 ----
const KEY = 'ganseobi_otter_v1';
export interface OtterMemory {
  homeIntro?: boolean;
  firstNote?: boolean;
  firstReminder?: boolean;
  failedSeen?: number[];
  lastGreetAt?: number;
}

export function loadOtterMemory(): OtterMemory {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as OtterMemory) : {};
  } catch {
    return {};
  }
}

export function saveOtterMemory(m: OtterMemory) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...m, failedSeen: (m.failedSeen ?? []).slice(-50) }));
  } catch {
    /* 못 남기면 다음에 한 번 더 말할 뿐 */
  }
}

const DAY = 86_400_000;
export const GREET_GAP_MS = 6 * 60 * 60 * 1000; // 심해 인사는 6시간에 한 번 이하
export const REOPEN_GAP_DAYS = 14; // 2주 넘게 안 본 메모를 열었을 때만 "오랜만이네"

/** 얼마 전인지 — 숫자를 들이밀지 않는 말로 */
export function agoWords(iso: string, now: Date): string {
  const days = (now.getTime() - new Date(iso).getTime()) / DAY;
  if (days < 21) return '2주도 더 전';
  if (days < 45) return '한 달 전쯤';
  if (days < 75) return '두 달 전쯤';
  return '꽤 오래전';
}

/**
 * 이벤트 → 반응. mem은 읽기만 하고, 바뀐 기록을 next로 돌려준다(저장은 부르는 쪽이 saveOtterMemory로).
 * 반응할 게 없으면 cue: null.
 */
export function decideCue(ev: OtterEvent, mem: OtterMemory, now: Date = new Date()): { cue: OtterCue | null; next: OtterMemory } {
  switch (ev.type) {
    case 'home_first_visit': {
      if (mem.homeIntro) return { cue: null, next: mem };
      return {
        cue: { expression: 'tilt', line: '말로 하기 애매한 건 위에 적어둬도 돼.', ms: 5200, motion: 'peek' },
        next: { ...mem, homeIntro: true },
      };
    }
    case 'note_saved': {
      if (!mem.firstNote) {
        return {
          cue: { expression: 'laugh', line: '띄워놨어. 여기 계속 떠 있어.', ms: 3200, motion: 'hop' },
          next: { ...mem, firstNote: true },
        };
      }
      // 두 번째부터는 말 없이 끄덕 — 저장됐다는 건 목록에 새 쪽지가 떨어지는 걸로 보인다.
      return { cue: { expression: 'base', line: null, ms: 1200, motion: 'nod' }, next: mem };
    }
    case 'note_reopened': {
      const last = ev.previousOpenedAt && new Date(ev.previousOpenedAt) > new Date(ev.createdAt) ? ev.previousOpenedAt : ev.createdAt;
      const gapDays = (now.getTime() - new Date(last).getTime()) / DAY;
      if (gapDays < REOPEN_GAP_DAYS) return { cue: null, next: mem };
      const what = ev.previousOpenedAt ? '마지막으로 본 게' : '이거 띄운 게';
      return {
        cue: { expression: 'surprise', line: `어, ${what} ${agoWords(last, now)}네.`, ms: 3600, motion: 'look' },
        next: mem,
      };
    }
    case 'reminder_set': {
      const when = kstLabel(ev.remindAt, now);
      if (!mem.firstReminder) {
        const how = ev.channel === 'sms' ? ' 문자로 갈게.' : ev.channel === 'push' ? ' 알림으로 갈게.' : '';
        return {
          cue: { expression: 'remember', line: `${when}에 찾아갈게.${how}`, ms: 4200, motion: 'hop' },
          next: { ...mem, firstReminder: true },
        };
      }
      return { cue: { expression: 'base', line: null, ms: 1200, motion: 'nod' }, next: mem };
    }
    case 'reminder_failed': {
      const seen = mem.failedSeen ?? [];
      if (seen.includes(ev.id)) return { cue: null, next: mem };
      return {
        cue: { expression: 'surprise', line: `“${ev.title}” 알람, 그때 못 알려줬어.`, ms: 4800, motion: 'look' },
        next: { ...mem, failedSeen: [...seen, ev.id] },
      };
    }
    case 'deep_arrive': {
      // 심해에 내려올 때마다 인사하지 않는다 — 6시간에 한 번 이하.
      if (mem.lastGreetAt && now.getTime() - mem.lastGreetAt < GREET_GAP_MS) return { cue: null, next: mem };
      const soon = ev.nextReminder && new Date(ev.nextReminder.at).getTime() - now.getTime() < 3 * 60 * 60 * 1000;
      const line = soon && ev.nextReminder
        ? `${kstLabel(ev.nextReminder.at, now)}에 “${ev.nextReminder.title}” 알려줄 거 있어.`
        : ev.night
        ? '…음? 이 시간에 왔어?'
        : '어, 왔어?';
      return { cue: { expression: 'surprise', line, ms: 2800, motion: 'hop' }, next: { ...mem, lastGreetAt: now.getTime() } };
    }
    case 'idle':
    default:
      return { cue: null, next: mem };
  }
}

export interface DeepFacts {
  fishCount: number;
  stage: number;
  noteCount: number | null; // 모르면 null(아직 못 불러옴)
  nextReminder: { title: string; at: string } | null;
}

/**
 * 심해에서 참견이를 눌렀을 때 할 수 있는 말 — 지금 실제 상태로만 만든다. 같은 말을 연달아 하지 않고,
 * 할 말을 다 하면 n이 넘어가도 더 만들어내지 않는다(null → 말 없이 웃기만).
 */
export function deepTapLines(f: DeepFacts, now: Date = new Date()): string[] {
  const lines: string[] = [];
  if (f.nextReminder) lines.push(`${kstLabel(f.nextReminder.at, now)}에 “${f.nextReminder.title}” 알려줄게.`);
  if (f.fishCount > 0) lines.push('위에 헤엄치는 애들, 전부 니가 한 생각이야.');
  else lines.push('위에 아직 물고기가 없네. 뭐라도 말해도 돼.');
  if (f.noteCount !== null && f.noteCount > 0) lines.push('적어둔 쪽지들은 위에 떠 있어.');
  lines.push(f.stage >= 2 ? '이 조약돌? 니가 다시 꺼낸 얘기들이야.' : '같은 얘기를 다른 날 또 하면, 그게 조약돌이 돼.');
  return lines;
}

export function deepTapCue(f: DeepFacts, tapIndex: number, now: Date = new Date()): OtterCue {
  const lines = deepTapLines(f, now);
  if (tapIndex < lines.length) return { expression: 'tilt', line: lines[tapIndex], ms: 3400 };
  return { expression: 'laugh', line: tapIndex === lines.length ? '간지러워.' : null, ms: 1600 };
}
