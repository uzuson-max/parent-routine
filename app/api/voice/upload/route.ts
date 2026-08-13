import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { transcribeAudio } from '@/lib/openai';
import { analyzeAndSchedule } from '@/lib/analysis';

export async function POST(request: Request) {
  const formData = await request.formData();
  const audio = formData.get('audio') as File;
  const phone = formData.get('phone') as string;

  if (!audio || !phone) {
    return NextResponse.json({ success: false, error: '오디오와 전화번호가 필요합니다.' }, { status: 400 });
  }

  const fileName = `${Date.now()}-${crypto.randomUUID()}.webm`;
  const buffer = Buffer.from(await audio.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from('voice-recordings')
    .upload(fileName, buffer, { contentType: 'audio/webm' });

  if (uploadError) {
    return NextResponse.json({ success: false, error: uploadError.message }, { status: 500 });
  }

  const audioUrl = supabase.storage.from('voice-recordings').getPublicUrl(fileName).data.publicUrl;

  const { data: entry, error } = await supabase
    .from('voice_entries')
    .insert({ user_phone: phone, audio_url: audioUrl, call_state: 'pending' })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  // STT + 분석 + 발신 예약까지 이어서 처리 (실패해도 녹음 자체는 저장된 상태 유지)
  try {
    const transcript = await transcribeAudio(audioUrl);
    await supabase.from('voice_entries').update({ transcript }).eq('id', entry.id);

    await analyzeAndSchedule(entry.id, transcript, phone);
  } catch (err: any) {
    console.error('STT/분석 실패:', err.message);
    await supabase.from('voice_entries').update({ call_state: 'analysis_failed' }).eq('id', entry.id);
  }

  return NextResponse.json({ success: true, data: entry });
}
