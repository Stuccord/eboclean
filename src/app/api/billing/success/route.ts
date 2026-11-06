import { NextResponse, type NextRequest } from "next/server";
import { CURRENCY, forgetStatus, isDemoBilling, loadBilling, originOf, paystack, PaystackError, saveBilling } from "@/lib/billing";

interface VerifiedTransaction {
  status: string;
  currency: string;
  customer: { id: number; customer_code: string; email: string };
  metadata?: { user_id?: string } | string | null;
}

// Paystack sends the user here after checkout (?reference=...). We verify the
// transaction with Paystack (never trust the URL alone) and attach the customer to the account.
export async function GET(req: NextRequest) {
  const origin = originOf(req);
  const reference = req.nextUrl.searchParams.get("reference") ?? req.nextUrl.searchParams.get("trxref");
  if (isDemoBilling() || !reference || !/^[A-Za-z0-9\-.=]+$/.test(reference)) {
    return NextResponse.redirect(new URL("/?checkout=error", origin));
  }

  try {
    const state = await loadBilling(req);
    const tx = await paystack<VerifiedTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`);
    const meta = typeof tx.metadata === "object" && tx.metadata ? tx.metadata : {};
    if (tx.status !== "success" || tx.currency !== CURRENCY || !tx.customer?.id) {
      const outcome = tx.status === "abandoned" ? "cancelled" : "error";
      return NextResponse.redirect(new URL(`/?checkout=${outcome}`, origin));
    }
    // The payment must belong to the signed-in account that started it.
    if (!state.userId || (meta.user_id && meta.user_id !== state.userId)) {
      console.error("Payment/account mismatch", { reference });
      return NextResponse.redirect(new URL("/?checkout=error", origin));
    }
    forgetStatus(tx.customer.id);
    const res = NextResponse.redirect(new URL("/?checkout=success", origin));
    await saveBilling(res, state, { customerId: tx.customer.id, customerCode: tx.customer.customer_code });
    return res;
  } catch (err) {
    console.error("Paystack verify failed", err instanceof PaystackError ? err.message : err);
    return NextResponse.redirect(new URL("/?checkout=error", origin));
  }
}
