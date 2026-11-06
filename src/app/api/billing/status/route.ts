import { connection, NextResponse, type NextRequest } from "next/server";
import { FREE_LIMITS, isDemoBilling, isSubscribed, loadBilling, trialActive } from "@/lib/billing";

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
  const onTrial = !subscribed && trialActive(state);
  return NextResponse.json({
    pro: subscribed || onTrial,
    subscribed,
    onTrial,
    trialDaysLeft: onTrial && state.trialEndsAt ? Math.max(1, Math.ceil((state.trialEndsAt - Date.now()) / 86_400_000)) : 0,
    trialUsed: state.trialUsed,
    signedIn: Boolean(state.userId),
    email: state.email,
    demoBilling: isDemoBilling(),
    canManage: subscribed,
    usage: state.usage,
    limits: FREE_LIMITS,
  });
}
