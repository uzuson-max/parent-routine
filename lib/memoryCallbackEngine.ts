

import { supabase } from '@/lib/supabase';
import { sendSolapiSms } from '@/lib/solapi';
import { PERSONALITY_PROMPT } from '@/lib/responseEngine';
import { filterConfirmedCommitments, markMemoriesReferenced } from '@/lib/memoryRetrieval';

// ============================================================================
// "기억 하나가 며칠 뒤 먼저 찾아온다" — insightCallbackEngine.ts(여러 memory_unit이 memory_links로
// 묶여 memory_insights가 된 것 기반)와 짝을 이루는, memory_units 단 하나만으로 만드는 proactive
// callback 경로. memory_insights/insightCallbackEngine.ts의 동작은 이 파일에서 전혀 건드리지 않는다 —
// 완전히 별도의 읽기 전용 조회 + 별도의 GPT 판단 단계를 새로 추가할 뿐이다.
//
// 새 테이블/새 컬럼 없음. "이미 한 번이라도 참조/발송된 적 있는가"는 memory_units의 기존 컬럼
// (last_referenced_at)을 그대로 재사용해서 판단한다 — 발송 성공 시 memoryRetrieval.ts의
// markMemoriesReferenced()를 그대로 호출해 기록한다(대화 중 실제로 언급됐을 때와 같은 필드를 쓰므로,
// 이미 대화에서 자연스럽게 언급된 기억은 다시 문자로 찾아가지 않는다는 부수 효과도 있다 — 의도된 동작).
//
// commitment은 이 경로에서 절대 다루지 않는다(쿼리에서 memory_type='commitment' 자체를 제외).
// filterConfirmedCommitments()는 그래서 이 풀에는 사실상 항상 no-op이지만, 정책을 그대로 유지하라는
// 요구사항에 따라 방어적으로 그대로 통과시킨다 — 나중에 이 함수의 판단 기준이 바뀌거나 이 파일이
// 다른 memory_type 풀에 재사용될 경우를 대비한 안전장치다.
// ============================================================================

const MIN_AGE_DAYS = 3; // 저장된 지 최소 이만큼은 지나야 "며칠 뒤 다시 찾아오는" 타이밍이 된다.
const MAX_AGE_DAYS = 10; // 이보다 오래된 건 "그때 그 얘기"로 꺼내기엔 너무 늦은 타이밍이라 후보에서 제외.
const IMPORTANCE_THRESHOLD = 0.6; // 사소한 기록까지 무조건 찾아오지 않도록 하는 1차 필터.
const CANDIDATE_POOL_LIMIT = 200; // 사용자당 1건으로 좁히기 전 단계의 안전장치.

interface MemoryCallbackCandidateRow {
  id: number;
  user_id: string;
  content: string;
  memory_type: string;
  temporal_context: string | null;
  importance: number;
  retention: string;
  status: string;
  source_entry_id: string | null;
  created_at: string;
}

export interface MemoryCallbackResult {
  memoryUnitId: number;
  userId: string;
  action: 'sent' | 'skipped_not_interesting' | 'skipped_no_phone' | 'send_failed' | 'dry_run';
  message?: string;
  error?: string;
}

