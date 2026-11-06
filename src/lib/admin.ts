import { NextResponse, type NextRequest } from "next/server";
import { accounts, type AdminProfile, type AppEvent } from "./db";
import { CURRENCY, DEMO_CUSTOMER_ID, isDemoBilling, paystack, PLANS, TRIAL_CARD_CHECK } from "./billing";
import { isDemoMode } from "./apiHelpers";
import { emailConfigured } from "./email";
import { getSession, type Session } from "./session";

// Data and access control for the admin dashboard (/admin).
// Admins are the signed-in accounts whose email is listed in ADMIN_EMAILS (comma-separated).

const DAY = 86_400_000;

export function adminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** The admin's session, or an error response to return as-is. */
export function requireAdmin(req: NextRequest): Session | NextResponse {
  const s = getSession(req);
  if (!s) return NextResponse.json({ error: "Sign in first.", needLogin: true }, { status: 401 });
  if (!adminEmails().includes(s.email.toLowerCase())) {
    return NextResponse.json({ error: "This account isn't an admin.", notAdmin: true, email: s.email }, { status: 403 });
  }
  return s;
}

// ---------------- Paystack data ----------------
export interface PsCustomer {
  id: number;
  email: string;
  customer_code: string;
}

export interface PsSub {
  id: number;
  status: string; // active | non-renewing | attention | completed | cancelled
  subscription_code: string;
  email_token: string;
  amount: number;
  next_payment_date: string | null;
  createdAt?: string;
  plan?: { name?: string; plan_code?: string; interval?: string; amount?: number; currency?: string };
  customer?: PsCustomer | number;
}

export interface PsTx {
  id: number;
  reference: string;
  amount: number;
  currency: string;
  status: string; // success | failed | abandoned | reversed | ...
  paid_at: string | null;
  created_at?: string;
  createdAt?: string;
  channel?: string;
  gateway_response?: string;
  fees?: number | null;
  customer?: PsCustomer;
  metadata?: unknown;
  plan?: unknown;
}

export interface PsRefund {
  id: number;
  amount: number;
  currency: string;
  status: string;
  createdAt?: string;
  transaction?: number | { id: number; reference?: string };
  customer?: PsCustomer | number;
}

const psCache = new Map<string, { at: number; data: unknown }>();
const PS_CACHE_MS = 60_000;

/** All pages of a Paystack list endpoint (cached for a minute). */
async function paystackAll<T>(path: string, maxPages = 20): Promise<T[]> {
  const hit = psCache.get(path);
  if (hit && Date.now() - hit.at < PS_CACHE_MS) return hit.data as T[];
  const out: T[] = [];
  const sep = path.includes("?") ? "&" : "?";
  for (let page = 1; page <= maxPages; page++) {
    const rows = await paystack<T[]>(`${path}${sep}perPage=100&page=${page}`);
    out.push(...rows);
    if (rows.length < 100) break;
  }
  psCache.set(path, { at: Date.now(), data: out });
  return out;
}

export function forgetPaystackCache() {
  psCache.clear();
}

function txTime(t: PsTx) {
  return Date.parse(t.paid_at ?? t.created_at ?? t.createdAt ?? "") || 0;
}

function meta(t: PsTx): Record<string, unknown> {
  if (t.metadata && typeof t.metadata === "object") return t.metadata as Record<string, unknown>;
  if (typeof t.metadata === "string") {
    try {
      return JSON.parse(t.metadata) as Record<string, unknown>;
    } catch {}
  }
  return {};
}

/** The refundable $1 card check taken when a trial starts; not revenue. */
export function isCardCheck(t: PsTx) {
  const m = meta(t);
  return m.kind === "trial" || (t.amount === TRIAL_CARD_CHECK && !m.kind && !t.plan);
}

function subCustomerId(s: PsSub | PsRefund) {
  return typeof s.customer === "object" ? s.customer?.id : s.customer;
}

const PER_MONTH: Record<string, number> = {
  hourly: 730,
  daily: 30.4,
  weekly: 4.345,
  monthly: 1,
  quarterly: 1 / 3,
  biannually: 1 / 6,
  annually: 1 / 12,
};

