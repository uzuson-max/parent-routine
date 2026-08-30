
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 클라이언트가 보낸 Authorization: Bearer <access_token>을 검증해서 user_id를 뽑아낸다.
// 서버 라우트(service role)는 RLS를 우회하므로, 소유권 확인은 반드시 여기서 직접 해야 한다.
export async function getUserIdFromRequest(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length);

  const client = createClient(url, anonKey);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) {
    console.error("[auth] 토큰 검증 실패:", error?.message);
    return null;
  }
  return data.user.id;
}