async function fetchCallbackCandidates(): Promise<MemoryCallbackCandidateRow[]> {
  const now = Date.now();
  const oldestAllowed = new Date(now - MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const newestAllowed = new Date(now - MIN_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('memory_units')
    .select(
      'id, user_id, content, memory_type, temporal_context, importance, retention, status, source_entry_id, created_at'
    )
    .neq('memory_type', 'commitment') // commitment은 interventionEngine.ts 전용 — 이 경로에서는 다루지 않는다.
    .eq('status', 'open') // 발화 안에서 스스로 이미 해결됐다고 밝힌(resolved) 기억은 "그래서 어떻게 됐어?"를 물을 이유가 없다.
    .in('retention', ['permanent', 'temporary']) // "이 대화 안에서만"(contextual) 유효하거나 저장 시점에 버려지기로 한(discard) 기억은 제외.
    .is('last_referenced_at', null) // 대화 중이든 이 콜백이든, 한 번이라도 이미 꺼내 쓴 적 있으면 다시 후보로 올리지 않는다.
    .gte('importance', IMPORTANCE_THRESHOLD)
    .gte('created_at', oldestAllowed)
    .lte('created_at', newestAllowed)
    .order('importance', { ascending: false })
    .limit(CANDIDATE_POOL_LIMIT);

  if (error) {
    console.error('[memoryCallbackEngine] 후보 조회 실패:', error.message);
    return [];
  }
  return (data as MemoryCallbackCandidateRow[]) ?? [];
}

// 사용자당 하루 한 통이 원칙 — insightCallbackEngine.ts의 pickOnePerUser와 같은 발상. 후보는 이미
// importance desc로 정렬돼 있으므로, 사용자별로 처음 만나는 것(=importance가 가장 높은 것)만 남긴다.
function pickOnePerUser(candidates: MemoryCallbackCandidateRow[]): MemoryCallbackCandidateRow[] {
  const seen = new Set<string>();
  const picked: MemoryCallbackCandidateRow[] = [];
  for (const c of candidates) {
    if (seen.has(c.user_id)) continue;
    seen.add(c.user_id);
    picked.push(c);
  }
  return picked;
}

async function resolvePhone(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('user_memory')
    .select('phone_number')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('[memoryCallbackEngine] user_memory 조회 실패:', error.message);
    return null;
  }
  return data?.phone_number ?? null;
}

interface Synthesis {
  message: string;
}

/**
 * 기억 하나를 GPT에게 보여주고, 지금 먼저 문자로 꺼낼 만큼 흥미로운지 판단시킨다.
 * "있었던 일 요약/알림"이 아니라 "근데?"/"그래서?"/"그건 어떻게 됐어?"처럼, 사용자가 예전에 한 말을
 * 다시 들이미는 한마디를 만든다. found:false면 호출부는 아무것도 보내지 않는다 — 애매하면 만들지 않는
 * 쪽을 택한다(insightEngine.ts의 synthesizeInsight와 같은 원칙).
 */
async function synthesizeMemoryCallback(memory: MemoryCallbackCandidateRow): Promise<Synthesis | null> {
  const systemPrompt = `${PERSONALITY_PROMPT}

지금 너는 대화 중이 아니다. 며칠 전(또는 그 이상 전) 사용자가 지나가듯 흘린 말 하나를 혼자 들여다보고 있다.
이 기억이 지금 먼저 문자로 다시 꺼낼 만큼 흥미로운지 판단해라.

기억: (${memory.memory_type}) "${memory.content}"${
    memory.temporal_context ? ` — 당시 시점 표현: "${memory.temporal_context}"` : ''
  }

할 일: 이 기억 하나만 가지고, 참견이가 "야, 근데 그거..." 하면서 먼저 문자를 보낼 만한 한마디를 만들 수
있는지 판단해라.

중요한 원칙:
- 이건 알림이나 요약이 아니다. "~하셨습니다", "~라고 기록되어 있습니다" 같은 데이터베이스/상담사/설문조사
  말투는 절대 쓰지 마라. "계획이 어떻게 되세요?", "지금 기분이 어떠세요?" 같은 정보수집형 질문도 금지.
- 목표는 사용자가 자기가 했던 생각을 다시 한번 스스로 들여다보게 만드는 것이다 — 참견이가 판단을 내려주거나
  조언하는 게 아니다.
- 가장 참견이다운 톤은 "근데?", "그래서?", "그건 어떻게 됐어?"처럼, 예전에 한 말을 근거로 지금은 어떤지
  가볍게 캐묻는 것이다. 하지만 모든 기억에 억지로 질문을 만들어 붙이지 마라 — 질문형이 어색하면 그냥
  "그 말 아직도 생각나네." 같은 담백한 되던짐도 괜찮다. 중요한 건 형식이 아니라 "진짜 다시 궁금해서
  꺼내는 느낌"이지, 정해진 어미를 쓰는 게 아니다.
- 위 기억 하나만으로 정말 흥미로운 지점이 없다면(그냥 일상적이고 다시 꺼낼 이유가 없는 내용이면) 억지로
  만들지 말고 found:false로 답해라. 애매하면 만들지 않는 쪽을 택해라. 참견이는 아무거나 붙잡고 늘어지는
  게 아니다 — 가끔은 정말 사소한 것도 물고 늘어질 수 있지만, 그건 목적이 "사용자가 자기 생각을 다시
  바라보게 하는 것"일 때만 그렇다.
- 위 기억에 없는 사실을 지어내지 마라(날짜, 결과, 다른 사람의 반응 등 새로운 디테일 추가 금지).
- 날짜/횟수 등 데이터베이스 냄새나는 표현 금지.
- 1~2문장, SMS라 짧게 써라. 이모지는 필요할 때만 0~1개.

반드시 아래 JSON으로만 답해:
{ "found": true or false, "message": "..." or null }`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      }),
    });

    if (!res.ok) throw new Error('memory callback synthesis 실패: ' + (await res.text()));
    const json = await res.json();
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? '{}');

    if (!parsed.found || typeof parsed.message !== 'string' || !parsed.message.trim()) return null;
    return { message: parsed.message.trim() };
  } catch (err: any) {
    console.error('[memoryCallbackEngine] synthesizeMemoryCallback 실패:', err?.message);
    return null;
  }
}

