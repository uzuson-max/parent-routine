import { supabase } from '@/lib/supabase';
import { PERSONALITY_PROMPT } from '@/lib/responseEngine';

// ============================================================================
// Monthly Reflection(월말정산) 레이어 — 파이프라인의 다음 단계.
//
//   memory_units(개별 기억) → memory_links(기억들 사이 연결) → memory_insights(그걸 묶어본 "관찰")
//   → 이 파일: 그 달에 쌓인 관찰들을 다시 한번 묶어서, "이번 달 너는 이런 한 달이었다" 수준의
//     리플렉션 문단 하나로 압축한다.
//
// insightEngine.ts와 같은 이유로 memory_insights를 직접 재활용하지 않고 새 테이블
// (monthly_reflections)을 둔다 — insight는 "쌓이는 대로 계속 활성 상태인 관찰 목록"이고,
// 월간 리플렉션은 "특정 달(period_start~period_end)에 못박힌 스냅샷 한 문단"이라 성격이 다르다.
// (기존 지시사항의 "월말정산용 중복 DB 금지"는 memory_units/memory_insights를 또 만들지 말라는
// 뜻이었지, 리플렉션이라는 새로운 산출물 자체를 위한 테이블을 금지한 게 아니다 — memory_insights를
// memory_units 대신 새로 만들 때와 완전히 같은 논리다.)
//
// UI는 아직 만들지 않는다. 이 파일 + app/api/cron/generate-monthly-reflection 라우트까지가
// 이번 단계의 범위 — insightEngine.ts/generate-insights 라우트가 만들어진 것과 정확히 같은 모양.
// vercel.json에는 아직 등록하지 않는다 — 월간 스케줄은 하루 단위 배치와 리스크가 다르고
// (한 번 잘못 돌면 그 달의 리플렉션을 통째로 그르칠 수 있음), 실제 스케줄링은 사용자 확인 후
// 별도 단계에서 진행한다.
//
// 이 앱에 사용자별 timezone 컬럼이 전혀 없다(user_memory 포함, 스키마 전체 확인함) — 한국어
// 서비스라 KST(UTC+9)를 암묵적으로 전제하고 있다고 보고, "그 달"의 경계도 KST 달력 기준으로
// 명시적으로 계산한다. 나중에 진짜 다지역 서비스가 되면 이 가정 자체를 재검토해야 한다.
// ============================================================================

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 리플렉션 하나를 만들려면 최소 이 개수의 insight는 있어야 한다. 너무 적으면(1개) "리플렉션"이
// 아니라 그냥 insight 재탕이 되어버린다 — insightEngine의 MIN_CLUSTER_SIZE와 같은 발상.
const MIN_INSIGHTS_FOR_REFLECTION = 2;
// 한 리플렉션에 너무 많은 insight를 다 욱여넣으면 프롬프트도 산으로 가고 문단도 나열식이 된다.
// confidence 높은 순으로 이 개수만 추려서 쓴다.
const MAX_INSIGHTS_PER_REFLECTION = 8;

export interface PeriodBounds {
  /** DB period_start/period_end(date) 컬럼에 그대로 넣을 KST 달력 기준 문자열 (YYYY-MM-DD). */
  periodStartLabel: string;
  periodEndLabel: string;
  /** memory_insights/voice_entries.created_at(timestamptz, UTC 저장) 조회용 UTC 경계. period_end는 배타적(exclusive). */
  periodStartUTC: string;
  periodEndUTC: string;
}

/**
 * referenceDate 기준 "지난 달"(KST 달력)의 경계를 계산한다. 월말정산은 항상 "막 끝난 한 달"을
 * 되돌아보는 용도라, 이번 달이 아니라 지난 달을 기본으로 삼는다 — 매달 1일에 도는 배치를 전제.
 */
