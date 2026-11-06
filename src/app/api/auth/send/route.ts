import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { accounts, SendLimitError } from "@/lib/db";
import { normalizeEmail } from "@/lib/session";

const BodySchema = z.object({ email: z.string().trim().email().max(254) });

// Basic throttle: one code per email every 30 seconds (per server instance).
const lastSent = new Map<string, number>();
const COOLDOWN_MS = 30_000;

export async function POST(req: NextRequest) {
  let email: string;
  try {
    email = normalizeEmail(BodySchema.parse(await req.json()).email);
  } catch {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  const last = lastSent.get(email) ?? 0;
  if (Date.now() - last < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - (Date.now() - last)) / 1000);
    return NextResponse.json({ error: `Please wait ${wait} seconds before asking for another code.`, retryAfter: wait }, { status: 429 });
  }
  lastSent.set(email, Date.now());

  try {
    const backend = accounts();
    const { devCode } = await backend.sendCode(email);
    return NextResponse.json({ ok: true, devCode: backend.kind === "local" ? devCode : undefined });
  } catch (err) {
    if (err instanceof SendLimitError) {
      return NextResponse.json({ error: err.message, retryAfter: err.retryAfter }, { status: 429 });
    }
    lastSent.delete(email);
    console.error("Send code failed", err);
    return NextResponse.json({ error: "Couldn't send the code. Please try again." }, { status: 502 });
  }
}
