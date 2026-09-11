
//
// 전화번호 인증(연결/변경) 공통 로직. 온보딩 체크리스트 화면과 마이페이지(번호 변경) 화면이
// 둘 다 이걸 쓴다 — 두 곳에서 로직이 갈라지면 안 되는 부분이라 여기 하나로 모았다.
"use client";

import { supabaseClient } from "@/lib/supabaseClient";

// Supabase phone auth는 E.164(+82...) 형식을 요구한다.
export function normalizePhoneE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("82")) return "+" + digits;
  if (digits.startsWith("0")) return "+82" + digits.slice(1);
  return "+82" + digits;
}

export type PhoneLinkVerifyType = "phone_change" | "sms";

export interface RequestPhoneLinkResult {
  verifyType: PhoneLinkVerifyType | null;
  error: string | null;
}

/**
 * 지금 세션에 전화번호를 연결(인증) 요청한다.
 * - 먼저 지금 계정에 이 번호를 붙이는 걸 시도한다(updateUser) — 성공하면 지금까지의 기록이
 *   그대로 이 번호 계정에 남는다(user_id 안 바뀜).
 * - 그 번호가 이미 다른 계정에 등록되어 있으면:
 *   - allowExistingAccountFallback=true (온보딩/복구 상황): signInWithOtp로 전환해서
 *     그 기존 계정으로 로그인하는 흐름까지 자동으로 시도한다. 오늘 새로 생긴 빈 익명 계정은 버려진다.
 *   - allowExistingAccountFallback=false (마이페이지에서 번호 변경): 에러만 반환한다.
 *     이미 로그인된 계정에서 실수로 다른 계정으로 세션이 넘어가버리면 안 되기 때문이다.
 */
export async function requestPhoneLink(
  phoneRaw: string,
  { allowExistingAccountFallback }: { allowExistingAccountFallback: boolean }
): Promise<RequestPhoneLinkResult> {
  const e164 = normalizePhoneE164(phoneRaw);
  const { error: updateError } = await supabaseClient.auth.updateUser({ phone: e164 });

  if (!updateError) {
    return { verifyType: "phone_change", error: null };
  }

  const alreadyRegistered =
    (updateError as any)?.code === "phone_exists" ||
    updateError.message?.toLowerCase().includes("already");

  if (alreadyRegistered) {
    if (!allowExistingAccountFallback) {
      return { verifyType: null, error: "이 번호는 이미 다른 계정에 등록되어 있어. 다른 번호를 써줘." };
    }
    const { error: otpError } = await supabaseClient.auth.signInWithOtp({ phone: e164 });
    if (otpError) {
      console.error("[phoneAuthClient] signInWithOtp 실패:", otpError.message);
      return { verifyType: null, error: "인증번호를 보내지 못했어. 번호를 다시 확인해줘." };
    }
    return { verifyType: "sms", error: null };
  }

  console.error("[phoneAuthClient] 인증번호 요청 실패:", updateError.message);
  return { verifyType: null, error: "인증번호를 보내지 못했어. 번호를 다시 확인해줘." };
}

export async function confirmPhoneCode(
  phoneRaw: string,
  code: string,
  verifyType: PhoneLinkVerifyType
): Promise<{ error: string | null }> {
  const e164 = normalizePhoneE164(phoneRaw);
  const { error } = await supabaseClient.auth.verifyOtp({ phone: e164, token: code, type: verifyType });
  if (error) {
    console.error("[phoneAuthClient] 인증 실패:", error.message);
    return { error: "인증번호가 맞지 않아. 다시 확인해줘." };
  }
  return { error: null };
}
