// lib/worryBottles.ts
// ============================================================================
// 걱정 병 — "니 걱정, 진짜 몇 %나 맞았어?"
// ----------------------------------------------------------------------------
// 1) 녹음이 끝나면(app/api/voice/upload → 대답을 돌려준 뒤 뒤에서) 그 말에 "나중에 맞았는지 확인할 수 있는
//    걱정"이 있는지 본다. 걱정처럼 보이는 말투가 없으면 AI를 부르지 않는다(대부분의 녹음은 여기서 끝).
// 2) 있으면 한 개만 골라 병에 담는다(worry_bottles). 사용자에게 따로 묻지 않는다.
// 3) 병은 홈 바다 수면 위에 떠 있다가, 확인할 때가 되면 흔들린다. 누르면 참견이가 "그래서 망했어?"
//    하고 묻고, 맞았어 / 반쯤 / 빗나갔어 중 하나로 답한다. "아직 몰라"면 이틀 뒤에 다시 묻는다.
// 4) 답이 5개 이상 모이면 적중률이 나온다(반쯤 = 0.5개로 센다). 바다에는 숫자를 띄우지 않고,
//    답한 직후 병 카드 안에서만 보여준다.
// 알림·문자는 보내지 않는다. 건강·관계·돈 같은 민감한 걱정은 담지 않는다.
// SQL: docs/sql/2026-10-13_worry_bottles.sql
// ============================================================================
import { supabase } from '@/lib/supabase';

const DAY = 24 * 60 * 60 * 1000;
const KST = 9 * 60 * 60 * 1000;
const MAX_OPEN = 6; // 동시에 떠 있는 병은 이만큼까지 — 바다가 병으로 덮이지 않게
export const MIN_FOR_RATE = 5; // 답이 이만큼 모여야 적중률을 보여준다

export type WorryResult = 'hit' | 'half' | 'miss';

export interface WorryBottle {
  id: number;
  worry: string;
  createdAt: string;
  dueAt: string;
}

export interface OpenedBottle {
  id: number;
  worry: string;
  result: WorryResult;
  createdAt: string;
  answeredAt: string | null;
}

export interface WorryStats {
  done: number;
  hit: number;
  half: number;
  miss: number;
  rate: number | null; // done < MIN_FOR_RATE면 null
}

// 걱정·예측처럼 들리는 말투. 여기 안 걸리면 AI를 부르지 않는다(비용 0).
const WORRY_HINT =
  /(듯|것\s*같|거\s*같|까\s*봐|망할|망치|망하|놓칠|못\s*할|안\s*될|안될|걱정|어떡|어떻게\s*하지|큰일|늦을|떨어질|안\s*올|틀릴|실패|모자랄|부족할|터질|불안|무서)/;

function tableMissing(err: { code?: string; message?: string } | null): boolean {
  return !!err && (err.code === '42P01' || /does not exist|schema cache/i.test(err.message ?? ''));
}

// 확인 시점 — "며칠 뒤 저녁 6시(KST)". 너무 가까우면(6시간 안) 하루 더 미룬다.
function dueFromDays(days: number, now = Date.now()): Date {
  const d = Math.max(1, Math.min(30, Math.round(days)));
  const kstNow = new Date(now + KST);
  const kstDay = Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate());
  let due = kstDay + d * DAY + 18 * 60 * 60 * 1000 - KST;
  if (due - now < 6 * 60 * 60 * 1000) due += DAY;
  return new Date(due);
}

const SYSTEM_PROMPT = `너는 사용자의 혼잣말 녹음에서 "나중에 맞았는지 확인할 수 있는 걱정" 하나를 고르는 일을 한다.
걱정 = 안 좋은 일이 일어날 거라는 사용자 자신의 예측. 예: "내일 발표 망할 듯", "막차 놓칠 것 같아", "이번 달 예약 반토막 날 듯".

고르는 조건 (하나라도 어긋나면 null):
- 사용자가 실제로 그렇게 될까 봐 말한 것. 계획, 할 일, 이미 일어난 일, 단순한 감정·불평은 아니다.
- 며칠~한 달 안에 사용자가 "맞았다/아니다"로 답할 수 있는 구체적인 일이다.
- 민감한 걱정은 절대 고르지 않는다: 건강·병·몸·체중, 누군가의 죽음, 연애·이별·가족 갈등, 빚·생계, 자해, 사고·범죄·법적 문제, 시험 합격처럼 인생이 걸린 결과.
- 걱정이 여러 개면 가장 가볍고 구체적인 것 하나.

worry: 사용자가 한 말을 최대한 그대로, 반말로, 25자 안쪽. 새로운 내용을 덧붙이지 않는다.
check_in_days: 결과를 알 수 있는 날까지 며칠인지(1~30). "내일"이면 1, "이번 주/주말"이면 2~5, "이번 달"이면 남은 날 정도, 모르겠으면 3.

JSON만 답한다: {"worry": string | null, "check_in_days": number}`;

