import { NextResponse, type NextRequest } from "next/server";
import { accounts } from "@/lib/db";
import { adminEmails, loadAdminData, userStatus } from "@/lib/admin";
import { getSession } from "@/lib/session";
import { CURRENCY, TRIAL_DAYS } from "@/lib/billing";
import { emailConfigured, sendEmails } from "@/lib/email";
import { track } from "@/lib/events";

// Daily job (see vercel.json): emails people whose free trial ends within the next 36 hours that their
// card will be charged, with how to cancel. With a 3-day trial and one run a day, that is day 2 of the
// trial, which is what the paywall promises. Fewer surprise charges means fewer disputes and chargebacks.
// Vercel calls it with "Authorization: Bearer <CRON_SECRET>". An admin can also run it from /admin.

const DAY = 86_400_000;
const REMIND_WITHIN = 36 * 3_600_000;

function money(minor: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: CURRENCY }).format(minor / 100);
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const fromCron = Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
  const s = getSession(req);
  const fromAdmin = Boolean(s && adminEmails().includes(s.email.toLowerCase()));
  if (!fromCron && !fromAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!emailConfigured()) return NextResponse.json({ ok: false, error: "Email isn't set up (RESEND_API_KEY, EMAIL_FROM)." });

  const now = Date.now();
  const d = await loadAdminData();
  const alreadyReminded = new Set(
    (await accounts().listEvents({ types: ["email.trial_reminder"], since: now - 10 * DAY, limit: 10_000 })).map((e) => e.userId),
  );

  const due = d.profiles
    .filter((p) => p.trialEndsAt && p.trialEndsAt > now && p.trialEndsAt <= now + REMIND_WITHIN && !alreadyReminded.has(p.id))
    .map((p) => ({ p, ...userStatus(p, p.paystackCustomerId ? (d.subsByCustomer.get(p.paystackCustomerId) ?? []) : [], now) }))
    .filter((x) => x.status === "trialing");

  let sent = 0;
  for (const { p, sub } of due) {
    const when = new Date(p.trialEndsAt!).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
    const price = sub?.amount ? `${money(sub.amount)} for your ${sub.plan?.interval === "annually" ? "yearly" : (sub.plan?.interval ?? "")} plan` : "your plan";
    const r = await sendEmails([
      {
        to: p.email,
        userId: p.id,
        kind: "billing",
        subject: "Your Eboclean free trial ends soon",
        body: `Hi there,

Your ${TRIAL_DAYS}-day free trial of Eboclean ends on ${when}. On that day your card will be charged ${price}, and Eboclean Pro continues without a break.

Want to keep going? You don't need to do anything.

Not for you? Cancel before ${when} and you won't be charged: open Eboclean, go to Progress, then "Manage or cancel subscription".

Thanks for cleaning with us,
The Eboclean team`,
      },
    ]);
    if (r.sent) {
      sent++;
      await track("email.trial_reminder", { userId: p.id, email: p.email, meta: { trialEndsAt: p.trialEndsAt } });
    }
  }
  return NextResponse.json({ ok: true, due: due.length, sent });
}
