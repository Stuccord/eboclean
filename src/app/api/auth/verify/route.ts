import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { accounts, AuthCodeError } from "@/lib/db";
import { mergeAnonymousIntoProfile } from "@/lib/billing";
import { normalizeEmail, setSession } from "@/lib/session";
import { track } from "@/lib/events";

const BodySchema = z.object({
  email: z.string().trim().email().max(254),
  code: z.string().trim().regex(/^\d{6}$/),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Enter the 6-digit code from your email." }, { status: 400 });
  }

  try {
    const backend = accounts();
    const user = await backend.verifyCode(normalizeEmail(body.email), body.code);
    await backend.getProfile(user.id, user.email); // creates it on first sign-in
    await track("user.sign_in", { userId: user.id, email: user.email });
    const res = NextResponse.json({ user: { id: user.id, email: user.email } });
    setSession(res, user);
    // Carry over anything done before signing in on this device (free usage, trial, demo subscription).
    await mergeAnonymousIntoProfile(req, res, user.id, user.email);
    return res;
  } catch (err) {
    if (err instanceof AuthCodeError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("Verify code failed", err);
    return NextResponse.json({ error: "Couldn't sign you in. Please try again." }, { status: 502 });
  }
}
