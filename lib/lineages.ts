// lib/lineages.ts
import { supabase } from '@/lib/supabase';
import { looksLikeNoSpeech } from '@/lib/noSpeech';

// ============================================================================
// "생각의 계보" — 어항의 물고기 하나 = 서로 이어진 생각 묶음 하나.
// ----------------------------------------------------------------------------
// 새 테이블/새 LLM 호출 없이 이미 쌓여 있는 것만 묶는다:
//   memory_units      — 녹음에서 뽑힌 작은 기억들
//   memory_links      — 기억끼리 이어진 선 (memoryPipeline이 이미 만들고 있음)
//   subject_entity_id — 같은 대상(고양이, 몬스테라…)을 가리키는 기억은 같은 계보
// 이 둘로 Union-Find해서 묶이면 같은 계보.
//
// 홈 어항(/api/user/tank)과 지난 어항(/api/user/archive)이 같은 묶음을 쓰도록 여기 한 곳에 둔다.
// 계보 id는 묶음 안에서 가장 작은 memory_unit id — 기억이 새로 붙어도 잘 바뀌지 않아서
// 같은 물고기가 같은 색/같은 자리로 계속 보인다.
// ============================================================================

export interface LineageMention {
  entryId: string;
  at: number; // epoch ms
  quote: string;
}

export interface RawLineage {
  id: string;
  unitIds: number[];
  label: string | null; // 사용자가 직접 말한 대상 이름(참견이 대사용). 어항에는 띄우지 않는다.
  mentions: LineageMention[]; // 최신순, 녹음 하나당 한 번
}

export interface LoadedLineages {
  lineages: RawLineage[];
  // 계보에 들어간 녹음 id — 아직 안 묶인 녹음(치어)을 가려내는 데 쓴다.
  entryIdsInLineage: Set<string>;
}

class UnionFind {
  parent = new Map<number, number>();
  find(x: number): number {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let r = x;
    while (this.parent.get(r) !== r) r = this.parent.get(r)!;
    let c = x;
    while (this.parent.get(c) !== r) {
      const n = this.parent.get(c)!;
      this.parent.set(c, r);
      c = n;
    }
    return r;
  }
  union(a: number, b: number) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

interface UnitRow {
  id: number;
  subject_entity_id: string | number | null;
  source_entry_id: string | number | null;
  raw_quote: string | null;
  memory_type: string | null;
}

export function trimQuote(text: string, max = 60): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

/** 어항에 들어갈 수 있는 녹음인가: 받아쓰기 성공 + 무음 환각 아님 + 참견이에게 대답한 녹음 아님 */
export function isTankEntry(row: { transcript: string | null; response: any }): boolean {
  const t = row.transcript;
  if (!t || t === '(음성 변환 실패)') return false;
  const resp = row.response as any;
  if (resp?.reply_to) return false;
  if (resp?.speech_confirmed !== true && looksLikeNoSpeech(t, undefined)) return false;
  return true;
}

export async function loadLineages(userId: string): Promise<LoadedLineages> {
  const [unitsRes, linksRes, entriesRes] = await Promise.all([
    supabase
      .from('memory_units')
      .select('id, subject_entity_id, source_entry_id, raw_quote, memory_type')
      .eq('user_id', userId)
      .in('status', ['open', 'resolved'])
      .order('created_at', { ascending: false })
      .limit(800),
    supabase.from('memory_links').select('from_memory_id, to_memory_id').eq('user_id', userId).limit(3000),
    supabase
      .from('voice_entries')
      .select('id, transcript, response, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(800),
  ]);

  if (unitsRes.error) throw new Error(`memory_units 조회 실패: ${unitsRes.error.message}`);
  if (entriesRes.error) throw new Error(`voice_entries 조회 실패: ${entriesRes.error.message}`);
  if (linksRes.error) console.error('[lineages] memory_links 조회 실패 (링크 없이 계속):', linksRes.error.message);

  const entryMap = new Map<string, { at: number; transcript: string }>();
  for (const row of entriesRes.data ?? []) {
    if (!isTankEntry(row as any)) continue;
    entryMap.set(String(row.id), { at: new Date(row.created_at as string).getTime(), transcript: row.transcript as string });
  }

  // 감정 한 줄("피곤해")은 계보를 만들기엔 너무 흩어져서 뺀다.
  const units = ((unitsRes.data ?? []) as UnitRow[]).filter(
    (u) => u.memory_type !== 'emotion' && u.source_entry_id != null && entryMap.has(String(u.source_entry_id))
  );

  const uf = new UnionFind();
  const unitIds = new Set<number>();
  const firstUnitOfEntity = new Map<string, number>();
  for (const u of units) {
    unitIds.add(u.id);
    uf.find(u.id);
    if (u.subject_entity_id != null) {
      const key = String(u.subject_entity_id);
      const first = firstUnitOfEntity.get(key);
      if (first === undefined) firstUnitOfEntity.set(key, u.id);
      else uf.union(first, u.id);
    }
  }
  for (const l of (linksRes.data ?? []) as { from_memory_id: number; to_memory_id: number }[]) {
    if (unitIds.has(l.from_memory_id) && unitIds.has(l.to_memory_id)) uf.union(l.from_memory_id, l.to_memory_id);
  }

  const groups = new Map<number, UnitRow[]>();
  for (const u of units) {
    const r = uf.find(u.id);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(u);
  }

  const entityIds = Array.from(firstUnitOfEntity.keys());
  const entityName = new Map<string, string>();
  if (entityIds.length) {
    const { data: ents, error: entErr } = await supabase
      .from('entities')
      .select('id, name')
      .eq('user_id', userId)
      .in('id', entityIds);
    if (entErr) console.error('[lineages] entities 조회 실패 (이름 없이 계속):', entErr.message);
    for (const e of ents ?? []) entityName.set(String(e.id), e.name as string);
  }

  const entryIdsInLineage = new Set<string>();
  const lineages: RawLineage[] = Array.from(groups.values()).map((group) => {
    const byEntry = new Map<string, UnitRow[]>();
    for (const u of group) {
      const k = String(u.source_entry_id);
      entryIdsInLineage.add(k);
      if (!byEntry.has(k)) byEntry.set(k, []);
      byEntry.get(k)!.push(u);
    }
    const mentions = Array.from(byEntry.entries())
      .map(([entryId, us]) => {
        const e = entryMap.get(entryId)!;
        const withQuote = us.find((u) => u.raw_quote && u.raw_quote.trim());
        return { entryId, at: e.at, quote: trimQuote(withQuote?.raw_quote ?? e.transcript) };
      })
      .sort((a, b) => b.at - a.at);

    const nameCount = new Map<string, number>();
    for (const u of group) {
      if (u.subject_entity_id == null) continue;
      const n = entityName.get(String(u.subject_entity_id));
      if (n) nameCount.set(n, (nameCount.get(n) ?? 0) + 1);
    }
    const label = Array.from(nameCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return {
      id: String(Math.min(...group.map((u) => u.id))),
      unitIds: group.map((u) => u.id),
      label,
      mentions,
    };
  });

  return { lineages, entryIdsInLineage };
}