/** Monthly value of a subscription in the smallest currency unit. */
function monthly(s: PsSub) {
  return (s.amount || s.plan?.amount || 0) * (PER_MONTH[s.plan?.interval ?? "monthly"] ?? 1);
}

function planLabel(s: PsSub | null) {
  if (!s) return null;
  const code = s.plan?.plan_code;
  for (const [id, p] of Object.entries(PLANS)) if (code && process.env[p.env] === code) return id;
  return s.plan?.name ?? s.plan?.interval ?? null;
}

// ---------------- user status ----------------
export type UserStatus = "no_trial" | "trialing" | "trial_cancelled" | "paying" | "cancelling" | "payment_failed" | "expired";

export const STATUS_LABEL: Record<UserStatus, string> = {
  no_trial: "Signed up, no trial",
  trialing: "On trial",
  trial_cancelled: "Trial, cancelled",
  paying: "Paying",
  cancelling: "Cancelled, paid to period end",
  payment_failed: "Payment failed",
  expired: "Trial ended, not paying",
};

function liveSub(subs: PsSub[], now: number) {
  const rank = (s: PsSub) =>
    s.status === "active" ? 4 : s.status === "attention" ? 3 : s.status === "non-renewing" && Date.parse(s.next_payment_date ?? "") > now ? 2 : 0;
  return [...subs].sort((a, b) => rank(b) - rank(a))[0] ?? null;
}

export function userStatus(p: AdminProfile, subs: PsSub[], now = Date.now()): { status: UserStatus; sub: PsSub | null } {
  const onTrial = Boolean(p.trialEndsAt && p.trialEndsAt > now);
  if (p.paystackCustomerId === DEMO_CUSTOMER_ID && isDemoBilling()) {
    return { status: onTrial ? "trialing" : "paying", sub: null };
  }
  const sub = liveSub(subs, now);
  const st = sub?.status;
  const stillPaid = st === "non-renewing" && Date.parse(sub?.next_payment_date ?? "") > now;
  if (onTrial) return { status: st === "active" || st === "attention" ? "trialing" : "trial_cancelled", sub };
  if (st === "active") return { status: "paying", sub };
  if (st === "attention") return { status: "payment_failed", sub };
  if (stillPaid) return { status: "cancelling", sub };
  return { status: p.trialUsed ? "expired" : "no_trial", sub };
}

// ---------------- everything the dashboard needs, loaded once ----------------
export interface AdminData {
  now: number;
  profiles: AdminProfile[];
  subs: PsSub[];
  txs: PsTx[]; // last 12 months
  refunds: PsRefund[];
  events: AppEvent[]; // last 30 days
  paystackError: string | null;
  eventsError: string | null;
  subsByCustomer: Map<number, PsSub[]>;
  txByCustomer: Map<number, PsTx[]>;
}

export async function loadAdminData(): Promise<AdminData> {
  const now = Date.now();
  const db = accounts();
  let paystackError: string | null = null;
  let eventsError: string | null = null;

  const paystackPart = isDemoBilling()
    ? Promise.resolve({ subs: [] as PsSub[], txs: [] as PsTx[], refunds: [] as PsRefund[] })
    : Promise.all([
        paystackAll<PsSub>("/subscription"),
        paystackAll<PsTx>(`/transaction?from=${new Date(now - 365 * DAY).toISOString()}`, 50),
        paystackAll<PsRefund>("/refund"),
      ])
        .then(([subs, txs, refunds]) => ({ subs, txs, refunds }))
        .catch((err: unknown) => {
          paystackError = err instanceof Error ? err.message : "Paystack request failed";
          return { subs: [] as PsSub[], txs: [] as PsTx[], refunds: [] as PsRefund[] };
        });

  const [profiles, events, ps] = await Promise.all([
    db.listProfiles(),
    db.listEvents({ since: now - 30 * DAY, limit: 50_000 }).catch((err: unknown) => {
      eventsError = err instanceof Error ? err.message : "Couldn't read events";
      return [] as AppEvent[];
    }),
    paystackPart,
  ]);

  const subsByCustomer = new Map<number, PsSub[]>();
  for (const s of ps.subs) {
    const id = subCustomerId(s);
    if (id) subsByCustomer.set(id, [...(subsByCustomer.get(id) ?? []), s]);
  }
  const txByCustomer = new Map<number, PsTx[]>();
  for (const t of ps.txs) {
    const id = t.customer?.id;
    if (id) txByCustomer.set(id, [...(txByCustomer.get(id) ?? []), t]);
  }
  return { now, profiles, ...ps, events, paystackError, eventsError, subsByCustomer, txByCustomer };
}