export async function extractWorry(transcript: string): Promise<{ worry: string; days: number } | null> {
  const text = transcript.trim();
  if (text.replace(/\s/g, '').length < 6 || !WORRY_HINT.test(text)) return null;
  if (!process.env.OPENAI_API_KEY) return null;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      max_tokens: 80,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text.slice(0, 1500) },
      ],
    }),
  });
  if (!res.ok) throw new Error('걱정 고르기 실패: ' + (await res.text()).slice(0, 200));
  const json = await res.json();
  let parsed: any = null;
  try {
    parsed = JSON.parse(json?.choices?.[0]?.message?.content ?? 'null');
  } catch {
    return null;
  }
  const worry = typeof parsed?.worry === 'string' ? parsed.worry.trim().replace(/^["“']|["”']$/g, '') : '';
  if (worry.length < 2) return null;
  const days = Number(parsed?.check_in_days);
  return { worry: worry.slice(0, 40), days: Number.isFinite(days) ? days : 3 };
}

// 녹음 하나 → 걱정이 있으면 병 하나. 실패해도 조용히(대답·기억에는 영향 없음).
export async function createWorryBottleFromEntry(userId: string, entryId: string, transcript: string): Promise<void> {
  if (!transcript || transcript === '(음성 변환 실패)') return;
  if (!WORRY_HINT.test(transcript)) return;

  const { count, error: countErr } = await supabase
    .from('worry_bottles')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('result', null);
  if (countErr) {
    if (tableMissing(countErr)) return; // SQL 실행 전 — 기능이 없는 것처럼 지나간다
    throw new Error(countErr.message);
  }
  if ((count ?? 0) >= MAX_OPEN) return;

  const picked = await extractWorry(transcript);
  if (!picked) return;

  const { error } = await supabase.from('worry_bottles').insert({
    user_id: userId,
    entry_id: entryId,
    worry: picked.worry,
    due_at: dueFromDays(picked.days).toISOString(),
  });
  if (error && error.code !== '23505') throw new Error(error.message); // 23505 = 이미 이 녹음의 병이 있음
  if (!error) console.log(`[worry] 병 하나 띄움 (${picked.days}일 뒤): ${picked.worry}`);
}

export function statsFrom(results: WorryResult[]): WorryStats {
  const hit = results.filter((r) => r === 'hit').length;
  const half = results.filter((r) => r === 'half').length;
  const miss = results.filter((r) => r === 'miss').length;
  const done = hit + half + miss;
  return {
    done,
    hit,
    half,
    miss,
    rate: done >= MIN_FOR_RATE ? Math.round(((hit + half * 0.5) / done) * 100) : null,
  };
}

export async function loadWorries(
  userId: string
): Promise<{ bottles: WorryBottle[]; stats: WorryStats; opened: OpenedBottle[] } | null> {
  const [open, answered, recent] = await Promise.all([
    supabase
      .from('worry_bottles')
      .select('id, worry, created_at, due_at')
      .eq('user_id', userId)
      .is('result', null)
      .order('due_at', { ascending: true })
      .limit(MAX_OPEN),
    supabase.from('worry_bottles').select('result').eq('user_id', userId).not('result', 'is', null).limit(2000),
    // 걱정 병 탭의 "해변" — 열어본 병 최근 것부터
    supabase
      .from('worry_bottles')
      .select('id, worry, result, created_at, answered_at')
      .eq('user_id', userId)
      .not('result', 'is', null)
      .order('answered_at', { ascending: false, nullsFirst: false })
      .limit(30),
  ]);
  if (open.error || answered.error || recent.error) {
    if (tableMissing(open.error) || tableMissing(answered.error) || tableMissing(recent.error)) return null;
    throw new Error((open.error ?? answered.error ?? recent.error)!.message);
  }
  return {
    bottles: (open.data ?? []).map((r: any) => ({ id: r.id, worry: r.worry, createdAt: r.created_at, dueAt: r.due_at })),
    stats: statsFrom((answered.data ?? []).map((r: any) => r.result as WorryResult)),
    opened: (recent.data ?? []).map((r: any) => ({
      id: r.id,
      worry: r.worry,
      result: r.result as WorryResult,
      createdAt: r.created_at,
      answeredAt: r.answered_at,
    })),
  };
}

// 답하기. later = "아직 몰라" → 이틀 뒤에 다시. 남의 병이거나 이미 답한 병이면 false.
export async function answerWorry(userId: string, id: number, answer: WorryResult | 'later'): Promise<boolean> {
  const patch =
    answer === 'later'
      ? { due_at: dueFromDays(2).toISOString() }
      : { result: answer, answered_at: new Date().toISOString() };
  const { data, error } = await supabase
    .from('worry_bottles')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .is('result', null)
    .select('id');
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

// 걱정 병 탭에서 직접 던지기 — 사용자가 적은 걱정을 그대로 담는다(AI 호출 없음).
// days: 1(내일) / 5(이번 주) / 30(한 달 뒤). 떠 있는 병이 너무 많으면 false.
export async function createWorryBottle(userId: string, worry: string, days: number): Promise<'ok' | 'full'> {
  const text = worry.trim().replace(/\s+/g, ' ').slice(0, 60);
  if (text.length < 2) throw new Error('걱정이 너무 짧아');
  const { count, error: countErr } = await supabase
    .from('worry_bottles')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('result', null);
  if (countErr) throw new Error(countErr.message);
  if ((count ?? 0) >= MAX_OPEN * 2) return 'full';
  const { error } = await supabase.from('worry_bottles').insert({
    user_id: userId,
    entry_id: null,
    worry: text,
    due_at: dueFromDays(days).toISOString(),
  });
  if (error) throw new Error(error.message);
  return 'ok';
}
