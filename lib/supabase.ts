import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("Supabase env vars are missing at runtime");
    }
    _client = createClient(url, key);
  }
  return _client;
}

// 기존 코드 전체가 `import { supabase } from '@/lib/supabase'` 형태로 쓰고 있으므로
// 이름은 그대로 유지하되, 실제 속성 접근 시점(런타임)에만 클라이언트를 생성하도록 Proxy로 감쌈.
// → 빌드 타임엔 절대 실행되지 않아서 env 없어도 빌드는 통과함.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getClient();
    return (client as any)[prop];
  },
});

// 제가 이전에 lib/aiAnalysis.ts, memoryEngine.ts 등에서 쓴 함수형 이름도 계속 동작하도록 별칭 유지
export function getSupabaseClient(): SupabaseClient {
  return supabase;
}
