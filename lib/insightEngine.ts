import { supabase } from '@/lib/supabase';
import { PERSONALITY_PROMPT } from '@/lib/responseEngine';

// ============================================================================
// Pattern/Insight 레이어.
//
// memory_units(사소한 개별 기억) + memory_links(그 기억들 사이의 연결)까지는 이미 있다.
// 이 파일이 하는 일은 그 다음 단계 — "서로 연결된 기억들을 묶어서 봤을 때, 사용자 자신도
// 몰랐을 법한 사소하지만 진짜인 관찰이 나오는가"를 판단해서 memory_insights에 저장하는 것.
//
// 절대 매 발화(voice upload)마다 돌리지 않는다 — 의미도 없고 비용도 낭비다. 이 파일은
// interventionEngine.ts와 똑같은 모양의 "배치 함수 + cron 라우트" 패턴으로, 별도 스케줄에서
// (app/api/cron/generate-insights) 주기적으로 실행되는 걸 전제로 만들었다.
//
// responseEngine에 이 insight를 실제로 연결하는 건 이번 단계에 포함하지 않는다(다음 단계).
// ============================================================================

export interface MemoryUnitLite {
  id: number;
  content: string;
  memory_type: string;
  subject_entity_id: string | null;
  temporal_context: string | null;
  importance: number;
  created_at: string;
}

interface LinkRow {
  from_memory_id: number;
  to_memory_id: number;
}

interface ActiveInsightRow {
  id: number;
  memory_unit_ids: number[];
  status: string;
}

// 클러스터 하나가 insight 후보가 되려면 최소 이 개수는 연결돼 있어야 한다.
const MIN_CLUSTER_SIZE = 2;
// 한 번의 배치 실행에서 사용자 1명당 만들 LLM 호출(=클러스터 처리) 상한 — 폭주 방지용 안전장치.
const MAX_CLUSTERS_PER_RUN = 10;

export type InsightAction =
  | 'created'
  | 'updated'
  | 'skipped_unchanged'
  | 'skipped_not_meaningful'
  | 'skipped_error';

export interface InsightGenResult {
  clusterIds: number[];
  action: InsightAction;
  insightId?: number;
  content?: string;
}

// ---- 아주 작은 union-find. 외부 라이브러리 없이, 이 파일 안에서만 쓰는 순수 로직이다. ----
class UnionFind {
  private parent = new Map<number, number>();

  private ensure(x: number) {
    if (!this.parent.has(x)) this.parent.set(x, x);
  }

