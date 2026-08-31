
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 브라우저 전용. service role 키는 절대 여기 쓰면 안 됨(노출됨).
export const supabaseClient = createClient(url, anonKey);
