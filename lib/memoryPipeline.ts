import { supabase } from '@/lib/supabase';
import { extractMemoryCandidates, MemoryCandidate } from '@/lib/memoryExtraction';
import { resolveEntity } from '@/lib/entityResolver';
import { tokenize } from '@/lib/memoryRetrieval';
 
// memoryExtraction.ts의 MemoryType(추출 판단용)과 memory_units.memory_type의 실제 DB CHECK 제약은
// 완전히 같지 않다. DB가 실제로 허용하는 값은:
//   event, person, place, feeling, thought, interest, concern, commitment, preference, relationship, pattern
// 반면 memoryExtraction.ts의 SYSTEM_PROMPT는 아래 13개 중 하나를 고른다:
//   event, person, relationship, pet, place, interest, emotion, thought, reflection, concern, preference, commitment, experience
// 즉 pet / emotion / reflection / experience 네 개는 DB에 그대로 넣으면 CHECK 제약 위반으로 insert가 실패한다.
// extraction의 판단(prompt)은 이번 단계에서 손대지 않기로 했으므로, 저장 시점에만 DB가 실제로 갖고 있는
// 값으로 안전하게 매핑한다. entityResolver로 entity_type을 정할 때는 이 매핑 이전의 원래 memory_type을
// 그대로 넘겨야 한다 (예: pet → entities.entity_type='pet' 매핑은 entityResolver.ts에 이미 있고 정확하다).
const DB_SAFE_MEMORY_TYPE: Record<string, string> = {
  event: 'event',
  person: 'person',
  relationship: 'relationship',
  pet: 'relationship', // DB에 pet 값 없음 — 사람 외 존재와의 지속적 관계로 취급
  place: 'place',
  interest: 'interest',
  emotion: 'feeling', // DB 컬럼/값 이름이 feeling
  thought: 'thought',
  reflection: 'thought', // DB에 reflection 값 없음 — thought로 취급
  concern: 'concern',
  preference: 'preference',
  commitment: 'commitment',
  experience: 'event', // DB에 experience 값 없음 — 과거에 있었던 일이므로 event로 취급
};
 
// memory_links(=이미 스키마에 있지만 지금까지 아무 코드도 쓰지 않던 테이블) 생성 시에만 쓰는,
// 정보량이 거의 없는 흔한 단어 필터. memoryRetrieval.ts의 실시간 스코어링(그때그때 후보를 거르는 것)과
// 달리, 여기서 만드는 링크는 DB에 영구적으로 쌓이는 관계라서 더 보수적인 기준을 쓴다.
// 뒤쪽 두 줄(한다/했다~거야)은 문장을 끝맺는 흔한 서술어 어미다. 짧은 어미 하나가 독립된 단어로
// 떨어져 나오면(예: "...준비해야 한다"), 다른 기억의 "좋아한다"/"반복한다"처럼 전혀 무관한 문장에도
// substring으로 걸려버리는 오탐이 실제로 있었다(테스트로 발견) — 그래서 별도로 걸러낸다.
const LINK_STOPWORDS = new Set([
  '오늘', '어제', '내일', '모레', '이번', '저번', '다음', '진짜', '정말', '너무', '완전',
  '그냥', '근데', '그런데', '그리고', '그래서', '하지만', '아니', '그래', '엄청', '약간',
  '거기', '여기', '저기', '이거', '그거', '저거', '뭔가', '이제', '아까', '갑자기', '계속',
  '우리', '나는', '내가', '너는', '니가', '한테', '한번', '조금',
  '한다', '했다', '된다', '싶다', '같다', '보다', '이다', '있다', '없다', '거야', '이야',
]);

// 새로 저장된 기억 하나당 만들 링크 개수 상한 — 아주 일반적인 단어를 포함한 기억이
// 무한정 많은 다른 기억과 연결되는 걸 막기 위한 안전장치.
const MAX_LINKS_PER_MEMORY = 5;

