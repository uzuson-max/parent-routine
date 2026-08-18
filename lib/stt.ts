import OpenAI, { toFile } from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function transcribeAudio(audioUrl: string): Promise<string> {
  const res = await fetch(audioUrl);
  if (!res.ok) {
    throw new Error(`failed to fetch audio from ${audioUrl}: ${res.status}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const file = await toFile(Buffer.from(arrayBuffer), "recording.webm", { type: "audio/webm" });

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    language: "ko",
  });

  return transcription.text;
}
