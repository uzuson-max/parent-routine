// lib/stageServer.ts
// 강 스테이지 서버 전용 — 지난 녹음의 임시 재생 링크.
// 녹음 저장소(voice-recordings)는 비공개라서 audio_url로는 못 듣는다.
// 본인 녹음인지 확인한 뒤, 10분짜리 서명 링크를 만들어 준다.
import { supabase } from '@/lib/supabase';

const BUCKET = 'voice-recordings';
const SIGNED_SECONDS = 600;

export function storagePath(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i < 0) return null;
  return decodeURIComponent(url.slice(i + marker.length).split('?')[0]);
}

/** 이 사용자의 기록(entryId)이 맞으면 재생 링크, 아니면 null */
export async function signedVoiceUrl(userId: string, entryId: string | null | undefined): Promise<string | null> {
  if (!entryId) return null;
  const { data: entry } = await supabase
    .from('voice_entries')
    .select('audio_url, user_id')
    .eq('id', entryId)
    .maybeSingle();
  if (!entry || entry.user_id !== userId) return null;
  const path = storagePath(entry.audio_url);
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_SECONDS);
  if (error) {
    console.error('[stage] 서명 링크 실패:', error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}
