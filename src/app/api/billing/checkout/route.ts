import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { CURRENCY, DEMO_CUSTOMER_ID, isDemoBilling, loadBilling, originOf, paystack, PaystackError, PLANS, saveBilling } from "@/lib/billing";

const BodySchema = z.object({ plan: z.enum(["yearly", "monthly"]) });

export async function POST(req: NextRequest) {
  let plan: keyof typeof PLANS;
  try {
    plan = BodySchema.parse(await req.json()).plan;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const state = await loadBilling(req);
  if (!state.userId || !state.email) {
    return NextResponse.json({ error: "Create a free account first so your subscription works on every device.", needLogin: true }, { status: 401 });
  }

  // Demo billing: no Paystack key yet, so simulate a successful subscription.
  if (isDemoBilling()) {
    const res = NextResponse.json({ url: "/?checkout=success&demo=1", demo: true });
    await saveBilling(res, state, { customerId: DEMO_CUSTOMER_ID, customerCode: null });
    return res;
  }

  const planCode = process.env[PLANS[plan].env];
  if (!planCode) {
    console.error(`Missing ${PLANS[plan].env}`);
    return NextResponse.json({ error: "Payments aren't set up yet." }, { status: 500 });
  }

  try {
    // Passing a plan subscribes the customer after payment. The plan's own
    // price (set in USD on Paystack) is what gets charged.
    const data = await paystack<{ authorization_url: string; reference: string }>("/transaction/initialize", {
      method: "POST",
      body: {
        email: state.email,
        amount: PLANS[plan].cents,
        currency: CURRENCY,
        plan: planCode,
        channels: ["card"],
        callback_url: `${originOf(req)}/api/billing/success`,
        metadata: { app: "eboclean", plan, user_id: state.userId },
      },
    });
    return NextResponse.json({ url: data.authorization_url });
  } catch (err) {
    console.error("Paystack initialize error", err instanceof PaystackError ? err.message : err);
    return NextResponse.json({ error: "Couldn't start checkout. Please try again." }, { status: 502 });
  }
}
