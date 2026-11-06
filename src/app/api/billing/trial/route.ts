import { NextResponse, type NextRequest } from "next/server";
import { loadBilling, saveBilling, trialEnd } from "@/lib/billing";

// Starts the 7-day Pro trial. No card needed; one trial per account.
export async function POST(req: NextRequest) {
  const state = await loadBilling(req);
  if (!state.userId) {
    return NextResponse.json({ error: "Create a free account to start your trial.", needLogin: true }, { status: 401 });
  }
  if (state.trialUsed) {
    return NextResponse.json({ error: "Your free trial has already been used." }, { status: 409 });
  }
  const res = NextResponse.json({ ok: true });
  await saveBilling(res, state, { trialUsed: true, trialEndsAt: trialEnd() });
  return res;
}
