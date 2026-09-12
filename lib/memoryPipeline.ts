
import { supabase } from '@/lib/supabase';
import { extractMemoryCandidates, MemoryCandidate } from '@/lib/memoryExtraction';
import { resolveEntity } from '@/lib/entityResolver';
 
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
 
        const { error } = await supabase.from('memory_units').insert({
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
        });
 
        if (error) {
          console.error('[memoryPipeline] memory_units insert 실패:', error.message);
          skipped++;
        } else {
          inserted++;
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
