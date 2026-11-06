import { NextResponse, type NextRequest } from "next/server";
import { accounts } from "./db";
import { clientIp, rateLimit } from "./rateLimit";
import { getSession } from "./session";
import { cookieOpts, sign, verify } from "./signing";
import { track } from "./events";
import type { AiUsage } from "./aiCost";

// ---------------- plans & limits ----------------
/** Most AI calls (scans, after-photos, room setups) one account can make per UTC day. Protects your Claude bill. */
export const DAILY_AI_LIMIT = 40;
/**
 * Card check at trial start, in the smallest currency unit (100 = 1.00). Paystack needs a real
 * charge to save a reusable card; it is refunded right away.
 */
export const TRIAL_CARD_CHECK = 100;
/** Burst limit per IP address across all AI routes, on top of the per-account limits. */
const IP_LIMIT = { max: 20, windowMs: 10 * 60_000 };
export const TRIAL_DAYS = 7;
const DAY_MS = 86_400_000;

// Prices are in US dollars. Paystack amounts are in the smallest unit (cents).
export const PLANS = {
  yearly: { label: "Yearly", cents: 2999, env: "PAYSTACK_PLAN_YEARLY" },
  monthly: { label: "Monthly", cents: 499, env: "PAYSTACK_PLAN_MONTHLY" },
} as const;
export type PlanId = keyof typeof PLANS;
export const CURRENCY = "USD";

/** Marks a simulated subscription while no Paystack key is configured. */
export const DEMO_CUSTOMER_ID = -1;

/** No Paystack key configured: checkout simulates a subscription so the flow can be tested. */
export function isDemoBilling() {
  return !process.env.PAYSTACK_SECRET_KEY;
}

// ---------------- Paystack API ----------------
export class PaystackError extends Error {}

interface PaystackEnvelope<T> {
  status: boolean;
  message: string;
  data: T;
}

