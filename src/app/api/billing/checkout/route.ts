import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  CURRENCY,
  DEMO_CUSTOMER_ID,
  isDemoBilling,
  loadBilling,
  originOf,
  paystack,
  PaystackError,
  planCode,
  PLANS,
  saveBilling,
  TRIAL_CARD_CHECK,
  trialEnd,
} from "@/lib/billing";

const BodySchema = z.object({ plan: z.enum(["yearly", "monthly"]), trial: z.boolean().optional() });

/**
 * Starts a Paystack checkout.
 * - trial: true  -> a small card check (refunded) that saves the card; the subscription's first
 *                   charge is scheduled for the end of the 7-day trial (see /api/billing/success).
 * - otherwise    -> pay now for the chosen plan.
 */
export async function POST(req: NextRequest) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { plan } = body;

  const state = await loadBilling(req);
  if (!state.userId || !state.email) {
    return NextResponse.json({ error: "Please sign in first.", needLogin: true }, { status: 401 });
  }
  const wantsTrial = Boolean(body.trial);
  if (wantsTrial && state.trialUsed) {
    return NextResponse.json({ error: "Your free trial has already been used. Choose a plan to continue." }, { status: 409 });
  }

  // Demo billing: no Paystack key yet, so simulate it.
  if (isDemoBilling()) {
    const res = NextResponse.json({ url: wantsTrial ? "/?checkout=trial-started" : "/?checkout=success", demo: true });
    await saveBilling(
      res,
      state,
      wantsTrial
        ? { customerId: DEMO_CUSTOMER_ID, customerCode: null, trialUsed: true, trialEndsAt: trialEnd() }
        : { customerId: DEMO_CUSTOMER_ID, customerCode: null },
    );
    return res;
  }

  const code = planCode(plan);
  if (!code) {
    console.error(`Missing ${PLANS[plan].env}`);
    return NextResponse.json({ error: "Payments aren't set up yet." }, { status: 500 });
  }

  try {
    const data = await paystack<{ authorization_url: string; reference: string }>("/transaction/initialize", {
      method: "POST",
      body: wantsTrial
        ? {
            email: state.email,
            amount: TRIAL_CARD_CHECK,
            currency: CURRENCY,
            channels: ["card"],
            callback_url: `${originOf(req)}/api/billing/success`,
            metadata: { app: "eboclean", kind: "trial", plan, user_id: state.userId },
          }
        : {
            // Passing a plan subscribes the customer after payment at the plan's price.
            email: state.email,
            amount: PLANS[plan].cents,
            currency: CURRENCY,
            plan: code,
            channels: ["card"],
            callback_url: `${originOf(req)}/api/billing/success`,
            metadata: { app: "eboclean", kind: "subscribe", plan, user_id: state.userId },
          },
    });
    return NextResponse.json({ url: data.authorization_url });
  } catch (err) {
    console.error("Paystack initialize error", err instanceof PaystackError ? err.message : err);
    return NextResponse.json({ error: "Couldn't start checkout. Please try again." }, { status: 502 });
  }
}
