import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { accounts } from "@/lib/db";
import { forgetPaystackCache, isCardCheck, requireAdmin, userStatus, type PsSub, type PsTx } from "@/lib/admin";
import { DEMO_CUSTOMER_ID, forgetStatus, isDemoBilling, paystack } from "@/lib/billing";
import { sendEmails } from "@/lib/email";
import { track } from "@/lib/events";

const ID_RE = /^[A-Za-z0-9-]{1,64}$/;
const DAY = 86_400_000;

async function customerData(customerId: number | null) {
  if (!customerId || customerId === DEMO_CUSTOMER_ID || isDemoBilling()) return { subs: [] as PsSub[], txs: [] as PsTx[], error: null };
  try {
    const [subs, txs] = await Promise.all([
      paystack<PsSub[]>(`/subscription?customer=${customerId}&perPage=50`),
      paystack<PsTx[]>(`/transaction?customer=${customerId}&perPage=100`),
    ]);
    return { subs, txs, error: null };
  } catch (err) {
    return { subs: [] as PsSub[], txs: [] as PsTx[], error: err instanceof Error ? err.message : "Paystack error" };
  }
}

// One user: profile, subscription, payments, activity and their saved home.
export async function GET(req: NextRequest, ctx: RouteContext<"/api/admin/users/[id]">) {
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });

  const db = accounts();
  const profile = await db.findProfile(id);
  if (!profile) return NextResponse.json({ error: "User not found." }, { status: 404 });
  const [ps, events, home] = await Promise.all([
    customerData(profile.paystackCustomerId),
    db.listEvents({ userId: id, limit: 300 }).catch(() => []),
    db.getData(id).catch(() => null),
  ]);
  const { status } = userStatus(profile, ps.subs);
  return NextResponse.json(
    {
      profile,
      status,
      subscriptions: ps.subs,
      transactions: ps.txs.map((t) => ({ ...t, cardCheck: isCardCheck(t) })),
      paystackError: ps.error,
      events,
      home: home ? { rooms: home.rooms.length, history: home.history.length, updatedAt: home.updatedAt } : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("give_days"), days: z.number().int().min(1).max(365) }),
  z.object({ action: z.literal("end_access") }),
  z.object({ action: z.literal("reset_daily_limit") }),
  z.object({ action: z.literal("cancel_subscription") }),
  z.object({ action: z.literal("delete_account"), confirm: z.literal("DELETE") }),
  z.object({ action: z.literal("email"), subject: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(20_000) }),
]);

async function cancelAll(customerId: number | null) {
  if (!customerId || customerId === DEMO_CUSTOMER_ID || isDemoBilling()) return 0;
  const subs = await paystack<PsSub[]>(`/subscription?customer=${customerId}&perPage=50`);
  const live = subs.filter((s) => s.status === "active" || s.status === "non-renewing" || s.status === "attention");
  for (const s of live) {
    await paystack("/subscription/disable", { method: "POST", body: { code: s.subscription_code, token: s.email_token } });
  }
  forgetStatus(customerId);
  forgetPaystackCache();
  return live.length;
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/admin/users/[id]">) {
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });

  let body: z.infer<typeof ActionSchema>;
  try {
    body = ActionSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  const db = accounts();
  const profile = await db.findProfile(id);
  if (!profile) return NextResponse.json({ error: "User not found." }, { status: 404 });
  const log = (detail: Record<string, unknown>) =>
    track("admin.action", { userId: id, email: profile.email, meta: { by: admin.email, action: body.action, ...detail } });

  try {
    switch (body.action) {
      case "give_days": {
        const from = Math.max(Date.now(), profile.trialEndsAt ?? 0);
        const trialEndsAt = from + body.days * DAY;
        await db.updateProfile(id, { trialEndsAt, trialUsed: true });
        await log({ days: body.days, until: trialEndsAt });
        return NextResponse.json({ ok: true, message: `Free access until ${new Date(trialEndsAt).toUTCString()}.` });
      }
      case "end_access": {
        await db.updateProfile(id, { trialEndsAt: Date.now() - 1000 });
        await log({});
        return NextResponse.json({ ok: true, message: "Free access ended. A paid subscription still counts." });
      }
      case "reset_daily_limit": {
        await db.updateProfile(id, { aiCount: 0 });
        await log({});
        return NextResponse.json({ ok: true, message: "Today's scan count reset." });
      }
      case "cancel_subscription": {
        const n = await cancelAll(profile.paystackCustomerId);
        if (profile.paystackCustomerId === DEMO_CUSTOMER_ID) await db.updateProfile(id, { paystackCustomerId: null });
        await log({ cancelled: n });
        return NextResponse.json({ ok: true, message: n ? `Cancelled ${n} subscription(s). No more charges.` : "No live subscription to cancel." });
      }
      case "delete_account": {
        await cancelAll(profile.paystackCustomerId);
        await db.deleteAccount(id);
        await log({});
        return NextResponse.json({ ok: true, message: "Account deleted and subscription cancelled.", deleted: true });
      }
      case "email": {
        const r = await sendEmails([{ to: profile.email, userId: id, subject: body.subject, body: body.body, kind: "billing" }]);
        if (!r.sent) return NextResponse.json({ error: r.error ?? "Couldn't send." }, { status: 502 });
        await track("email.direct", { userId: id, email: profile.email, meta: { by: admin.email, subject: body.subject } });
        return NextResponse.json({ ok: true, message: `Email sent to ${profile.email}.` });
      }
    }
  } catch (err) {
    console.error("Admin action failed", body.action, err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Action failed." }, { status: 502 });
  }
}