function subsFor(d: AdminData, p: AdminProfile) {
  return p.paystackCustomerId ? (d.subsByCustomer.get(p.paystackCustomerId) ?? []) : [];
}

const isRevenue = (t: PsTx) => t.status === "success" && t.currency === CURRENCY && !isCardCheck(t);
const refundTime = (r: PsRefund) => Date.parse(r.createdAt ?? "") || 0;
const aiCost = (e: AppEvent) => Number((e.meta as { costUsd?: number } | null)?.costUsd ?? 0);
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function userRows(d: AdminData) {
  const scans30 = new Map<string, number>();
  const cost30 = new Map<string, number>();
  const lastSeen = new Map<string, number>();
  for (const e of d.events) {
    if (e.userId && /^(user\.sign_in|ai\.|checkout\.|trial\.)/.test(e.type)) lastSeen.set(e.userId, Math.max(lastSeen.get(e.userId) ?? 0, e.at));
    if (!e.userId || (e.type !== "ai.scan" && e.type !== "ai.setup")) continue;
    scans30.set(e.userId, (scans30.get(e.userId) ?? 0) + 1);
    cost30.set(e.userId, (cost30.get(e.userId) ?? 0) + aiCost(e));
  }
  const today = dayKey(d.now);
  return d.profiles.map((p) => {
    const { status, sub } = userStatus(p, subsFor(d, p), d.now);
    const paid = (p.paystackCustomerId ? (d.txByCustomer.get(p.paystackCustomerId) ?? []) : []).filter(isRevenue);
    return {
      id: p.id,
      email: p.email,
      status,
      createdAt: p.createdAt ?? null,
      lastActiveAt: Math.max(p.lastActiveAt ?? 0, lastSeen.get(p.id) ?? 0) || null,
      trialEndsAt: p.trialEndsAt,
      plan: planLabel(sub),
      nextPaymentAt: sub?.next_payment_date ? Date.parse(sub.next_payment_date) : null,
      aiToday: p.aiDay === today ? p.aiCount : 0,
      scans30: scans30.get(p.id) ?? 0,
      aiCost30: cost30.get(p.id) ?? 0,
      paid12m: paid.reduce((a, t) => a + t.amount, 0),
      emailOptOut: Boolean(p.emailOptOut),
      customerId: p.paystackCustomerId,
    };
  });
}

export type UserRow = ReturnType<typeof userRows>[number];

export interface Alert {
  level: "critical" | "warning" | "info";
  title: string;
  detail: string;
}