/**
 * 3~10일 전에 저장된, 아직 한 번도 안 꺼낸 일반 memory_unit(commitment 제외) 중 사용자당 하나씩 골라
 * GPT가 "지금 먼저 꺼낼 만큼 흥미로운지" 판단하고, 그렇다고 답하면 Solapi SMS로 보낸다.
 * dryRun=true면 실제 발송/DB 갱신 없이 무엇을 보냈을지만 반환한다(GPT 판단 자체는 dryRun에서도 실행 —
 * interventionEngine.ts의 dryRun과 같은 원칙, 실제로 뭐가 만들어질지 미리 확인할 수 있어야 한다).
 * 절대 예외를 던지지 않는다 — 한 사용자 처리 실패가 나머지 배치에 영향을 주지 않는다.
 */
export async function sendDueMemoryCallbacks(dryRun: boolean = false): Promise<MemoryCallbackResult[]> {
  const results: MemoryCallbackResult[] = [];
  try {
    const rawCandidates = await fetchCallbackCandidates();
    if (rawCandidates.length === 0) return results;

    // filterConfirmedCommitments는 사용자 단위 호출이 전제라, user_id로 묶어서 사용자별로 통과시킨다.
    const byUser = new Map<string, MemoryCallbackCandidateRow[]>();
    for (const c of rawCandidates) {
      if (!byUser.has(c.user_id)) byUser.set(c.user_id, []);
      byUser.get(c.user_id)!.push(c);
    }

    // 프로젝트 tsconfig의 target이 es5라 Map을 for...of로 직접 도는 건 컴파일 에러가 난다
    // (downlevelIteration 필요) — memoryRetrieval.ts가 Set을 다룰 때 쓴 것과 같은 보정으로,
    // 순회 직전에만 배열로 바꾼다.
    let eligible: MemoryCallbackCandidateRow[] = [];
    for (const [userId, units] of Array.from(byUser.entries())) {
      const filtered = await filterConfirmedCommitments(userId, units);
      eligible = eligible.concat(filtered as MemoryCallbackCandidateRow[]);
    }
    // 그룹핑 과정에서 원래의 importance desc 정렬이 흐트러졌으므로 pickOnePerUser 전에 다시 정렬한다.
    eligible.sort((a, b) => b.importance - a.importance);

    const toProcess = pickOnePerUser(eligible);

    for (const c of toProcess) {
      try {
        const synthesis = await synthesizeMemoryCallback(c);
        if (!synthesis) {
          results.push({ memoryUnitId: c.id, userId: c.user_id, action: 'skipped_not_interesting' });
          continue;
        }

        if (dryRun) {
          console.log(
            `[memoryCallbackEngine][dry-run] memory_unit#${c.id} (user=${c.user_id}) → "${synthesis.message}"`
          );
          results.push({ memoryUnitId: c.id, userId: c.user_id, action: 'dry_run', message: synthesis.message });
          continue;
        }

        const phone = await resolvePhone(c.user_id);
        if (!phone) {
          console.error(`[memoryCallbackEngine] memory_unit#${c.id}: 전화번호 없음, 발송 스킵`);
          results.push({ memoryUnitId: c.id, userId: c.user_id, action: 'skipped_no_phone' });
          continue; // last_referenced_at을 건드리지 않아 다음 배치에서 번호가 생기면 다시 후보가 된다.
        }

        await sendSolapiSms(phone, synthesis.message);
        // 발송 성공 시에만 참조 처리 — 실패하면 다음 배치에서 재시도되도록 그대로 둔다.
        // 새 컬럼 없이 memory_units 기존 컬럼(last_referenced_at/reference_count)만 갱신한다.
        await markMemoriesReferenced([c.id]);
        results.push({ memoryUnitId: c.id, userId: c.user_id, action: 'sent', message: synthesis.message });
      } catch (err: any) {
        console.error(`[memoryCallbackEngine] memory_unit#${c.id} 처리 실패:`, err?.message);
        results.push({
          memoryUnitId: c.id,
          userId: c.user_id,
          action: 'send_failed',
          error: err?.message ?? String(err),
        });
      }
    }

    return results;
  } catch (err: any) {
    console.error('[memoryCallbackEngine] sendDueMemoryCallbacks 전체 실패:', err?.message);
    return results;
  }
}
