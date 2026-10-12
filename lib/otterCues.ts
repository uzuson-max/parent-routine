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
  visitSeen?: string[]; // 첫 화면 방문으로 이미 말한 것(알람 id, 물고기 id+주) — 같은 걸로 두 번 올라오지 않게
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
    localStorage.setItem(
      KEY,
      JSON.stringify({ ...m, failedSeen: (m.failedSeen ?? []).slice(-50), visitSeen: (m.visitSeen ?? []).slice(-80) })
    );
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

// ============================================================================
// 첫 화면 방문 — 수달이 심해 집에서 첫 화면(이번 달 바다)까지 헤엄쳐 올라오는 일.
// ----------------------------------------------------------------------------
// 할 일이 있을 때(실제 데이터)만 말하고, 없으면 가끔 말 없이 놀다 간다.
//   alarm    1시간 안에 울릴 알람 → 쪽지를 들고 와서 "○시 ○○ 맞지?" (알람마다 한 번)
//   old_fish 2주 넘게 안 꺼낸 생각 → 그 물고기 옆에 가서 콕 + 언제 꺼낸 건지 (물고기마다 일주일에 한 번)
//   new_fry  방금 들어온 생각 → 그 치어 옆에 와서 구경만(말 없음)
//   wander   할 일 없음 → 낮에만, 몇 분에 한 번, 물고기 하나 콕 찌르거나 조약돌 굴리다 내려감(말 없음)
// 화면에 참견이 말풍선/대답이 떠 있으면(quiet) 말하는 방문은 미룬다 — 끼어들지 않는다.
// 밤엔 놀러 오지 않는다(집에서 잔다). 알람 방문만 예외.
// ============================================================================
export type VisitKind = 'alarm' | 'old_fish' | 'new_fry' | 'wander';

export interface Visit {
  kind: VisitKind;
  key: string; // 기억용 키(alarm:12, fish:abc:2026-41 …). wander/new_fry는 기록하지 않는다.
  line: string | null;
  expression: OtterExpression;
  holding: 'none' | 'pebble' | 'note';
  targetFishId: string | null; // 옆으로 갈 물고기(계보 id, 치어 무리면 그 무리 id)
  reminderId: number | null;
}

export interface VisitState {
  night: boolean;
  quiet: boolean; // 홈에 대답/참견 말풍선이 떠 있거나 시트가 열려 있음
  sinceLastVisitMs: number; // 이번 화면에서 마지막 방문 뒤 흐른 시간(처음이면 Infinity)
  nextReminder: { id: number; title: string; at: string } | null;
  oldFish: { id: string; lastAt: string } | null; // 가장 오래 안 꺼낸, 헤엄치고 있는 생각
  newFryId: string | null; // 방금 퐁당 들어온 생각(치어/물고기 id)
  anyFishId: string | null; // 놀러 왔을 때 콕 찌를 아무 물고기
}

export const WANDER_GAP_MS = 90 * 1000; // 말 없는 방문도 1분 반에 한 번 이하
export const ALARM_SOON_MS = 60 * 60 * 1000;
export const OLD_FISH_DAYS = 14;

/** 2026-41 같은 "해-주차" — 같은 물고기 얘기는 일주일에 한 번만 */
function weekKey(now: Date): string {
  const start = Date.UTC(now.getUTCFullYear(), 0, 1);
  return `${now.getUTCFullYear()}-${Math.floor((now.getTime() - start) / (7 * DAY))}`;
}

export function pickVisit(s: VisitState, mem: OtterMemory, now: Date = new Date(), wanderRoll: number = Math.random()): { visit: Visit | null; next: OtterMemory } {
  const seen = mem.visitSeen ?? [];
  const remember = (key: string): OtterMemory => ({ ...mem, visitSeen: [...seen, key] });

  // 1) 곧 울릴 알람 — 밤이어도 온다(사용자가 직접 부탁한 시각이니까)
  if (!s.quiet && s.nextReminder) {
    const left = new Date(s.nextReminder.at).getTime() - now.getTime();
    const key = `alarm:${s.nextReminder.id}`;
    if (left > 60 * 1000 && left <= ALARM_SOON_MS && !seen.includes(key)) {
      return {
        visit: {
          kind: 'alarm',
          key,
          line: `${kstLabel(s.nextReminder.at, now)}에 “${s.nextReminder.title}” 맞지?`,
          expression: 'remember',
          holding: 'note',
          targetFishId: null,
          reminderId: s.nextReminder.id,
        },
        next: remember(key),
      };
    }
  }

  // 2) 방금 들어온 생각 — 구경만(말 없음). quiet여도 된다(말을 안 하니까).
  if (s.newFryId && s.sinceLastVisitMs > 20 * 1000) {
    return {
      visit: { kind: 'new_fry', key: '', line: null, expression: 'surprise', holding: 'none', targetFishId: s.newFryId, reminderId: null },
      next: mem,
    };
  }

  if (s.night) return { visit: null, next: mem };

  // 3) 오래 안 꺼낸 생각 — 그 물고기 옆에 가서 콕
  if (!s.quiet && s.oldFish) {
    const days = (now.getTime() - new Date(s.oldFish.lastAt).getTime()) / DAY;
    const key = `fish:${s.oldFish.id}:${weekKey(now)}`;
    if (days >= OLD_FISH_DAYS && !seen.includes(key) && s.sinceLastVisitMs > WANDER_GAP_MS) {
      return {
        visit: {
          kind: 'old_fish',
          key,
          line: `이 생각, ${agoWords(s.oldFish.lastAt, now)}에 마지막으로 꺼낸 거야.`,
          expression: 'tilt',
          holding: 'none',
          targetFishId: s.oldFish.id,
          reminderId: null,
        },
        next: remember(key),
      };
    }
  }

  // 4) 그냥 놀러 옴 — 가끔만(부르는 쪽이 몇 분마다 한 번 물어보고, 그중 절반 정도만)
  if (s.sinceLastVisitMs > WANDER_GAP_MS && wanderRoll < 0.5) {
    return {
      visit: {
        kind: 'wander',
        key: '',
        line: null,
        expression: 'base',
        holding: s.anyFishId ? 'none' : 'pebble',
        targetFishId: s.anyFishId,
        reminderId: null,
      },
      next: mem,
    };
  }
  return { visit: null, next: mem };
}
