
import { supabase } from '@/lib/supabase';

export type EntityType = 'person' | 'pet' | 'place' | 'project' | 'object' | 'topic' | 'organization';

// memory_type → entity_type 최선 추론 매핑.
// memory candidate 스키마엔 entity_type이 따로 없어서(요청된 스키마를 그대로 따름),
// entities.entity_type(NOT NULL) 채우려고 memory_type에서 유추한다. 완벽한 분류가 목적이 아니라
// "고양이"/"엄마" 같은 표면형을 재사용 가능한 하나의 entity row로 정규화하는 게 목적이라
// 애매하면 'topic'으로 둔다. 이미 있는 entity를 다시 찾을 땐 entity_type을 건드리지 않는다.
const MEMORY_TYPE_TO_ENTITY_TYPE: Record<string, EntityType> = {
  person: 'person',
  relationship: 'person',
  pet: 'pet',
  place: 'place',
  commitment: 'project',
  interest: 'topic',
  emotion: 'topic',
  thought: 'topic',
  reflection: 'topic',
  concern: 'topic',
  preference: 'topic',
  experience: 'topic',
  event: 'topic',
};

export async function resolveEntity(
  userId: string,
  subject: string | null,
  memoryType: string
): Promise<string | null> {
  if (!subject || !subject.trim()) return null;
  const name = subject.trim();

  const { data: existing, error: findError } = await supabase
    .from('entities')
    .select('id, mention_count')
    .eq('user_id', userId)
    .eq('name', name)
    .maybeSingle();

  if (findError) {
    console.error('[entityResolver] lookup failed:', findError.message);
    return null;
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from('entities')
      .update({
        last_mentioned_at: new Date().toISOString(),
        mention_count: (existing.mention_count ?? 1) + 1,
      })
      .eq('id', existing.id);
    if (updateError) console.error('[entityResolver] mention_count update failed:', updateError.message);
    return existing.id;
  }

  const entityType = MEMORY_TYPE_TO_ENTITY_TYPE[memoryType] ?? 'topic';
  const { data: created, error: insertError } = await supabase
    .from('entities')
    .insert({ user_id: userId, name, entity_type: entityType })
    .select('id')
    .maybeSingle();

  if (insertError) {
    if (insertError.code === '23505') {
      const { data: retry } = await supabase
        .from('entities')
        .select('id')
        .eq('user_id', userId)
        .eq('name', name)
        .maybeSingle();
      return retry?.id ?? null;
    }
    console.error('[entityResolver] insert failed:', insertError.message);
    return null;
  }
  return created?.id ?? null;
}
