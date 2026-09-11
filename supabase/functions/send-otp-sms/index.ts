
import { SolapiMessageService } from "npm:solapi@^5";

function toSolapiLocalNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("82")) return "0" + digits.slice(2);
  if (digits.startsWith("0")) return digits;
  return "0" + digits;
}

async function verifySignature(req: Request, rawBody: string): Promise<boolean> {
  const secretEnv = Deno.env.get("SEND_SMS_HOOK_SECRET");
  if (!secretEnv) throw new Error("SEND_SMS_HOOK_SECRET 환경변수가 없습니다");
  const secretB64 = secretEnv.split(",").pop()!.replace(/^whsec_/, "");
  const keyBytes = Uint8Array.from(atob(secretB64), (c) => c.charCodeAt(0));

  const webhookId = req.headers.get("webhook-id");
  const webhookTimestamp = req.headers.get("webhook-timestamp");
  const webhookSignature = req.headers.get("webhook-signature");
  if (!webhookId || !webhookTimestamp || !webhookSignature) return false;

  const tsSeconds = Number(webhookTimestamp);
  if (!Number.isFinite(tsSeconds) || Math.abs(Date.now() / 1000 - tsSeconds) > 300) return false;

  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;
  const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(signedContent));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));

  const candidates = webhookSignature.split(" ").map((s) => s.split(",")[1]);
  return candidates.includes(expected);
}

Deno.serve(async (req: Request) => {
  const rawBody = await req.text();
  try {
    if (!(await verifySignature(req, rawBody))) return new Response(null, { status: 401 });
  } catch { return new Response(null, { status: 500 }); }

  const payload = JSON.parse(rawBody || "{}");
  const phone = payload.user?.phone;
  const otp = payload.sms?.otp;
  if (!phone || !otp) return new Response(null, { status: 400 });

  const apiKey = Deno.env.get("SOLAPI_API_KEY");
  const apiSecret = Deno.env.get("SOLAPI_API_SECRET");
  const senderNumber = Deno.env.get("SOLAPI_SENDER_NUMBER");
  if (!apiKey || !apiSecret || !senderNumber) return new Response(null, { status: 500 });

  try {
    const messageService = new SolapiMessageService(apiKey, apiSecret);
    const result = await messageService.send({
      to: toSolapiLocalNumber(phone),
      from: toSolapiLocalNumber(senderNumber),
      text: `[참견이] 인증번호는 ${otp} 입니다.`,
    });
    if (((result as any)?.count?.registeredFailed ?? 0) > 0) return new Response(null, { status: 500 });
  } catch { return new Response(null, { status: 500 }); }

  return new Response(null, { status: 200 });
});
