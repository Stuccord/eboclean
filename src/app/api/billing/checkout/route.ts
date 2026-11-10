import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  CURRENCY,
  DEMO_CUSTOMER_ID,
  EARLY_BIRD_CENTS,
  earlyBirdOffer,
  isDemoBilling,
  loadBilling,
  originOf,
  paystack,
  PaystackError,
  planCode,
  PLANS,
  saveBilling,
  TRIAL_CARD_CHECK,
  TRIAL_PLAN,
  trialEnd,
} from "@/lib/billing";
import { track } from "@/lib/events";

const BodySchema = z.object({
  plan: z.enum(["yearly", "monthly"]),
  trial: z.boolean().optional(),
  /** Early waitlist members: first year at EARLY_BIRD_CENTS, paid now, no trial. */
  earlyBird: z.boolean().optional(),
});

/**
 * Starts a Paystack checkout.
 * - trial: true  -> a small card check (refunded) that saves the card; the subscription's first
 *                   charge is scheduled for the end of the free trial (see /api/billing/success).
 *                   Only the yearly plan has a trial.
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
  if (body.earlyBird) {
    if (plan !== "yearly" || body.trial) return NextResponse.json({ error: "The early-bird price is for the yearly plan." }, { status: 400 });
    const offer = await earlyBirdOffer(state);
    if (!offer) return NextResponse.json({ error: "This early-bird price is for early waitlist members." }, { status: 403 });
    await track("checkout.earlybird", { userId: state.userId, email: state.email, meta: { plan, position: offer.position } });

    if (isDemoBilling()) {
      const res = NextResponse.json({ url: "/?checkout=earlybird-started", demo: true });
      await saveBilling(res, state, { customerId: DEMO_CUSTOMER_ID, customerCode: null, trialUsed: true, trialEndsAt: null });
      await track("earlybird.purchased", { userId: state.userId, email: state.email, amount: EARLY_BIRD_CENTS, currency: CURRENCY, meta: { demo: true } });
      return res;
    }
    if (!planCode("yearly")) {
      console.error(`Missing ${PLANS.yearly.env}`);
      return NextResponse.json({ error: "Payments aren't set up yet." }, { status: 500 });
    }
    try {
      // A one-off charge for the first year; the yearly subscription is created after payment,
      // with its first full-price charge a year from now (see /api/billing/success).
      const data = await paystack<{ authorization_url: string }>("/transaction/initialize", {
        method: "POST",
        body: {
          email: state.email,
          amount: EARLY_BIRD_CENTS,
          currency: CURRENCY,
          channels: ["card"],
          callback_url: `${originOf(req)}/api/billing/success`,
          metadata: { app: "eboclean", kind: "earlybird", plan, user_id: state.userId },
        },
      });
      return NextResponse.json({ url: data.authorization_url });
    } catch (err) {
      console.error("Paystack initialize error", err instanceof PaystackError ? err.message : err);
      return NextResponse.json({ error: "Couldn't start checkout. Please try again." }, { status: 502 });
    }
  }

  const wantsTrial = Boolean(body.trial);
  if (wantsTrial && plan !== TRIAL_PLAN) {
    return NextResponse.json({ error: "The free trial is only on the yearly plan." }, { status: 400 });
  }
  if (wantsTrial && state.trialUsed) {
    return NextResponse.json({ error: "Your free trial has already been used. Choose a plan to continue." }, { status: 409 });
  }

  await track(wantsTrial ? "checkout.trial" : "checkout.subscribe", { userId: state.userId, email: state.email, meta: { plan } });

  // Demo billing: no Paystack key yet, so simulate it.
  if (isDemoBilling()) {
    if (wantsTrial) await track("trial.started", { userId: state.userId, email: state.email, meta: { plan, demo: true } });
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
