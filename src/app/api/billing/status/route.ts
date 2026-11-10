import { connection, NextResponse, type NextRequest } from "next/server";
import { earlyBirdOffer, isDemoBilling, isSubscribed, loadBilling, trialActive } from "@/lib/billing";

export async function GET(req: NextRequest) {
  await connection(); // always per-request (reads cookies); never prerendered
  let state;
  try {
    state = await loadBilling(req);
  } catch (err) {
    console.error("Load billing failed", err);
    return NextResponse.json({ error: "Couldn't load your plan." }, { status: 502 });
  }
  let subscribed = false;
  try {
    subscribed = await isSubscribed(state);
  } catch (err) {
    console.error("Subscription check failed", err);
    subscribed = Boolean(state.customerId);
  }
  // A card trial is also a (scheduled) subscription, so "onTrial" can be true alongside "subscribed".
  const onTrial = trialActive(state);
  // Early waitlist members see the early-bird price instead of the trial (only while not Pro).
  const earlyBird = subscribed || onTrial ? null : await earlyBirdOffer(state).catch(() => null);
  return NextResponse.json({
    pro: subscribed || onTrial,
    subscribed,
    onTrial,
    trialDaysLeft: onTrial && state.trialEndsAt ? Math.max(1, Math.ceil((state.trialEndsAt - Date.now()) / 86_400_000)) : 0,
    trialUsed: state.trialUsed,
    signedIn: Boolean(state.userId),
    email: state.email,
    demoBilling: isDemoBilling(),
    trialEndsAt: onTrial ? state.trialEndsAt : null,
    canManage: subscribed,
    earlyBird,
  });
}