/**
 * 방금 저장된 memory_unit을, 같은 사용자의 기존 memory_units 중 실제로 겹치는 게 있는 것들과
 * memory_links(relation='related')로 연결한다. 새 LLM 호출 없이 순수 결정론적 규칙만 쓴다:
 *   1) subject_entity_id가 같으면 (같은 사람/반려동물/장소/주제) 강한 신호로 취급
 *   2) content의 키워드가 겹치면 (흔한 단어 제외) 약한 신호로 취급
 * "진짜 연결되는지"에 대한 의미적 판단(예: causes_by/contradicts 같은 관계 종류)은 하지 않는다 —
 * 그건 나중에 별도의 pattern/insight 단계가 LLM으로 판단할 몫이고, 여기서는 그 판단이 나중에
 * 가능하도록 "이 기억들이 서로 얽혀 있다"는 원재료(관계)만 잃어버리지 않게 남겨둔다.
 * 절대 예외를 던지지 않는다 — 실패해도 memory_units insert 자체(inserted/skipped 카운트)에는
 * 영향을 주지 않는다.
 */
async function linkRelatedMemories(
  userId: string,
  newMemoryId: number,
  newContent: string,
  newSubjectEntityId: string | null
): Promise<void> {
  try {
    const { data: pool, error } = await supabase
      .from('memory_units')
      .select('id, content, subject_entity_id')
      .eq('user_id', userId)
      .in('status', ['open', 'resolved'])
      .neq('id', newMemoryId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[memoryPipeline] link 후보 조회 실패 (링크 없이 계속):', error.message);
      return;
    }
    if (!pool || pool.length === 0) return;

    const newTokens = tokenize(newContent).filter((t) => !LINK_STOPWORDS.has(t));
    if (newTokens.length === 0 && !newSubjectEntityId) return;

    const matches: { id: number; strength: number }[] = [];
    for (const m of pool) {
      let strength = 0;
      if (newSubjectEntityId && m.subject_entity_id === newSubjectEntityId) strength += 2;
      if (newTokens.length > 0) {
        const existingTokens = tokenize(m.content).filter((t) => !LINK_STOPWORDS.has(t));
        // 정확히 같은 단어는 강한 신호, "크림라면"↔"라면"처럼 한쪽이 다른 쪽을 포함하는
        // 복합명사 겹침은 약한 신호 — memoryRetrieval.ts의 exact/partial overlap과 같은 생각이다.
        for (const nt of newTokens) {
          for (const et of existingTokens) {
            if (nt === et) {
              strength += 1;
            } else if (nt.length >= 2 && et.length >= 2 && (nt.includes(et) || et.includes(nt))) {
              strength += 0.5;
            }
          }
        }
      }
      if (strength > 0) matches.push({ id: m.id, strength });
    }
    if (matches.length === 0) return;

    matches.sort((a, b) => b.strength - a.strength);
    const top = matches.slice(0, MAX_LINKS_PER_MEMORY);

    for (const t of top) {
      const { error: linkError } = await supabase.from('memory_links').insert({
        user_id: userId,
        from_memory_id: newMemoryId,
        to_memory_id: t.id,
        relation: 'related',
      });
      // unique(from_memory_id, to_memory_id, relation) 위반(23505)은 이미 연결돼 있다는 뜻이라 조용히 무시.
      if (linkError && linkError.code !== '23505') {
        console.error('[memoryPipeline] memory_links insert 실패:', linkError.message);
      }
    }
  } catch (err: any) {
    console.error('[memoryPipeline] linkRelatedMemories 실패 (무시, memory_units insert에는 영향 없음):', err?.message);
  }
}

export interface MemoryPipelineResult {
  ran: boolean;
  skippedReason?: 'no_transcript' | 'already_processed' | 'error';
  extractedCount: number;
  insertedCount: number;
  skippedCount: number;
  candidates: MemoryCandidate[];
}
 
const EMPTY_RESULT: Omit<MemoryPipelineResult, 'skippedReason'> = {
  ran: false,
  extractedCount: 0,
  insertedCount: 0,
  skippedCount: 0,
  candidates: [],
};
 
