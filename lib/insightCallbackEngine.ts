import { supabase } from '@/lib/supabase';
import { sendSolapiSms } from '@/lib/solapi';
import { markInsightsSurfaced } from '@/lib/insightEngine';

// ============================================================================
// "며칠 뒤 다시 돌아오는 경험"의 가장 작고 빠른 버전 — 월말 리플렉션을 기다릴 필요 없이,
// insightEngine이 이미 만들어둔 "반복 발견/연결 발견"(memory_insights)을 참견이가 먼저 문자로
// 들이미는 것. 새 LLM 호출도, 새 테이블도 없다 — insightEngine이 이미 참견이 말투로 다듬어
// 저장해 둔 content를 그대로 쓰고, 발송은 interventionEngine.ts와 똑같이 기존 Solapi 채널을 쓴다.
//
// intervention(=확정된 약속을 못 지켜서 찔러보는 것)과는 목적이 완전히 다르다 — 이건 압박이
// 아니라 "어? 나 이거 계속 말하네?"라는 발견의 재미를 주는 것이라, "참견이 등장." 같은 단계별
// 경고 스탬프를 붙이지 않는다. insight.content 자체가 이미 그 톤으로 만들어져 있으므로 그대로
// 보낸다 — 사용자가 상상한 "이 한 줄이 월말 리포트보다 강력하다"는 그림 그대로.
// ============================================================================

// 자동 발송은 대화 중 자연스럽게 꺼내는 것보다 훨씬 더 assertive한 행동(먼저 연락한다)이라,
// retrieveRelevantInsights(대화 중 후보 선정)보다 더 높은 확신 기준을 둔다.
const CONFIDENCE_THRESHOLD = 0.6;
// 이 기능이 배포되기 전부터 쌓여 있던 오래된 insight를 배포 첫 실행에 한꺼번에 문자로 쏟아내는
// 것을 막기 위한 안전장치 — 그 기간보다 오래된 건 이미 "지금 발견한 느낌"이 아니므로 대상에서 뺀다.
const MAX_INSIGHT_AGE_DAYS = 14;
// 한 번 배치 실행에서 조회할 후보 상한 (사용자당 1개로 좁히기 전 단계의 안전장치).
const CANDIDATE_POOL_LIMIT = 200;

interface InsightCandidateRow {
  id: number;
  user_id: string;
  content: string;
  confidence: number;
  created_at: string;
}

export interface InsightCallbackResult {
  insightId: number;
  userId: string;
  action: 'sent' | 'skipped_no_phone' | 'send_failed' | 'dry_run';
  message?: string;
  error?: string;
}

async function fetchCallbackCandidates(): Promise<InsightCandidateRow[]> {
  const cutoff = new Date(Date.now() - MAX_INSIGHT_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('memory_insights')
    .select('id, user_id, content, confidence, created_at')
    .eq('status', 'active')
    .is('last_surfaced_at', null) // 대화 중이든 문자든 한 번이라도 이미 꺼낸 적 있으면 후보에서 제외
    .gte('confidence', CONFIDENCE_THRESHOLD)
    .gte('created_at', cutoff)
    .order('confidence', { ascending: false })
    .limit(CANDIDATE_POOL_LIMIT);

  if (error) {
    console.error('[insightCallbackEngine] 후보 조회 실패:', error.message);
    return [];
  }
  return (data as InsightCandidateRow[]) ?? [];
}

// 사용자당 하루 한 통이 원칙 — 같은 배치 실행 안에 한 사용자의 insight가 여러 개 후보로
// 올라와도, confidence가 가장 높은 것 하나만 남긴다 (candidates는 이미 confidence desc 정렬됨).
function pickOnePerUser(candidates: InsightCandidateRow[]): InsightCandidateRow[] {
  const seen = new Set<string>();
  const picked: InsightCandidateRow[] = [];
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
    console.error('[insightCallbackEngine] user_memory 조회 실패:', error.message);
    return null;
  }
  return data?.phone_number ?? null;
}

/**
 * 아직 한 번도 안 꺼낸(last_surfaced_at IS NULL) 고신뢰 insight 중 사용자당 하나씩 골라
 * Solapi SMS로 먼저 보낸다. dryRun=true면 실제 발송/DB 갱신 없이 무엇을 보냈을지만 반환한다.
 * 절대 예외를 던지지 않는다 — 한 사용자 처리 실패가 나머지 배치에 영향을 주지 않는다.
 */
export async function sendDueInsightCallbacks(dryRun: boolean = false): Promise<InsightCallbackResult[]> {
  const results: InsightCallbackResult[] = [];
  try {
    const candidates = await fetchCallbackCandidates();
    if (candidates.length === 0) return results;

    const toSend = pickOnePerUser(candidates);

    for (const c of toSend) {
      try {
        if (dryRun) {
          console.log(`[insightCallbackEngine][dry-run] insight#${c.id} (user=${c.user_id}) → "${c.content}"`);
          results.push({ insightId: c.id, userId: c.user_id, action: 'dry_run', message: c.content });
          continue;
        }

        const phone = await resolvePhone(c.user_id);
        if (!phone) {
          console.error(`[insightCallbackEngine] insight#${c.id}: 전화번호 없음, 발송 스킵`);
          results.push({ insightId: c.id, userId: c.user_id, action: 'skipped_no_phone' });
          continue; // last_surfaced_at을 건드리지 않아 다음 배치에서 번호가 생기면 다시 시도된다.
        }

        await sendSolapiSms(phone, c.content);
        // 발송 성공 시에만 surfaced 처리 — 실패하면 다음 배치에서 재시도되도록 그대로 둔다.
        await markInsightsSurfaced([c.id]);
        results.push({ insightId: c.id, userId: c.user_id, action: 'sent', message: c.content });
      } catch (err: any) {
        console.error(`[insightCallbackEngine] insight#${c.id} 처리 실패:`, err?.message);
        results.push({ insightId: c.id, userId: c.user_id, action: 'send_failed', error: err?.message ?? String(err) });
      }
    }

    return results;
  } catch (err: any) {
    console.error('[insightCallbackEngine] sendDueInsightCallbacks 전체 실패:', err?.message);
    return results;
  }
}
