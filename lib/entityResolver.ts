
import { supabase } from '@/lib/supabase';

export type EntityType = 'person' | 'pet' | 'place' | 'project' | 'object' | 'topic' | 'organization';

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