export function getPreviousMonthBoundsKST(referenceDate: Date = new Date()): PeriodBounds {
  const kst = new Date(referenceDate.getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth(); // 0-indexed, "이번 달"

  // KST 달력 기준 "지난 달 1일 00:00"과 "이번 달 1일 00:00"을, UTC epoch 위에서 계산.
  const prevMonthStartKstEpoch = Date.UTC(y, m - 1, 1, 0, 0, 0);
  const thisMonthStartKstEpoch = Date.UTC(y, m, 1, 0, 0, 0);

  // 위 값은 "KST 벽시계 기준 자정"을 UTC epoch 숫자로만 표현한 것이라, 실제 UTC 타임스탬프로
  // 되돌리려면 KST_OFFSET_MS를 다시 빼야 한다 (KST가 UTC보다 9시간 빠르므로).
  const periodStartUTC = new Date(prevMonthStartKstEpoch - KST_OFFSET_MS).toISOString();
  const periodEndUTC = new Date(thisMonthStartKstEpoch - KST_OFFSET_MS).toISOString();

  const prevMonthStartKstDate = new Date(prevMonthStartKstEpoch);
  const periodStartLabel = `${prevMonthStartKstDate.getUTCFullYear()}-${String(
    prevMonthStartKstDate.getUTCMonth() + 1
  ).padStart(2, '0')}-01`;
  const thisMonthStartKstDate = new Date(thisMonthStartKstEpoch);
  const periodEndLabel = `${thisMonthStartKstDate.getUTCFullYear()}-${String(
    thisMonthStartKstDate.getUTCMonth() + 1
  ).padStart(2, '0')}-01`;

  return { periodStartLabel, periodEndLabel, periodStartUTC, periodEndUTC };
}

interface InsightForReflection {
  id: number;
  content: string;
  theme: string | null;
  confidence: number;
}

async function fetchInsightsForPeriod(
  userId: string,
  bounds: PeriodBounds
): Promise<InsightForReflection[]> {
  const { data, error } = await supabase
    .from('memory_insights')
    .select('id, content, theme, confidence, status')
    .eq('user_id', userId)
    // 사용자가 명시적으로 지운(dismissed) 관찰은 절대 월말정산에 다시 등장시키지 않는다.
    // superseded는 포함한다 — 그 달 안에서는 실제로 그렇게 판단됐던 관찰이라 그 달의 스냅샷으로는 유효하다.
    .neq('status', 'dismissed')
    .gte('created_at', bounds.periodStartUTC)
    .lt('created_at', bounds.periodEndUTC)
    .order('confidence', { ascending: false })
    .limit(MAX_INSIGHTS_PER_REFLECTION);

  if (error) {
    console.error('[monthlyReflectionEngine] 기간 내 insight 조회 실패:', error.message);
    return [];
  }
  return data ?? [];
}

async function countEntriesForPeriod(userId: string, bounds: PeriodBounds): Promise<number> {
  const { count, error } = await supabase
    .from('voice_entries')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', bounds.periodStartUTC)
    .lt('created_at', bounds.periodEndUTC);

  if (error) {
    console.error('[monthlyReflectionEngine] 기간 내 entry count 조회 실패:', error.message);
    return 0;
  }
  return count ?? 0;
}

interface Synthesis {
  found: boolean;
  content: string | null;
}

/**
 * insightEngine.ts의 synthesizeInsight()와 같은 모양의 LLM 호출. 다만 재료가 "낱개 기억들"이
 * 아니라 "이미 한 번 해석이 끝난 관찰들"이라, 여기서 또 새로운 사실을 발견하려 하지 않는다 —
 * 이번 달의 관찰들을 하나의 자연스러운 회고 문단으로 "엮는" 것만이 이 함수의 일이다.
 */
async function synthesizeMonthlyReflection(
  insights: InsightForReflection[],
  entryCount: number,
  periodLabel: string
): Promise<Synthesis> {
  const insightsBlock = insights.map((i) => `- (${i.theme ?? '관찰'}) "${i.content}"`).join('\n');

  const systemPrompt = `${PERSONALITY_PROMPT}

지금 너는 사용자와 실시간 대화 중이 아니다. 한 달(${periodLabel})이 끝나서, 그동안 참견이가
발견해뒀던 관찰들을 다시 들여다보면서 "이번 한 달, 너는 어떤 사람이었는지" 조용히 되짚어보는 중이다.

이번 달에 사용자가 참견이에게 말을 건 횟수: ${entryCount}번 (이 숫자 자체를 문단에 직접 인용하지 마라 — "몇 번 얘기했다" 식의 통계 나열은 참견이답지 않다. 그냥 얼마나 자주/드물게 얘기했는지 정도의 느낌으로만 참고해라)

이번 달 쌓인 관찰들:
${insightsBlock}

할 일: 위 관찰들을 하나로 엮어서, 이번 한 달을 돌아보는 짧은 회고 문단을 하나 만들어라.

중요한 원칙:
- 위 관찰 목록에 없는 사실을 새로 지어내지 마라. 관찰들을 "요약"하는 게 아니라 "이어서 하나의 시선으로 엮는" 것이다.
- 관찰이 서로 잘 안 엮이고 그냥 나열밖에 안 될 것 같으면, 억지로 하나의 서사를 만들지 말고 found:false로 답해라. 애매하면 안 만드는 쪽을 택해라.
- "이번 달 총 N번 대화했고 관찰이 M개 있었습니다" 같은 보고서/집계 톤 절대 금지. 다이어리를 대신 써주는 친구처럼 써라.
- 확정적 진단("너는 원래 그런 사람이다")이 아니라, 참견이가 한 달치를 쭉 보고 나서 문득 느낀 것 같은 톤 ("~하더라", "~한 달이었네", "~인가 보다 싶었어").
- 관찰들 각각을 다 언급할 필요 없다. 그 중에서도 진짜 하나로 엮이는 것들 위주로, 나머지는 과감히 버려도 된다.
- 두세 문장 정도. 너무 길게 늘어놓지 마라 — 짧고 정확한 한 문단이 낫다.

참고 예 (그대로 베끼지 말고 참고만 해라):
- 관찰들: "라면 먹을 때 계란보다 소세지를 넣는 취향이 확고하다", "고양이가 화분 근처에서 자꾸 사고를 친다"
  → 서로 안 엮이는 두 관찰 → found:false (억지로 하나의 서사를 만들지 않는다)
- 관찰들: "회사 답답할 때마다 이상하게 제주도 생각을 한다", "제주도에서 한 달 살아보고 싶다는 생각을 자주 한다", "요즘 회사 얘기를 할 때 유독 한숨이 늘었다"
  → found:true, "이번 달은 유독 회사 답답한 얘기 자주 하면서 제주도 얘기로 새는 달이었네. 진짜 한 번 가보는 건 어때?"

반드시 아래 JSON으로만 답해:
{ "found": true or false, "content": "..." or null }`;

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

    if (!res.ok) throw new Error('monthly reflection synthesis 실패: ' + (await res.text()));
    const json = await res.json();
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? '{}');

    if (!parsed.found || typeof parsed.content !== 'string' || !parsed.content.trim()) {
      return { found: false, content: null };
    }
    return { found: true, content: parsed.content.trim() };
  } catch (err: any) {
    console.error('[monthlyReflectionEngine] synthesizeMonthlyReflection 실패:', err?.message);
    return { found: false, content: null };
  }
}