export function setupChecklist() {
  const key = process.env.PAYSTACK_SECRET_KEY ?? "";
  const supabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);
  return [
    { name: "Accounts (Supabase)", ok: supabase, detail: supabase ? "Connected" : "Not set: sign-in uses the local demo store" },
    { name: "AI scanning (Anthropic)", ok: !isDemoMode(), detail: isDemoMode() ? "Demo mode: sample results, no AI" : "Live" },
    {
      name: "Payments (Paystack)",
      ok: Boolean(key),
      detail: !key ? "Not set: payments are simulated" : key.startsWith("sk_test_") ? "TEST key: no real money moves" : "LIVE key: real charges",
    },
    {
      name: "Plan codes",
      ok: Object.values(PLANS).every((p) => process.env[p.env]),
      detail: Object.values(PLANS)
        .map((p) => `${p.env} ${process.env[p.env] ? "set" : "missing"}`)
        .join(", "),
    },
    { name: "Billing currency", ok: true, detail: `${CURRENCY}. Your Paystack plans must use the same currency.` },
    { name: "App URL", ok: Boolean(process.env.APP_URL), detail: process.env.APP_URL || "APP_URL missing: payment redirects and email links may break" },
    { name: "Cookie secret", ok: Boolean(process.env.APP_SECRET), detail: process.env.APP_SECRET ? "Set" : "APP_SECRET missing" },
    { name: "Support email", ok: Boolean(process.env.SUPPORT_EMAIL), detail: process.env.SUPPORT_EMAIL || "SUPPORT_EMAIL missing (shown on legal pages)" },
    {
      name: "Sending email (Resend)",
      ok: emailConfigured(),
      detail: emailConfigured() ? `From ${process.env.EMAIL_FROM}` : "RESEND_API_KEY and EMAIL_FROM missing: you can't email users",
    },
    {
      name: "Daily jobs (trial reminders)",
      ok: Boolean(process.env.CRON_SECRET),
      detail: process.env.CRON_SECRET ? "CRON_SECRET set" : "CRON_SECRET missing: trial reminder emails won't run",
    },
  ];
}

