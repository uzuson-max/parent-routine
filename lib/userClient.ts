"use client";

export interface UserProfile {
  nickname: string | null;
  phone_number: string | null;
  entry_count: number;
}

export async function fetchMe(accessToken: string): Promise<UserProfile | null> {
  try {
    const res = await fetch("/api/user/me", { headers: { Authorization: `Bearer ${accessToken}` } });
    const body = await res.json();
    if (!body.success) return null;
    return { nickname: body.nickname, phone_number: body.phone_number, entry_count: body.entry_count };
  } catch (e) {
    console.error("[userClient] fetchMe failed:", e);
    return null;
  }
}

export async function saveNickname(accessToken: string, nickname: string): Promise<boolean> {
  try {
    const res = await fetch("/api/user/nickname", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ nickname }),
    });
    const body = await res.json();
    return !!body.success;
  } catch (e) {
    console.error("[userClient] saveNickname failed:", e);
    return false;
  }
}

export async function savePhoneForEntry(accessToken: string, phoneNumber: string, entryId: string): Promise<any> {
  try {
    const res = await fetch("/api/user/phone", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ phone_number: phoneNumber, entryId }),
    });
    return await res.json();
  } catch (e) {
    console.error("[userClient] savePhoneForEntry failed:", e);
    return { success: false };
  }
}
