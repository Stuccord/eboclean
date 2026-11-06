import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { forgetPaystackCache, isCardCheck, loadAdminData, requireAdmin } from "@/lib/admin";
import { isDemoBilling, paystack } from "@/lib/billing";
import { track } from "@/lib/events";

// Money in (payments) and out (refunds) from Paystack, last 12 months.
export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const d = await loadAdminData();
    const byCustomer = new Map(d.profiles.filter((p) => p.paystackCustomerId).map((p) => [p.paystackCustomerId!, p]));
    const refundedIds = new Map<number, number>();
    for (const r of d.refunds) {
      if (r.status === "failed") continue;
      const txId = typeof r.transaction === "object" ? r.transaction?.id : r.transaction;
      if (txId) refundedIds.set(txId, (refundedIds.get(txId) ?? 0) + r.amount);
    }
    const transactions = d.txs
      .map((t) => {
        const user = t.customer?.id ? byCustomer.get(t.customer.id) : undefined;
        const cardCheck = isCardCheck(t);
        return {
          id: t.id,
          reference: t.reference,
          at: Date.parse(t.paid_at ?? t.created_at ?? t.createdAt ?? "") || 0,
          amount: t.amount,
          currency: t.currency,
          status: t.status,
          fees: t.fees ?? 0,
          email: t.customer?.email ?? user?.email ?? "",
          userId: user?.id ?? null,
          kind: cardCheck ? "Trial card check" : t.plan && typeof t.plan === "object" && Object.keys(t.plan).length ? "Subscription" : "Payment",
          channel: t.channel ?? "",
          message: t.gateway_response ?? "",
          refunded: refundedIds.get(t.id) ?? 0,
        };
      })
      .sort((a, b) => b.at - a.at);
    const refunds = d.refunds
      .map((r) => ({
        id: r.id,
        at: Date.parse(r.createdAt ?? "") || 0,
        amount: r.amount,
        currency: r.currency,
        status: r.status,
        transactionId: typeof r.transaction === "object" ? r.transaction?.id : r.transaction,
        reference: typeof r.transaction === "object" ? (r.transaction?.reference ?? "") : "",
      }))
      .sort((a, b) => b.at - a.at);
    return NextResponse.json(
      { transactions, refunds, demo: isDemoBilling(), paystackError: d.paystackError },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("Admin payments failed", err);
    return NextResponse.json({ error: "Couldn't load payments." }, { status: 500 });
  }
}

const RefundSchema = z.object({
  action: z.literal("refund"),
  transactionId: z.number().int().positive(),
  /** Smallest currency unit; omit for a full refund. */
  amount: z.number().int().positive().optional(),
  reason: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  let body: z.infer<typeof RefundSchema>;
  try {
    body = RefundSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (isDemoBilling()) return NextResponse.json({ error: "Payments are simulated; there's nothing to refund." }, { status: 400 });
  try {
    await paystack("/refund", {
      method: "POST",
      body: { transaction: body.transactionId, ...(body.amount ? { amount: body.amount } : {}), merchant_note: body.reason ?? `Refunded by ${admin.email}` },
    });
    forgetPaystackCache();
    await track("admin.action", { amount: body.amount ?? null, meta: { by: admin.email, action: "refund", transactionId: body.transactionId, reason: body.reason ?? null } });
    return NextResponse.json({ ok: true, message: "Refund started. Paystack usually completes it within a few days." });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Refund failed." }, { status: 502 });
  }
}
