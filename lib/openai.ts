export async function transcribeAudioBuffer(audioBuffer: Buffer): Promise<string> {
  // Blob 대신 버퍼를 직접 FormData에 담아 전송
  const blob = new Blob([audioBuffer], { type: 'audio/webm' });
  
  const formData = new FormData();
  formData.append('file', blob, 'audio.webm');
  formData.append('model', 'whisper-1');
  formData.append('language', 'ko');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: formData,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error('STT 실패: ' + errorText);
  }
  
  const json = await res.json();
  return json.text as string;
}
