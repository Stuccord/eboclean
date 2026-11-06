import { NextResponse, type NextRequest } from "next/server";
import {
  activateCardTrial,
  CURRENCY,
  forgetStatus,
  isDemoBilling,
  loadBilling,
  originOf,
  paystack,
  PaystackError,
  PLANS,
  saveBilling,
  type PlanId,
} from "@/lib/billing";

interface VerifiedTransaction {
  status: string;
  currency: string;
  reference: string;
  customer: { id: number; customer_code: string; email: string };
  authorization?: { authorization_code?: string; reusable?: boolean };
  metadata?: { user_id?: string; kind?: string; plan?: string } | string | null;
}

// Paystack sends the user here after checkout (?reference=...). We verify the transaction with
// Paystack (never trust the URL alone), then either start the card trial or attach the subscription.
export async function GET(req: NextRequest) {
  const origin = originOf(req);
  const go = (outcome: string) => NextResponse.redirect(new URL(`/?checkout=${outcome}`, origin));
  const reference = req.nextUrl.searchParams.get("reference") ?? req.nextUrl.searchParams.get("trxref");
  if (isDemoBilling() || !reference || !/^[A-Za-z0-9\-.=]+$/.test(reference)) return go("error");

  try {
    const state = await loadBilling(req);
    const tx = await paystack<VerifiedTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`);
    const meta = typeof tx.metadata === "object" && tx.metadata ? tx.metadata : {};
    if (tx.status !== "success" || tx.currency !== CURRENCY || !tx.customer?.id) {
      return go(tx.status === "abandoned" ? "cancelled" : "error");
    }
    // The payment must belong to the signed-in account that started it.
    if (!state.userId || !state.email || meta.user_id !== state.userId) {
      console.error("Payment/account mismatch", { reference });
      return go("error");
    }

    if (meta.kind === "trial") {
      const plan: PlanId = meta.plan && meta.plan in PLANS ? (meta.plan as PlanId) : "yearly";
      if (!tx.authorization?.authorization_code || !tx.authorization.reusable) {
        await paystack("/refund", { method: "POST", body: { transaction: tx.reference } }).catch(() => undefined);
        return go("card-not-reusable");
      }
      await activateCardTrial({
        userId: state.userId,
        email: state.email,
        plan,
        reference: tx.reference,
        customerId: tx.customer.id,
        customerCode: tx.customer.customer_code,
        authorizationCode: tx.authorization.authorization_code,
      });
      return go("trial-started");
    }

    forgetStatus(tx.customer.id);
    const res = go("success");
    await saveBilling(res, state, { customerId: tx.customer.id, customerCode: tx.customer.customer_code });
    return res;
  } catch (err) {
    console.error("Paystack verify failed", err instanceof PaystackError ? err.message : err);
    return go("error");
  }
}
