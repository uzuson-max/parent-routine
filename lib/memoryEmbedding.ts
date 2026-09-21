
//
// Conversation Engine v2, STEP 2 — memory_units 임베딩 생성 공통 로직.
// 신규 memory 생성(memoryPipeline.ts)과 기존 memory backfill(scripts/backfillMemoryEmbeddings.ts)
// 양쪽에서 반드시 이 파일의 함수만 사용한다 — 같은 memory라도 두 경로에서 서로 다른 텍스트를
// embedding하면 유사도 비교 자체가 의미 없어지기 때문이다.

export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1536;

export interface MemoryEmbeddingInput {
  content: string;
  memory_type: string;
  subject?: string | null;
  temporal_context?: string | null;
  emotion?: string | null;
}

export function buildMemoryEmbeddingText(input: MemoryEmbeddingInput): string {
  const parts: string[] = [`[${input.memory_type}] ${input.content}`];
  if (input.subject) parts.push(`대상: ${input.subject}`);
  if (input.temporal_context) parts.push(`시점: ${input.temporal_context}`);
  if (input.emotion) parts.push(`감정: ${input.emotion}`);
  return parts.join(' / ');
}

export async function generateMemoryEmbedding(text: string): Promise<number[] | null> {
  if (!text || !text.trim()) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text,
      }),
    });

    if (!res.ok) {
      console.error('[memoryEmbedding] embedding API 실패:', await res.text());
      return null;
    }

    const json = await res.json();
    const vector = json?.data?.[0]?.embedding;

    if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS) {
      console.error(
        `[memoryEmbedding] dimension mismatch (기대 ${EMBEDDING_DIMENSIONS}, 실제 ${
          Array.isArray(vector) ? vector.length : 'N/A'
        }) — embedding 저장 안 함`
      );
      return null;
    }

    return vector;
  } catch (err: any) {
    console.error('[memoryEmbedding] embedding 생성 실패 (무시, keyword retrieval로 fallback):', err?.message);
    return null;
  }
}
