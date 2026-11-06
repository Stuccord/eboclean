import { createHmac, timingSafeEqual } from "node:crypto";

// HMAC-signed tokens for cookies (sessions, billing, usage). Signing stops users editing them.

function secret() {
  const s = process.env.APP_SECRET ?? process.env.PAYSTACK_SECRET_KEY;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("Set APP_SECRET in production");
  return "dev-only-secret-change-me";
}

export function sign(value: object): string {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verify<T>(token: string | undefined): T | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString()) as T;
  } catch {
    return null;
  }
}

export const cookieOpts = (maxAgeSeconds: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: maxAgeSeconds,
});