export function buildOverview(d: AdminData) {
  const { now } = d;
  const rows = userRows(d);
  const statusCounts = Object.fromEntries(Object.keys(STATUS_LABEL).map((k) => [k, 0])) as Record<UserStatus, number>;
  for (const r of rows) statusCounts[r.status]++;

  const created = (r: UserRow) => r.createdAt ?? 0;
  const users = {
    total: rows.length,
    new1d: rows.filter((r) => created(r) > now - DAY).length,
    new7d: rows.filter((r) => created(r) > now - 7 * DAY).length,
    new30d: rows.filter((r) => created(r) > now - 30 * DAY).length,
    prev30d: rows.filter((r) => created(r) > now - 60 * DAY && created(r) <= now - 30 * DAY).length,
  };

  const activeSet = (since: number) =>
    new Set(d.events.filter((e) => e.userId && e.at > since && /^(user\.sign_in|ai\.)/.test(e.type)).map((e) => e.userId)).size;
  const active = { d1: activeSet(now - DAY), d7: activeSet(now - 7 * DAY), d30: activeSet(now - 30 * DAY) };

  // Money
  const rev = d.txs.filter(isRevenue);
  const sumTx = (from: number, to = now) => rev.filter((t) => txTime(t) > from && txTime(t) <= to).reduce((a, t) => a + t.amount, 0);
  const fees = (from: number) => rev.filter((t) => txTime(t) > from).reduce((a, t) => a + (t.fees ?? 0), 0);
  const okRefunds = d.refunds.filter((r) => r.currency === CURRENCY && r.status !== "failed");
  const realRefunds = okRefunds.filter((r) => r.amount !== TRIAL_CARD_CHECK);
  const refunds = (from: number) => realRefunds.filter((r) => refundTime(r) > from).reduce((a, r) => a + r.amount, 0);

  const trialing = new Set(rows.filter((r) => r.status === "trialing" || r.status === "trial_cancelled").map((r) => r.customerId));
  const payingSubs = d.subs.filter((s) => s.status === "active" && !trialing.has(subCustomerId(s) ?? null));
  const mrr = Math.round(payingSubs.reduce((a, s) => a + monthly(s), 0));
  const paying = statusCounts.paying;

  const aiEvents = d.events.filter((e) => e.type === "ai.scan" || e.type === "ai.setup");
  const aiSince = (from: number) => aiEvents.filter((e) => e.at > from);
  // Failed and rejected calls cost money too.
  const costEvents = d.events.filter((e) => e.type.startsWith("ai.") && aiCost(e) > 0);
  const costSince = (from: number) => costEvents.filter((e) => e.at > from).reduce((a, e) => a + aiCost(e), 0);
  const ai = {
    calls1d: aiSince(now - DAY).length,
    calls7d: aiSince(now - 7 * DAY).length,
    calls30d: aiEvents.length,
    cost1d: costSince(now - DAY),
    cost30d: costSince(0),
    blocked30d: d.events
      .filter((e) => e.type === "ai.blocked")
      .reduce<Record<string, number>>((acc, e) => {
        const r = String((e.meta as { reason?: string } | null)?.reason ?? "other");
        acc[r] = (acc[r] ?? 0) + 1;
        return acc;
      }, {}),
    errors1d: d.events.filter((e) => e.type === "ai.error" && e.at > now - DAY).length,
    errors30d: d.events.filter((e) => e.type === "ai.error").length,
  };

  const revenue30 = sumTx(now - 30 * DAY);
  const fees30 = fees(now - 30 * DAY);
  const refunds30 = refunds(now - 30 * DAY);
  // AI cost is in USD; only subtract it when billing is in USD too.
  const aiCostMinor = CURRENCY === "USD" ? Math.round(ai.cost30d * 100) : 0;
  const money = {
    currency: CURRENCY,
    mrr,
    arr: mrr * 12,
    arpu: paying ? Math.round(mrr / paying) : 0,
    revenue1d: sumTx(now - DAY),
    revenue7d: sumTx(now - 7 * DAY),
    revenue30,
    revenuePrev30: sumTx(now - 60 * DAY, now - 30 * DAY),
    revenue12m: sumTx(now - 365 * DAY),
    fees30,
    refunds30,
    net30: revenue30 - fees30 - refunds30,
    profit30: revenue30 - fees30 - refunds30 - aiCostMinor,
    failedCharges30: d.txs.filter((t) => t.status === "failed" && txTime(t) > now - 30 * DAY && !isCardCheck(t)).length,
    cardChecksHeld: 0,
  };
  // Card checks taken but not refunded yet (should be ~0; otherwise refund them in Paystack).
  const refundedTx = new Set(okRefunds.map((r) => (typeof r.transaction === "object" ? r.transaction?.id : r.transaction)));
  const heldChecks = d.txs.filter((t) => t.status === "success" && isCardCheck(t) && !refundedTx.has(t.id) && txTime(t) < now - 3_600_000);
  money.cardChecksHeld = heldChecks.length;

  // Coming up: renewals and trial conversions in the next 7 days.
  const byCustomer = new Map(rows.map((r) => [r.customerId, r]));
  const upcoming = d.subs
    .filter((s) => s.status === "active" && s.next_payment_date)
    .map((s) => ({ s, at: Date.parse(s.next_payment_date!) }))
    .filter(({ at }) => at > now && at < now + 7 * DAY)
    .map(({ s, at }) => {
      const r = byCustomer.get(subCustomerId(s) ?? null);
      return {
        at,
        amount: s.amount || s.plan?.amount || 0,
        email: r?.email ?? (typeof s.customer === "object" ? s.customer.email : ""),
        userId: r?.id ?? null,
        kind: r && (r.status === "trialing" || r.status === "trial_cancelled") ? "Trial converts" : "Renewal",
      };
    })
    .sort((a, b) => a.at - b.at);

  // Trial conversion: of trials that have ended, how many are paying now.
  const ended = rows.filter((r) => r.trialEndsAt && r.trialEndsAt < now);
  const converted = ended.filter((r) => r.status === "paying" || r.status === "cancelling" || r.status === "payment_failed").length;
  const funnel = {
    signedUp: rows.length,
    startedTrial: rows.filter((r) => r.trialEndsAt).length,
    trialsEnded: ended.length,
    converted,
    conversionRate: ended.length ? converted / ended.length : null,
  };

  const cancellations30 = d.events.filter((e) => e.type === "paystack.subscription.not_renew" || e.type === "paystack.subscription.disable").length;
  const plans = payingSubs.reduce<Record<string, number>>((acc, s) => {
    const k = planLabel(s) ?? "other";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  // Daily series for the last 30 days.
  const series = Array.from({ length: 30 }, (_, i) => {
    const start = new Date(dayKey(now - (29 - i) * DAY)).getTime();
    const end = start + DAY;
    const inDay = (t: number) => t >= start && t < end;
    return {
      date: dayKey(start),
      signups: rows.filter((r) => inDay(created(r))).length,
      trials: d.events.filter((e) => e.type === "trial.started" && inDay(e.at)).length,
      revenue: rev.filter((t) => inDay(txTime(t))).reduce((a, t) => a + t.amount, 0),
      aiCalls: aiEvents.filter((e) => inDay(e.at)).length,
      aiCost: costEvents.filter((e) => inDay(e.at)).reduce((a, e) => a + aiCost(e), 0),
      active: new Set(d.events.filter((e) => e.userId && inDay(e.at) && /^(user\.sign_in|ai\.)/.test(e.type)).map((e) => e.userId)).size,
    };
  });

  // Things to look out for.
  const alerts: Alert[] = [];
  if (d.paystackError) alerts.push({ level: "critical", title: "Can't reach Paystack", detail: d.paystackError });
  if (d.eventsError)
    alerts.push({ level: "critical", title: "Activity log isn't working", detail: `${d.eventsError}. Run supabase/schema.sql again to create the events table.` });
  const todo = setupChecklist().filter((c) => !c.ok);
  if (todo.length)
    alerts.push({
      level: "warning",
      title: `${todo.length} setup item${todo.length === 1 ? "" : "s"} not done`,
      detail: `${todo.map((c) => c.name).join(", ")}. See the Setup tab.`,
    });
  if (statusCounts.payment_failed)
    alerts.push({
      level: "critical",
      title: `${statusCounts.payment_failed} subscription payment(s) failed`,
      detail: "Paystack will retry. Email these users to update their card (Users → filter Payment failed).",
    });
  if (money.cardChecksHeld)
    alerts.push({
      level: "critical",
      title: `${money.cardChecksHeld} trial card check(s) not refunded`,
      detail: "Refund them from Payments so customers aren't charged the card check.",
    });
  const refundFails = d.events.filter((e) => e.type === "refund.failed").length;
  if (refundFails) alerts.push({ level: "critical", title: `${refundFails} automatic refund(s) failed in 30 days`, detail: "See Activity → refund.failed." });
  if (ai.errors1d) alerts.push({ level: "warning", title: `${ai.errors1d} AI scan error(s) in the last 24 hours`, detail: "Check Activity → ai.error and your Anthropic console." });
  if (CURRENCY === "USD" && ai.cost30d * 100 > revenue30 && ai.cost30d > 1)
    alerts.push({ level: "warning", title: "AI costs are higher than revenue", detail: `AI cost $${ai.cost30d.toFixed(2)} vs revenue in the last 30 days.` });
  if (ai.blocked30d.daily)
    alerts.push({ level: "info", title: `Daily scan limit hit ${ai.blocked30d.daily} time(s)`, detail: "Heavy users or abuse. Check Users sorted by scans." });
  if (!isDemoBilling() && d.txs.length && !d.events.some((e) => e.type.startsWith("paystack.")))
    alerts.push({
      level: "warning",
      title: "No Paystack webhooks received in 30 days",
      detail: "Set the webhook URL in Paystack → Settings → API Keys & Webhooks to <APP_URL>/api/billing/webhook.",
    });
  const trialsEnding = rows.filter((r) => r.status === "trialing" && r.trialEndsAt && r.trialEndsAt < now + 2 * DAY).length;
  if (trialsEnding) alerts.push({ level: "info", title: `${trialsEnding} trial(s) convert in the next 48 hours`, detail: "They'll be charged automatically." });
  if (money.failedCharges30) alerts.push({ level: "info", title: `${money.failedCharges30} failed payment attempt(s) in 30 days`, detail: "See Payments → Failed." });

  return {
    generatedAt: now,
    users,
    active,
    statusCounts,
    money,
    ai,
    funnel,
    cancellations30,
    plans,
    upcoming,
    series,
    alerts,
    setup: setupChecklist(),
  };
}
