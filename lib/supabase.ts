import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!_client) {
    // 서버사이드 라우트에서는 NEXT_PUBLIC_ 접두어 없어도 됨 (Vercel 서버 환경변수로 충분)
    // 다만 프로젝트에 따라 이름이 다를 수 있어 둘 다 체크
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      console.error(
        "[supabase] env vars missing at runtime:",
        `SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL=${!!url}, SUPABASE_SERVICE_ROLE_KEY=${!!key}`
      );
      throw new Error("Supabase env vars are missing at runtime");
    }
    _client = createClient(url, key);
  }
  return _client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getClient();
    return (client as any)[prop];
  },
});

export function getSupabaseClient(): SupabaseClient {
  return supabase;
}
