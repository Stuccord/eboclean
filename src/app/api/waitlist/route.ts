import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { accounts } from "@/lib/db";
import { track } from "@/lib/events";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { normalizeEmail } from "@/lib/session";
import { SPOTS, WAITLIST_EVENT, WAITLIST_SPOT_EVENT } from "@/lib/waitlist";

const BodySchema = z.object({
  email: z.string().trim().email().max(254),
  spot: z.enum(SPOTS).optional(),
  /** Where they came from, e.g. ?ref=tiktok on the page link. */
  ref: z.string().trim().max(40).optional(),
  /** Honeypot: hidden from people, bots fill it in. */
  website: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  if (!rateLimit(`waitlist:${clientIp(req)}`, 20, 10 * 60_000)) {
    return NextResponse.json({ error: "Too many tries. Please wait a few minutes." }, { status: 429 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  // Pretend it worked so bots don't retry.
  if (body.website) return NextResponse.json({ ok: true, position: null });

  const email = normalizeEmail(body.email);
  try {
    const joined = await accounts().listEvents({ types: [WAITLIST_EVENT], limit: 50_000 });
    // listEvents is newest first; position counts from the oldest signup.
    const index = joined.findIndex((e) => e.email === email);
    if (index !== -1) {
      // Follow-up answer after joining ("messiest spot"): record it once, don't double-count the signup.
      if (body.spot && !joined[index].meta?.spot) {
        const answered = await accounts().listEvents({ types: [WAITLIST_SPOT_EVENT], limit: 50_000 });
        if (!answered.some((e) => e.email === email)) {
          await accounts().logEvent({
            at: Date.now(),
            type: WAITLIST_SPOT_EVENT,
            userId: null,
            email,
            amount: null,
            currency: null,
            meta: { spot: body.spot },
          });
        }
      }
      return NextResponse.json({ ok: true, already: true, position: joined.length - index });
    }
    await accounts().logEvent({
      at: Date.now(),
      type: WAITLIST_EVENT,
      userId: null,
      email,
      amount: null,
      currency: null,
      meta: { spot: body.spot ?? null, ref: body.ref || null },
    });
    return NextResponse.json({ ok: true, position: joined.length + 1 });
  } catch (err) {
    console.error("Waitlist signup failed", err);
    await track("waitlist.error", { meta: { error: err instanceof Error ? err.message.slice(0, 300) : String(err) } });
    return NextResponse.json({ error: "Couldn't save that. Please try again." }, { status: 502 });
  }
}
