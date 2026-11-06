import { NextResponse, type NextRequest } from "next/server";
import { DEMO_CUSTOMER_ID, forgetStatus, isDemoBilling, liveSubscription, loadBilling, paystack, PaystackError, saveBilling } from "@/lib/billing";

// Opens Paystack's hosted page where the customer can update their card or cancel.
export async function POST(req: NextRequest) {
  const state = await loadBilling(req);

  if (isDemoBilling() || state.customerId === DEMO_CUSTOMER_ID) {
    // Demo: "managing" simply cancels the simulated subscription.
    const res = NextResponse.json({ url: "/?portal=demo-cancelled", demo: true });
    await saveBilling(res, state, { customerId: null, customerCode: null });
    return res;
  }

  if (!state.customerId) {
    return NextResponse.json({ error: "No subscription found on this account." }, { status: 404 });
  }

  try {
    const sub = await liveSubscription(state.customerId);
    if (!sub) return NextResponse.json({ error: "No active subscription found." }, { status: 404 });
    forgetStatus(state.customerId);
    const data = await paystack<{ link: string }>(`/subscription/${encodeURIComponent(sub.subscription_code)}/manage/link`);
    return NextResponse.json({ url: data.link });
  } catch (err) {
    console.error("Paystack manage link error", err instanceof PaystackError ? err.message : err);
    return NextResponse.json({ error: "Couldn't open subscription settings. Please try again." }, { status: 502 });
  }
}
