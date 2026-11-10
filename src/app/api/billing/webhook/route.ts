import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { accounts } from "@/lib/db";
import { activateCardTrial, activateEarlyBird, CURRENCY, EARLY_BIRD_CENTS, forgetStatus, PLANS, type PlanId } from "@/lib/billing";
import { track } from "@/lib/events";
import { forgetPaystackCache } from "@/lib/admin";

// Paystack webhook. Set this URL in Paystack -> Settings -> API Keys & Webhooks:
//   https://<your-domain>/api/billing/webhook
// It makes Pro reliable even if the buyer closes the tab before returning to the app,
// and refreshes status right away when a subscription is cancelled or a renewal fails.

interface PaystackEvent {
  event: string;
  data: {
    status?: string;
    currency?: string;
    amount?: number;
    subscription_code?: string;
    plan?: { name?: string; plan_code?: string } | null;
    reference?: string;
    authorization?: { authorization_code?: string; reusable?: boolean };
    metadata?: { app?: string; user_id?: string; kind?: string; plan?: string } | string | null;
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
  forgetPaystackCache();

  const evtMeta = typeof evt.data?.metadata === "object" && evt.data.metadata ? evt.data.metadata : {};
  const linked = customerId ? await accounts().findByPaystackCustomer(customerId).catch(() => null) : null;
  await track(`paystack.${evt.event}`, {
    userId: linked?.id ?? (evtMeta.user_id && /^[A-Za-z0-9-]{1,64}$/.test(evtMeta.user_id) ? evtMeta.user_id : null),
    email: evt.data?.customer?.email ?? null,
    amount: typeof evt.data?.amount === "number" ? evt.data.amount : null,
    currency: evt.data?.currency ?? null,
    meta: {
      status: evt.data?.status ?? null,
      reference: evt.data?.reference ?? null,
      kind: evtMeta.kind ?? null,
      plan: evt.data?.plan?.name ?? evtMeta.plan ?? null,
      subscription: evt.data?.subscription_code ?? null,
      customerId: customerId ?? null,
    },
  });

  try {
    if (evt.event === "charge.success" && customerId && evt.data.status === "success" && evt.data.currency === CURRENCY) {
      const meta = typeof evt.data.metadata === "object" && evt.data.metadata ? evt.data.metadata : {};
      // Link the paying customer to the account that started checkout (only our own checkouts).
      const owned = meta.app === "eboclean" && meta.user_id && /^[A-Za-z0-9-]{1,64}$/.test(meta.user_id);
      if (owned && meta.kind === "earlybird") {
        // Buyer closed the tab before coming back: set up their early-bird year here instead.
        const auth = evt.data.authorization;
        if (
          evt.data.amount === EARLY_BIRD_CENTS &&
          auth?.authorization_code &&
          auth.reusable &&
          evt.data.reference &&
          evt.data.customer?.customer_code &&
          evt.data.customer.email
        ) {
          await activateEarlyBird({
            userId: meta.user_id!,
            email: evt.data.customer.email,
            reference: evt.data.reference,
            customerId,
            customerCode: evt.data.customer.customer_code,
            authorizationCode: auth.authorization_code,
          });
        }
      } else if (owned && meta.kind === "trial") {
        // Buyer closed the tab before coming back: start their trial here instead.
        const auth = evt.data.authorization;
        if (auth?.authorization_code && auth.reusable && evt.data.reference && evt.data.customer?.customer_code && evt.data.customer.email) {
          await activateCardTrial({
            userId: meta.user_id!,
            email: evt.data.customer.email,
            plan: meta.plan && meta.plan in PLANS ? (meta.plan as PlanId) : "yearly",
            reference: evt.data.reference,
            customerId,
            customerCode: evt.data.customer.customer_code,
            authorizationCode: auth.authorization_code,
          });
        }
      } else if (owned) {
        await accounts().updateProfile(meta.user_id!, {
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