  find(x: number): number {
    this.ensure(x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    // path compression
    let cur = x;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: number, b: number) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/**
 * memory_links로 연결된 memory_unit들을 묶어서 "연결된 무리(cluster)"를 찾는다.
 * 링크가 하나도 없는 고립된 기억은 자연히 크기 1짜리 그룹이 되고, MIN_CLUSTER_SIZE 미만이라
 * 결과에서 제외된다 — 즉 "연결된 적 있는 기억들"만 insight 후보가 된다.
 */
function buildClusters(memoryIds: number[], links: LinkRow[]): number[][] {
  const idSet = new Set(memoryIds);
  const uf = new UnionFind();
  for (const id of memoryIds) uf.find(id);
  for (const l of links) {
    if (idSet.has(l.from_memory_id) && idSet.has(l.to_memory_id)) {
      uf.union(l.from_memory_id, l.to_memory_id);
    }
  }
  const groups = new Map<number, number[]>();
  for (const id of memoryIds) {
    const root = uf.find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(id);
  }
  return Array.from(groups.values()).filter((g) => g.length >= MIN_CLUSTER_SIZE);
}

function sortedIdsOf(ids: number[]): number[] {
  return [...ids].sort((a, b) => a - b);
}

function idsEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

async function fetchActiveMemoriesAndLinks(
  userId: string
): Promise<{ memories: MemoryUnitLite[]; links: LinkRow[] }> {
  const { data: memories, error: memErr } = await supabase
    .from('memory_units')
    .select('id, content, memory_type, subject_entity_id, temporal_context, importance, created_at')
    .eq('user_id', userId)
    .in('status', ['open', 'resolved'])
    .order('created_at', { ascending: false })
    .limit(200);

  if (memErr) {
    console.error('[insightEngine] memory_units 조회 실패:', memErr.message);
    return { memories: [], links: [] };
  }

  const { data: links, error: linkErr } = await supabase
    .from('memory_links')
    .select('from_memory_id, to_memory_id')
    .eq('user_id', userId)
    .limit(1000);

  if (linkErr) {
    console.error('[insightEngine] memory_links 조회 실패:', linkErr.message);
    return { memories: memories ?? [], links: [] };
  }

  return { memories: memories ?? [], links: (links as LinkRow[]) ?? [] };
}

async function fetchActiveInsights(userId: string): Promise<ActiveInsightRow[]> {
  const { data, error } = await supabase
    .from('memory_insights')
    .select('id, memory_unit_ids, status')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error) {
    console.error('[insightEngine] memory_insights 조회 실패:', error.message);
    return [];
  }
  return (data as ActiveInsightRow[]) ?? [];
}

interface Synthesis {
  content: string;
  theme: string;
  confidence: number;
}

/**
 * 클러스터 하나를 실제로 GPT에 보여주고 "의미 있는 관찰이 되는가"를 판단시킨다.
 * 여기서 안 된다고 판단하면(found:false) null을 반환하고, 호출부는 아무것도 저장하지 않는다 —
 * memory_units/retrieval에서 이미 써온 "억지로 쓰지 않는다" 원칙을 여기서도 그대로 지킨다.
 */
async function synthesizeInsight(memories: MemoryUnitLite[]): Promise<Synthesis | null> {
  const memoryBlock = memories
    .map((m) => `- (${m.memory_type}) "${m.content}"${m.temporal_context ? ` (${m.temporal_context})` : ''}`)
    .join('\n');

  const systemPrompt = `${PERSONALITY_PROMPT}

지금 너는 사용자와 실시간 대화 중이 아니다. 그동안 쌓인 기억들을 조용히 들여다보면서,
따로 참견할 만한 "관찰"이 있는지 혼자 판단하는 중이다.

아래는 서로 연관이 있다고 판단돼 하나로 묶인 기억들이다 (같은 사용자의 서로 다른 발화에서 나온 것들):
${memoryBlock}

할 일: 이 기억들을 합쳐서 볼 때, 사용자 자신도 잘 몰랐을 법한 "사소하지만 진짜인 관찰"이
하나 나오는지 판단해라.

중요한 원칙:
- 위 목록에 있는 내용 이상으로 어떤 사실도 지어내지 마라. 없는 디테일을 추가하지 마라.
- 그냥 키워드가 겹칠 뿐 실제로는 의미 있는 관찰로 이어지지 않는다면, 억지로 만들지 말고
  found:false로 답해라. 애매하면 만들지 않는 쪽을 택해라.
- 관찰은 확정적 진단("너는 ~한 사람이다", "너는 사실 ~다")이 아니라, 참견이가 옆에서 지켜보다가
  문득 발견한 것 같은 여지 있는 톤이어야 한다 ("~하더라", "~인가 보다", "~한 것 같던데").
- 날짜/횟수/"다음과 같습니다" 같은 데이터베이스 냄새 나는 표현 금지. 참견이의 평소 말투 그대로.
- 한 문장, 길어도 두 문장. 참견이가 대화 중에 툭 던지듯이 — 보고서처럼 쓰지 마라.

참고 예 (그대로 베끼지 말고 참고만 해라):
- 기억들: "크림라면을 좋아한다", "명란 삼각김밥과 같이 먹는 걸 좋아한다", "라면에 소세지를 넣는다"
  → found:true, "너 라면 먹을 때 은근 취향 확실하더라 — 크림라면에 명란 삼각김밥, 소세지까지."
- 기억들: "제주도에서 한 달 살아보고 싶다는 생각을 했다", "회사가 답답하다고 했다", "요즘 제주도 생각이 자꾸 난다"
  → found:true, "너 회사 답답할 때마다 이상하게 제주도 생각을 하더라."
- 기억들: "커피를 마셨다", "카페에 갔다" 정도로 단어만 겹치고 실제로 연결되는 의미가 없는 경우
  → found:false (억지로 의미를 부여하지 않는다)

반드시 아래 JSON으로만 답해:
{ "found": true or false, "content": "..." or null, "theme": "짧은 태그 (예: 음식 취향, 장소에 대한 생각)" or null, "confidence": 0.0 }`;

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

    if (!res.ok) throw new Error('insight synthesis 실패: ' + (await res.text()));
    const json = await res.json();
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? '{}');

    if (!parsed.found || typeof parsed.content !== 'string' || !parsed.content.trim()) return null;

    return {
      content: parsed.content.trim(),
      theme: typeof parsed.theme === 'string' && parsed.theme.trim() ? parsed.theme.trim() : '관찰',
      confidence:
        typeof parsed.confidence === 'number' && !Number.isNaN(parsed.confidence)
          ? Math.min(1, Math.max(0, parsed.confidence))
          : 0.5,
    };
  } catch (err: any) {
    console.error('[insightEngine] synthesizeInsight 실패:', err?.message);
    return null;
  }
}

/**
 * 사용자 한 명에 대해 memory_links로 연결된 클러스터들을 찾아 insight를 생성/갱신한다.
 * dryRun=true면 실제로 DB에 쓰지 않고 무엇이 만들어졌을지만 로그/결과로 남긴다.
 * 절대 예외를 던지지 않는다.
 */
