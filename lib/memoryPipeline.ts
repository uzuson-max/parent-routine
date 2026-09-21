
import { supabase } from '@/lib/supabase';
import { extractMemoryCandidates, MemoryCandidate } from '@/lib/memoryExtraction';
import { resolveEntity } from '@/lib/entityResolver';
import { tokenize, filterConfirmedCommitments } from '@/lib/memoryRetrieval';
import { buildMemoryEmbeddingText, generateMemoryEmbedding } from '@/lib/memoryEmbedding';
 
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
 
const LINK_STOPWORDS = new Set([
  '오늘', '어제', '내일', '모레', '이번', '저번', '다음', '진짜', '정말', '너무', '완전',
  '그냥', '근데', '그런데', '그리고', '그래서', '하지만', '아니', '그래', '엄청', '약간',
  '거기', '여기', '저기', '이거', '그거', '저거', '뭔가', '이제', '아까', '갑자기', '계속',
  '우리', '나는', '내가', '너는', '니가', '한테', '한번', '조금',
  '한다', '했다', '된다', '싶다', '같다', '보다', '이다', '있다', '없다', '거야', '이야',
]);

const MAX_LINKS_PER_MEMORY = 5;

async function linkRelatedMemories(
  userId: string,
  newMemoryId: number,
  newMemoryType: string,
  newSourceEntryId: string,
  newContent: string,
  newSubjectEntityId: string | null
): Promise<void> {
  try {
    const [selfEligible] = await filterConfirmedCommitments(userId, [
      { memory_type: newMemoryType, source_entry_id: newSourceEntryId },
    ]);
    if (!selfEligible) return;

    const { data: pool, error } = await supabase
      .from('memory_units')
      .select('id, content, subject_entity_id, memory_type, source_entry_id')
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

    const eligiblePool = await filterConfirmedCommitments(userId, pool);
    if (eligiblePool.length === 0) return;

    const newTokens = tokenize(newContent).filter((t) => !LINK_STOPWORDS.has(t));
    if (newTokens.length === 0 && !newSubjectEntityId) return;

    const matches: { id: number; strength: number }[] = [];
    for (const m of eligiblePool) {
      let strength = 0;
      if (newSubjectEntityId && m.subject_entity_id === newSubjectEntityId) strength += 2;
      if (newTokens.length > 0) {
        const existingTokens = tokenize(m.content).filter((t) => !LINK_STOPWORDS.has(t));
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
 
    const { candidates } = await extractMemoryCandidates(transcript);
 
    if (candidates.length === 0) {
      return { ran: true, extractedCount: 0, insertedCount: 0, skippedCount: 0, candidates: [] };
    }
 
    let inserted = 0;
    let skipped = 0;
 
    for (const c of candidates) {
      try {
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
          if (insertedRow?.id != null) {
            await linkRelatedMemories(userId, insertedRow.id, dbMemoryType, entryId, c.content, subjectEntityId);

            // STEP 2 — semantic memory retrieval을 위한 embedding 생성.
            // 동기(await)로 처리한다: app/api/voice/upload/route.ts를 확인한 결과 이 함수(runMemoryPipeline)
            // 자체가 이미 최종 응답 반환 이전에 await되고 있어(그 안의 extractMemoryCandidates GPT 호출 포함),
            // 이 지점은 이미 한 번의 GPT 호출 분량 지연을 감수하고 있다. 그보다 훨씬 가벼운 embeddings API
            // 호출 한 번을 추가로 기다리는 편이, 이 Vercel/Next.js 구성에서 응답 후 미완료 작업의 완료를
            // 보장할 방법이 없는 fire-and-forget(Option B)보다 안전하다고 판단해 Option A(동기)를 택했다.
            // embedding 생성이 실패해도 memory_units insert 자체(inserted 카운트)에는 절대 영향을 주지 않는다.
            try {
              const embeddingText = buildMemoryEmbeddingText({
                content: c.content,
                memory_type: dbMemoryType,
                subject: c.subject,
                temporal_context: c.temporal_context,
                emotion: c.emotional_relevance,
              });
              const embedding = await generateMemoryEmbedding(embeddingText);
              if (embedding) {
                const { error: embedError } = await supabase
                  .from('memory_units')
                  .update({ embedding })
                  .eq('id', insertedRow.id);
                if (embedError) {
                  console.error(
                    '[memoryPipeline] embedding 저장 실패 (memory 자체는 이미 정상 저장됨):',
                    embedError.message
                  );
                }
              } else {
                console.log(
                  `[memoryPipeline] memory_unit ${insertedRow.id}: embedding 생성 실패/스킵 — embedding NULL 유지, keyword retrieval로만 검색됨`
                );
              }
            } catch (embedErr: any) {
              console.error(
                '[memoryPipeline] embedding 생성 단계 예외 (무시, memory_units insert에는 영향 없음):',
                embedErr?.message
              );
            }
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