export async function paystack<T>(path: string, init?: { method?: "GET" | "POST"; body?: unknown }): Promise<T> {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new PaystackError("PAYSTACK_SECRET_KEY is not set");
  const res = await fetch(`https://api.paystack.co${path}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  let json: PaystackEnvelope<T>;
  try {
    json = (await res.json()) as PaystackEnvelope<T>;
  } catch {
    throw new PaystackError(`Paystack returned HTTP ${res.status}`);
  }
  if (!res.ok || !json.status) throw new PaystackError(json.message || `Paystack returned HTTP ${res.status}`);
  return json.data;
}

export interface PaystackSubscription {
  id: number;
  status: string; // active | non-renewing | attention | completed | cancelled
  subscription_code: string;
  email_token: string;
  next_payment_date: string | null;
}

/**
 * Active, or cancelled but still paid up until the period ends. A trial that was cancelled before
 * its first charge is "non-renewing" with a next payment date at the trial's end, so it stops
 * counting as soon as that date passes.
 */
function isLiveSubscription(s: PaystackSubscription, now = Date.now()) {
  if (s.status === "active") return true;
  return s.status === "non-renewing" && Boolean(s.next_payment_date) && Date.parse(s.next_payment_date!) > now;
}

export async function liveSubscription(customerId: number): Promise<PaystackSubscription | null> {
  const subs = await paystack<PaystackSubscription[]>(`/subscription?customer=${customerId}&perPage=20`);
  return subs.find((s) => isLiveSubscription(s)) ?? null;
}

// ---------------- billing state: account (signed in) or cookies (signed out) ----------------
const BILLING_COOKIE = "cs_billing";
const USAGE_COOKIE = "cs_usage";
const YEAR_S = 60 * 60 * 24 * 365;

export interface Usage {
  scans: number;
  rooms: number;
}

interface AnonBilling {
  customerId?: number | null;
  customerCode?: string | null;
  trialEndsAt?: number | null;
  trialUsed?: boolean;
}

export interface BillingState {
  userId: string | null;
  email: string | null;
  customerId: number | null;
  customerCode: string | null;
  trialEndsAt: number | null;
  trialUsed: boolean;
  usage: Usage;
  aiDay: string | null;
  aiCount: number;
}

export type BillingPatch = Partial<Pick<BillingState, "customerId" | "customerCode" | "trialEndsAt" | "trialUsed" | "usage">>;

function readAnon(req: NextRequest): { billing: AnonBilling; usage: Usage } {
  return {
    billing: verify<AnonBilling>(req.cookies.get(BILLING_COOKIE)?.value) ?? {},
    usage: verify<Usage>(req.cookies.get(USAGE_COOKIE)?.value) ?? { scans: 0, rooms: 0 },
  };
}

/** Billing for this request: from the account when signed in, otherwise from signed cookies. */
export async function loadBilling(req: NextRequest): Promise<BillingState> {
  const session = getSession(req);
  if (session) {
    const p = await accounts().getProfile(session.uid, session.email);
    return {
      userId: session.uid,
      email: session.email,
      customerId: p.paystackCustomerId,
      customerCode: p.paystackCustomerCode,
      trialEndsAt: p.trialEndsAt,
      trialUsed: p.trialUsed,
      usage: { scans: p.usageScans, rooms: p.usageRooms },
      aiDay: p.aiDay,
      aiCount: p.aiCount,
    };
  }
  const { billing, usage } = readAnon(req);
  return {
    userId: null,
    email: null,
    customerId: billing.customerId ?? null,
    customerCode: billing.customerCode ?? null,
    trialEndsAt: billing.trialEndsAt ?? null,
    trialUsed: Boolean(billing.trialUsed),
    usage,
    aiDay: null,
    aiCount: 0,
  };
}

export async function saveBilling(res: NextResponse, state: BillingState, patch: BillingPatch) {
  const next = { ...state, ...patch };
  if (state.userId) {
    await accounts().updateProfile(state.userId, {
      paystackCustomerId: next.customerId,
      paystackCustomerCode: next.customerCode,
      trialEndsAt: next.trialEndsAt,
      trialUsed: next.trialUsed,
      usageScans: next.usage.scans,
      usageRooms: next.usage.rooms,
    });
    return;
  }
  const anon: AnonBilling = {
    customerId: next.customerId,
    customerCode: next.customerCode,
    trialEndsAt: next.trialEndsAt,
    trialUsed: next.trialUsed,
  };
  res.cookies.set(BILLING_COOKIE, sign(anon), cookieOpts(YEAR_S));
  res.cookies.set(USAGE_COOKIE, sign(next.usage), cookieOpts(YEAR_S));
}

/**
 * On sign-in, fold anything done while signed out on this device into the account,
 * then clear the anonymous cookies so nothing is counted twice.
 */
export async function mergeAnonymousIntoProfile(req: NextRequest, res: NextResponse, userId: string, email: string) {
  const { billing, usage } = readAnon(req);
  const hasAnon = billing.customerId != null || billing.trialUsed || usage.scans > 0 || usage.rooms > 0;
  if (!hasAnon) return;
  const p = await accounts().getProfile(userId, email);
  await accounts().updateProfile(userId, {
    usageScans: Math.max(p.usageScans, usage.scans),
    usageRooms: Math.max(p.usageRooms, usage.rooms),
    trialUsed: p.trialUsed || Boolean(billing.trialUsed),
    trialEndsAt: Math.max(p.trialEndsAt ?? 0, billing.trialEndsAt ?? 0) || null,
    paystackCustomerId: p.paystackCustomerId ?? billing.customerId ?? null,
    paystackCustomerCode: p.paystackCustomerCode ?? billing.customerCode ?? null,
  });
  res.cookies.delete(BILLING_COOKIE);
  res.cookies.delete(USAGE_COOKIE);
}

export function trialActive(state: BillingState, now = Date.now()) {
  return Boolean(state.trialEndsAt && state.trialEndsAt > now);
}

export function trialEnd(now = Date.now()) {
  return now + TRIAL_DAYS * DAY_MS;
}

// ---------------- subscription status ----------------
const statusCache = new Map<number, { subscribed: boolean; at: number }>();
const CACHE_MS = 60_000;

/** True if this customer has a paid subscription (not counting the trial). */
export async function isSubscribed(state: BillingState): Promise<boolean> {
  if (state.customerId === DEMO_CUSTOMER_ID) return isDemoBilling(); // demo subscriptions only count in demo mode
  if (!state.customerId || isDemoBilling()) return false;

  const cached = statusCache.get(state.customerId);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.subscribed;

  const subscribed = Boolean(await liveSubscription(state.customerId));
  statusCache.set(state.customerId, { subscribed, at: Date.now() });
  return subscribed;
}

export function forgetStatus(customerId: number | null | undefined) {
  if (customerId) statusCache.delete(customerId);
}

export type DenyReason = "login" | "paywall" | "daily" | "busy";

/** What an AI call did, for the activity log and cost tracking. */
export interface AiCallInfo {
  kind: "scan" | "setup";
  mode?: string;
  demo?: boolean;
  usage?: AiUsage;
}

function utcDay(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * Gate for every AI call. Nothing is free: you need an account with an active trial or
 * subscription. On top of that there is a per-account daily cap and a per-IP burst limit.
 */
export async function checkAllowance(req: NextRequest) {
  const noop = async (info?: AiCallInfo) => void info;
  const deny = (reason: DenyReason) => ({ allowed: false as const, reason, record: noop });

  if (!rateLimit(`ai:${clientIp(req)}`, IP_LIMIT.max, IP_LIMIT.windowMs)) {
    const s = getSession(req);
    await track("ai.blocked", { userId: s?.uid, email: s?.email, meta: { reason: "busy", ip: clientIp(req) } });
    return deny("busy");
  }

  const state = await loadBilling(req);
  if (!state.userId) return deny("login");
  const who = { userId: state.userId, email: state.email };

  let pro = trialActive(state);
  if (!pro) {
    try {
      pro = await isSubscribed(state);
    } catch (err) {
      // If Paystack is unreachable, don't lock out someone who has a subscription on file.
      console.error("Subscription check failed", err);
      pro = Boolean(state.customerId);
    }
  }
  if (!pro) {
    await track("ai.blocked", { ...who, meta: { reason: "paywall" } });
    return deny("paywall");
  }

  const today = utcDay();
  const usedToday = state.aiDay === today ? state.aiCount : 0;
  if (usedToday >= DAILY_AI_LIMIT) {
    await track("ai.blocked", { ...who, meta: { reason: "daily" } });
    return deny("daily");
  }

  const userId = state.userId;
  return {
    allowed: true as const,
    reason: null,
    async record(info?: AiCallInfo) {
      try {
        await accounts().updateProfile(userId, { aiDay: today, aiCount: usedToday + 1 });
      } catch (err) {
        // Missing ai_day/ai_count columns (run supabase/schema.sql) shouldn't break scanning.
        console.error("Daily AI counter update failed", err);
      }
      if (info) await track(`ai.${info.kind}`, { ...who, meta: { mode: info.mode ?? null, demo: Boolean(info.demo), ...(info.usage ?? {}) } });
    },
  };
}

/** The JSON error response for a denied AI call. */
export function denyResponse(reason: DenyReason) {
  switch (reason) {
    case "login":
      return NextResponse.json({ error: "Please sign in to use Eboclean.", needLogin: true }, { status: 401 });
    case "paywall":
      return NextResponse.json({ error: "Start your free trial or subscribe to keep scanning.", paywall: true }, { status: 402 });
    case "daily":
      return NextResponse.json({ error: "You've reached today's scan limit. It resets at midnight (UTC)." }, { status: 429 });
    case "busy":
      return NextResponse.json({ error: "Too many scans in a short time. Please wait a few minutes." }, { status: 429 });
  }
}

// ---------------- card-upfront free trial ----------------

/** Plan code configured for a plan, or null if missing. */
export function planCode(plan: PlanId) {
  return process.env[PLANS[plan].env] || null;
}

/**
 * Turns a successful card-check payment into a free trial: subscribes the customer to the plan
 * with the first charge TRIAL_DAYS from now, records the trial, and refunds the card check.
 * Safe to call twice (success redirect and webhook): only the first call does the work.
 */
export async function activateCardTrial(opts: {
  userId: string;
  email: string;
  plan: PlanId;
  reference: string;
  customerId: number;
  customerCode: string;
  authorizationCode: string;
}): Promise<"started" | "already"> {
  const db = accounts();
  await db.getProfile(opts.userId, opts.email); // make sure the profile row exists
  if (!(await db.claimTrial(opts.userId))) return "already";

  const code = planCode(opts.plan);
  const endsAt = trialEnd();
  try {
    if (!code) throw new Error(`Missing ${PLANS[opts.plan].env}`);
    await paystack("/subscription", {
      method: "POST",
      body: {
        customer: opts.customerCode,
        plan: code,
        authorization: opts.authorizationCode,
        start_date: new Date(endsAt).toISOString(),
      },
    });
    await db.updateProfile(opts.userId, {
      paystackCustomerId: opts.customerId,
      paystackCustomerCode: opts.customerCode,
      trialUsed: true,
      trialEndsAt: endsAt,
    });
    forgetStatus(opts.customerId);
    await track("trial.started", { userId: opts.userId, email: opts.email, meta: { plan: opts.plan, endsAt, reference: opts.reference } });
  } catch (err) {
    // Give the trial back so the user can try again.
    await db.updateProfile(opts.userId, { trialUsed: false, trialEndsAt: null }).catch(() => undefined);
    throw err;
  }

  try {
    await paystack("/refund", { method: "POST", body: { transaction: opts.reference } });
  } catch (err) {
    console.error("Refunding the trial card check failed (refund it in the Paystack dashboard)", opts.reference, err);
    await track("refund.failed", {
      userId: opts.userId,
      email: opts.email,
      amount: TRIAL_CARD_CHECK,
      currency: CURRENCY,
      meta: { reference: opts.reference, error: err instanceof Error ? err.message : String(err) },
    });
  }
  return "started";
}

export function originOf(req: NextRequest) {
  return process.env.APP_URL ?? req.nextUrl.origin;
}