export async function generateInsightsForUser(
  userId: string,
  dryRun: boolean = false
): Promise<InsightGenResult[]> {
  const results: InsightGenResult[] = [];
  try {
    const { memories, links } = await fetchActiveMemoriesAndLinks(userId);
    if (memories.length === 0) return results;

    const memoryIds = memories.map((m) => m.id);
    const clusters = buildClusters(memoryIds, links);
    if (clusters.length === 0) return results;

    const existingInsights = await fetchActiveInsights(userId);
    const memoriesById = new Map(memories.map((m) => [m.id, m]));

    let processed = 0;
    for (const rawCluster of clusters) {
      if (processed >= MAX_CLUSTERS_PER_RUN) break;
      const sortedIds = sortedIdsOf(rawCluster);

      // 이미 정확히 같은 멤버 구성의 active insight가 있으면 새로 판단할 필요 없다 (LLM 호출 절약).
      const unchanged = existingInsights.find((ins) => idsEqual(sortedIdsOf(ins.memory_unit_ids ?? []), sortedIds));
      if (unchanged) {
        results.push({ clusterIds: sortedIds, action: 'skipped_unchanged' });
        continue;
      }

      processed++;
      const clusterMemories = rawCluster
        .map((id) => memoriesById.get(id))
        .filter((m): m is MemoryUnitLite => Boolean(m));

      const synthesis = await synthesizeInsight(clusterMemories);
      if (!synthesis) {
        results.push({ clusterIds: sortedIds, action: 'skipped_not_meaningful' });
        continue;
      }

      if (dryRun) {
        console.log(`[insightEngine][dry-run] cluster=${JSON.stringify(sortedIds)} → "${synthesis.content}"`);
        results.push({ clusterIds: sortedIds, action: 'created', content: synthesis.content });
        continue;
      }

      // 이 클러스터의 멤버 일부를 이미 커버하던 이전 insight가 있다면, 완전히 새 관찰로 교체한다
      // (예: 기존엔 기억 2개였는데 3번째가 새로 연결돼 클러스터가 커진 경우).
      const overlapping = existingInsights.filter((ins) =>
        (ins.memory_unit_ids ?? []).some((id) => sortedIds.includes(id))
      );
      for (const old of overlapping) {
        const { error: supersedeErr } = await supabase
          .from('memory_insights')
          .update({ status: 'superseded', updated_at: new Date().toISOString() })
          .eq('id', old.id);
        if (supersedeErr) console.error('[insightEngine] 기존 insight superseded 처리 실패:', supersedeErr.message);
      }

      const { data: inserted, error: insertErr } = await supabase
        .from('memory_insights')
        .insert({
          user_id: userId,
          content: synthesis.content,
          theme: synthesis.theme,
          memory_unit_ids: sortedIds,
          confidence: synthesis.confidence,
          status: 'active',
        })
        .select('id')
        .single();

      if (insertErr) {
        console.error('[insightEngine] memory_insights insert 실패:', insertErr.message);
        results.push({ clusterIds: sortedIds, action: 'skipped_error' });
      } else {
        results.push({
          clusterIds: sortedIds,
          action: overlapping.length > 0 ? 'updated' : 'created',
          insightId: inserted?.id,
          content: synthesis.content,
        });
      }
    }

    return results;
  } catch (err: any) {
    console.error('[insightEngine] generateInsightsForUser 전체 실패:', err?.message);
    return results;
  }
}

/**
 * 배치 진입점 — memory_units가 일정 개수 이상 쌓인 사용자들을 찾아 순서대로 처리한다.
 * cron 라우트(app/api/cron/generate-insights)에서 호출하는 걸 전제로 한다.
 */
export async function generateInsightsForAllUsers(
  dryRun: boolean = false,
  minMemories: number = 3
): Promise<Record<string, InsightGenResult[]>> {
  try {
    const { data: rows, error } = await supabase
      .from('memory_units')
      .select('user_id')
      .in('status', ['open', 'resolved'])
      .limit(5000);

    if (error) {
      console.error('[insightEngine] 전체 user_id 조회 실패:', error.message);
      return {};
    }

    const counts = new Map<string, number>();
    for (const r of rows ?? []) {
      counts.set(r.user_id, (counts.get(r.user_id) ?? 0) + 1);
    }
    const eligibleUserIds = Array.from(counts.entries())
      .filter(([, c]) => c >= minMemories)
      .map(([id]) => id);

    const out: Record<string, InsightGenResult[]> = {};
    for (const uid of eligibleUserIds) {
      out[uid] = await generateInsightsForUser(uid, dryRun);
    }
    return out;
  } catch (err: any) {
    console.error('[insightEngine] generateInsightsForAllUsers 전체 실패:', err?.message);
    return {};
  }
}
