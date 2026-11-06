import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { accounts } from "@/lib/db";
import { CURRENCY, forgetStatus } from "@/lib/billing";

// Paystack webhook. Set this URL in Paystack -> Settings -> API Keys & Webhooks:
//   https://<your-domain>/api/billing/webhook
// It makes Pro reliable even if the buyer closes the tab before returning to the app,
// and refreshes status right away when a subscription is cancelled or a renewal fails.

interface PaystackEvent {
  event: string;
  data: {
    status?: string;
    currency?: string;
    metadata?: { app?: string; user_id?: string } | string | null;
    customer?: { id?: number; customer_code?: string; email?: string };
  };
}

function validSignature(raw: string, signature: string | null, secret: string) {
  if (!signature) return false;
  const expected = createHmac("sha512", secret).update(raw).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("x-paystack-signature"), secret)) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  let evt: PaystackEvent;
  try {
    evt = JSON.parse(raw) as PaystackEvent;
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  const customerId = evt.data?.customer?.id;
  if (customerId) forgetStatus(customerId);

  try {
    if (evt.event === "charge.success" && customerId && evt.data.status === "success" && evt.data.currency === CURRENCY) {
      const meta = typeof evt.data.metadata === "object" && evt.data.metadata ? evt.data.metadata : {};
      // Link the paying customer to the account that started checkout (only our own checkouts).
      if (meta.app === "eboclean" && meta.user_id && /^[A-Za-z0-9-]{1,64}$/.test(meta.user_id)) {
        await accounts().updateProfile(meta.user_id, {
          paystackCustomerId: customerId,
          paystackCustomerCode: evt.data.customer?.customer_code ?? null,
        });
      }
    }
  } catch (err) {
    console.error("Webhook handling failed", evt.event, err);
    // 500 makes Paystack retry later.
    return NextResponse.json({ error: "Retry" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