export interface MonthlyReflectionResult {
  action: 'generated' | 'insufficient_data' | 'skipped_already_generated' | 'error';
  reflectionId?: number;
  insightCount?: number;
  reason?: string;
}

/**
 * 사용자 한 명에 대해, 주어진 기간(bounds)의 월간 리플렉션을 생성한다.
 * 이미 그 달(period_start)에 대해 status='generated'인 행이 있으면 재생성하지 않는다
 * (insightEngine의 클러스터 dedup과 같은 이유 — 불필요한 LLM 재호출 방지).
 * 절대 예외를 밖으로 던지지 않는다.
 */
export async function generateMonthlyReflectionForUser(
  userId: string,
  bounds: PeriodBounds,
  dryRun: boolean = false
): Promise<MonthlyReflectionResult> {
  try {
    const { data: existing, error: existErr } = await supabase
      .from('monthly_reflections')
      .select('id, status')
      .eq('user_id', userId)
      .eq('period_start', bounds.periodStartLabel)
      .maybeSingle();

    if (existErr) {
      console.error('[monthlyReflectionEngine] 기존 리플렉션 조회 실패 (계속 진행):', existErr.message);
    } else if (existing && existing.status === 'generated') {
      return { action: 'skipped_already_generated', reflectionId: existing.id };
    }

    const insights = await fetchInsightsForPeriod(userId, bounds);

    if (insights.length < MIN_INSIGHTS_FOR_REFLECTION) {
      if (!dryRun) {
        await supabase.from('monthly_reflections').upsert(
          {
            user_id: userId,
            period_start: bounds.periodStartLabel,
            period_end: bounds.periodEndLabel,
            insight_ids: insights.map((i) => i.id),
            status: 'insufficient_data',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,period_start' }
        );
      }
      return {
        action: 'insufficient_data',
        insightCount: insights.length,
        reason: `insight ${insights.length}개로 최소 기준(${MIN_INSIGHTS_FOR_REFLECTION}) 미달`,
      };
    }

    const entryCount = await countEntriesForPeriod(userId, bounds);
    const synthesis = await synthesizeMonthlyReflection(insights, entryCount, bounds.periodStartLabel);

    if (!synthesis.found || !synthesis.content) {
      if (!dryRun) {
        await supabase.from('monthly_reflections').upsert(
          {
            user_id: userId,
            period_start: bounds.periodStartLabel,
            period_end: bounds.periodEndLabel,
            insight_ids: insights.map((i) => i.id),
            status: 'insufficient_data',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,period_start' }
        );
      }
      return {
        action: 'insufficient_data',
        insightCount: insights.length,
        reason: 'LLM이 관찰들을 하나의 서사로 엮을 수 없다고 판단함(found:false)',
      };
    }

    if (dryRun) {
      return { action: 'generated', insightCount: insights.length, reason: '(dryRun — 실제로 저장하지 않음)' };
    }

    const { data: upserted, error: upsertErr } = await supabase
      .from('monthly_reflections')
      .upsert(
        {
          user_id: userId,
          period_start: bounds.periodStartLabel,
          period_end: bounds.periodEndLabel,
          content: synthesis.content,
          insight_ids: insights.map((i) => i.id),
          status: 'generated',
          generated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,period_start' }
      )
      .select('id')
      .single();

    if (upsertErr || !upserted) {
      console.error('[monthlyReflectionEngine] monthly_reflections upsert 실패:', upsertErr?.message);
      return { action: 'error', reason: upsertErr?.message };
    }

    return { action: 'generated', reflectionId: upserted.id, insightCount: insights.length };
  } catch (err: any) {
    console.error('[monthlyReflectionEngine] generateMonthlyReflectionForUser 전체 실패:', err?.message);
    return { action: 'error', reason: err?.message };
  }
}

/**
 * 이번 배치 실행 대상이 될 만한 user_id 목록 — bounds 기간 내에 insight가 실제로 하나라도
 * 있는 사용자만 대상으로 한다(memory_insights가 비어 있으면 애초에 월말정산을 만들 재료가 없다).
 */
async function fetchEligibleUserIds(bounds: PeriodBounds): Promise<string[]> {
  const { data, error } = await supabase
    .from('memory_insights')
    .select('user_id')
    .gte('created_at', bounds.periodStartUTC)
    .lt('created_at', bounds.periodEndUTC)
    .limit(5000);

  if (error) {
    console.error('[monthlyReflectionEngine] 대상 user_id 조회 실패:', error.message);
    return [];
  }
  return Array.from(new Set((data ?? []).map((r: any) => r.user_id as string)));
}

/**
 * 전체 사용자에 대해 월간 리플렉션을 생성한다. bounds를 안 넘기면 "지난 달"(KST) 기준.
 * interventionEngine/insightEngine과 같은 "배치 함수 + cron 라우트" 패턴.
 */
export async function generateMonthlyReflectionsForAllUsers(
  dryRun: boolean = false,
  bounds: PeriodBounds = getPreviousMonthBoundsKST()
): Promise<Record<string, MonthlyReflectionResult>> {
  try {
    const userIds = await fetchEligibleUserIds(bounds);
    const out: Record<string, MonthlyReflectionResult> = {};
    for (const uid of userIds) {
      out[uid] = await generateMonthlyReflectionForUser(uid, bounds, dryRun);
    }
    return out;
  } catch (err: any) {
    console.error('[monthlyReflectionEngine] generateMonthlyReflectionsForAllUsers 전체 실패:', err?.message);
    return {};
  }
}
