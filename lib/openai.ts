export async function transcribeAudio(audioUrl: string): Promise<string> {
  // 오디오 파일을 fetch해서 Whisper API로 전달
  const audioRes = await fetch(audioUrl);
  const audioBlob = await audioRes.blob();

  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.webm');
  formData.append('model', 'whisper-1');
  formData.append('language', 'ko');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: formData,
  });

  if (!res.ok) throw new Error('STT 실패: ' + (await res.text()));
  const json = await res.json();
  return json.text as string;
}