/**
 * Phase 2 — WRITE ONLY.
 * 사용자가 방금 한 말(transcript 원문)을 기존 analysis.ts / event_memory / pattern_memory /
 * commitment_memory / responseEngine과는 완전히 별개인 새 memory_units 구조에 폭넓게 기록한다.
 * 이번 단계에서는 memory_units를 다시 읽어서 응답에 쓰는 retrieval은 구현하지 않는다.
 *
 * 이 함수는 절대 예외를 밖으로 던지지 않는다 (모든 실패를 내부에서 흡수) — 호출부는 이 함수의 실패로
 * 기존 서비스(음성 저장/분석/응답/개입)에 영향을 받지 않는다.
 */
export async function runMemoryPipeline(
  entryId: string,
  userId: string,
  transcript: string,
  sourceChannel: 'voice' | 'text' | 'sms_reply'
): Promise<MemoryPipelineResult> {
  try {
    if (!transcript || !transcript.trim() || transcript === '(음성 변환 실패)') {
      return { ...EMPTY_RESULT, skippedReason: 'no_transcript' };
    }
 
    // 동일 entry가 재실행/재시도로 두 번 처리되어 memory_units에 중복 적재되는 것을 막는다.
    // 새 unique constraint를 추가하지 않고, 애플리케이션 레벨 조회 후 스킵하는 가장 안전한 방식을 쓴다.
    const { data: already, error: dupCheckError } = await supabase
      .from('memory_units')
      .select('id')
      .eq('source_entry_id', entryId)
      .limit(1)
      .maybeSingle();
 
    if (dupCheckError) {
      console.error('[memoryPipeline] 중복 확인 실패 (계속 진행):', dupCheckError.message);
    } else if (already) {
      console.log(`[memoryPipeline] entry ${entryId} 는 이미 처리됨 — 스킵`);
      return { ...EMPTY_RESULT, skippedReason: 'already_processed' };
    }
 
    // 판단 기준은 오직 사용자의 원본 transcript. 기존 analysis 결과(context_facts/memory_candidates/
    // detected_pattern 등)는 여기 다시 넣지 않는다 — memoryExtraction.ts의 prompt를 그대로 쓴다.
    const { candidates } = await extractMemoryCandidates(transcript);
 
    if (candidates.length === 0) {
      return { ran: true, extractedCount: 0, insertedCount: 0, skippedCount: 0, candidates: [] };
    }
 
    let inserted = 0;
    let skipped = 0;
 
    for (const c of candidates) {
      try {
        // entity_type 매핑은 원래 memory_type 그대로 넘겨야 정확하다 (예: pet → entities.entity_type='pet').
        const subjectEntityId = await resolveEntity(userId, c.subject, c.memory_type);
        const dbMemoryType = DB_SAFE_MEMORY_TYPE[c.memory_type] ?? 'event';
 
        const { data: insertedRow, error } = await supabase
          .from('memory_units')
          .insert({
            user_id: userId,
            source_entry_id: entryId,
            source_channel: sourceChannel,
            memory_type: dbMemoryType,
            subject_entity_id: subjectEntityId,
            content: c.content,
            emotion: c.emotional_relevance,
            temporal_context: c.temporal_context,
            importance: c.importance,
            retention: c.retention,
            decay_rate: c.retention === 'permanent' ? 0 : 0.05,
            status: c.status,
          })
          .select('id')
          .single();

        if (error) {
          console.error('[memoryPipeline] memory_units insert 실패:', error.message);
          skipped++;
        } else {
          inserted++;
          // 링크 생성은 부가 기능이라 실패해도 위 inserted 카운트에는 영향 없음 (함수 내부에서 절대 던지지 않음).
          if (insertedRow?.id != null) {
            await linkRelatedMemories(userId, insertedRow.id, c.content, subjectEntityId);
          }
        }
      } catch (innerErr: any) {
        console.error('[memoryPipeline] candidate 처리 중 예외 (건너뜀):', innerErr?.message);
        skipped++;
      }
    }
 
    return {
      ran: true,
      extractedCount: candidates.length,
      insertedCount: inserted,
      skippedCount: skipped,
      candidates,
    };
  } catch (err: any) {
    console.error('[memoryPipeline] 전체 실패 (기존 서비스에는 영향 없음):', err?.message);
    return { ...EMPTY_RESULT, skippedReason: 'error' };
  }
}
