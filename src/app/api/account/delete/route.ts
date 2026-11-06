import { NextResponse, type NextRequest } from "next/server";
import { accounts } from "@/lib/db";
import { getSession, clearSession } from "@/lib/session";
import { forgetStatus, isDemoBilling, paystack, type PaystackSubscription } from "@/lib/billing";

/**
 * Permanently deletes the signed-in account: stops any Paystack subscription so the
 * user is never charged again, then removes their photos, synced data and login.
 */
export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { confirm?: string };
  if (body.confirm !== "DELETE") return NextResponse.json({ error: "Type DELETE to confirm." }, { status: 400 });

  const db = accounts();
  const profile = await db.getProfile(session.uid, session.email);

  if (profile.paystackCustomerId && profile.paystackCustomerId > 0 && !isDemoBilling()) {
    try {
      const subs = await paystack<PaystackSubscription[]>(`/subscription?customer=${profile.paystackCustomerId}&perPage=50`);
      for (const s of subs.filter((x) => x.status === "active" || x.status === "non-renewing" || x.status === "attention")) {
        await paystack("/subscription/disable", { method: "POST", body: { code: s.subscription_code, token: s.email_token } });
      }
      forgetStatus(profile.paystackCustomerId);
    } catch (err) {
      console.error("Cancel subscription during account deletion failed", err);
      return NextResponse.json(
        { error: "We couldn't cancel your subscription, so your account wasn't deleted. Please try again in a minute." },
        { status: 502 },
      );
    }
  }

  try {
    await db.deleteAccount(session.uid);
  } catch (err) {
    console.error("Account deletion failed", err);
    return NextResponse.json({ error: "Something went wrong deleting your account. Please try again." }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true });
  clearSession(res);
  res.cookies.delete("cs_billing");
  res.cookies.delete("cs_usage");
  return res;
}
