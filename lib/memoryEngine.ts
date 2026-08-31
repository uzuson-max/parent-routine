import { supabase } from '@/lib/supabase';

export async function updateUserMemory(userId: string, newTopic?: string, newExcuse?: string) {
  if (!userId) {
    console.error('[memoryEngine] updateUserMemory called without userId');
    return;
  }

  const { data: existing, error: fetchError } = await supabase
    .from('user_memory')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError) {
    console.error('[memoryEngine] updateUserMemory: fetch past entries failed:', fetchError.message);
    return;
  }

  const recurringTopics: string[] = existing?.recurring_topics ?? [];
  const recurringExcuses: string[] = existing?.recurring_excuses ?? [];

  if (newTopic && !recurringTopics.includes(newTopic)) recurringTopics.push(newTopic);
  if (newExcuse && !recurringExcuses.includes(newExcuse)) recurringExcuses.push(newExcuse);

  const { error: upsertError } = await supabase.from('user_memory').upsert({
    user_id: userId,
    recurring_topics: recurringTopics,
    recurring_excuses: recurringExcuses,
    entry_count: (existing?.entry_count ?? 0) + 1,
    updated_at: new Date().toISOString(),
  });

  if (upsertError) console.error('[memoryEngine] updateUserMemory: upsert failed:', upsertError.message);
}

export async function buildCallOpening(userId: string): Promise<string | null> {
  if (!userId) {
    console.error('[memoryEngine] buildCallOpening called without userId');
    return null;
  }

  const { data, error } = await supabase
    .from('user_memory')
    .select('recurring_topics, recurring_excuses, pattern_summary')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[memoryEngine] buildCallOpening: fetch memory failed:', error.message);
    return null;
  }
  if (!data) return null;

  if (data.pattern_summary) return data.pattern_summary;
  if (data.recurring_topics?.length) return `요즘 ${data.recurring_topics[data.recurring_topics.length - 1]} 얘기 자주 하더라.`;
  return null;
}
