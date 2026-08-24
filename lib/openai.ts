export async function transcribeAudioBuffer(audioBuffer: Buffer): Promise<string> {
  // Buffer를 Uint8Array로 변환하여 BlobPart 타입 에러 해결
  const uint8Array = new Uint8Array(audioBuffer);
  const blob = new Blob([uint8Array], { type: 'audio/webm' });
  
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
