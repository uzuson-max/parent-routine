
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

// 같은 문장의 임베딩을 짧은 시간 안에 두 번 만들지 않게 잠깐 기억해둔다.
// 녹음 업로드는 분석 GPT가 도는 동안 원문 임베딩을 미리 만들어두고(prefetchEmbedding), 기억 검색이 그걸 그대로 쓴다.
// 같은 서버 인스턴스 안에서만, 1분만 유지한다(임베딩 결과는 같은 입력이면 같다).
const embeddingCache = new Map<string, { at: number; p: Promise<number[] | null> }>();
const EMBEDDING_CACHE_MS = 60_000;

export function prefetchEmbedding(text: string): void {
  if (!text || !text.trim()) return;
  void generateMemoryEmbedding(text);
}

export async function generateMemoryEmbedding(text: string): Promise<number[] | null> {
  if (!text || !text.trim()) return null;
  const now = Date.now();
  const hit = embeddingCache.get(text);
  if (hit && now - hit.at < EMBEDDING_CACHE_MS) return hit.p;
  embeddingCache.forEach((v, k) => {
    if (now - v.at >= EMBEDDING_CACHE_MS) embeddingCache.delete(k);
  });
  const p = createMemoryEmbedding(text);
  embeddingCache.set(text, { at: now, p });
  // 실패한 결과(null)는 기억하지 않는다 — 다음 호출이 다시 시도하게
  p.then((v) => {
    if (!v) embeddingCache.delete(text);
  });
  return p;
}

async function createMemoryEmbedding(text: string): Promise<number[] | null> {
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
