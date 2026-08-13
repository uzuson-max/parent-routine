import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

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

  const { data, error } = await supabase
    .from('voice_entries')
    .insert({ user_phone: phone, audio_url: audioUrl, call_state: 'pending' })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  // Day 2에서 여기에 STT(Whisper) 호출이 이어붙습니다.
  return NextResponse.json({ success: true, data });
}
