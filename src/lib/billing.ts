import { NextResponse, type NextRequest } from "next/server";
import { accounts, accountsAvailable } from "./db";
import { clientIp, rateLimit } from "./rateLimit";
import { getSession } from "./session";
import { cookieOpts, sign, verify } from "./signing";

// ---------------- plans & limits ----------------
export const FREE_LIMITS = { scans: 3, rooms: 2 } as const;
/** Most AI calls (scans, after-photos, room setups) one account can make per UTC day. Protects your Claude bill. */
export const DAILY_AI_LIMIT = { free: 10, pro: 40 } as const;
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

/** Active, or cancelled but still paid up until the period ends. */
function isLiveSubscription(s: PaystackSubscription) {
  return s.status === "active" || s.status === "non-renewing";
}

export async function liveSubscription(customerId: number): Promise<PaystackSubscription | null> {
  const subs = await paystack<PaystackSubscription[]>(`/subscription?customer=${customerId}&perPage=20`);
  return subs.find(isLiveSubscription) ?? null;
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

function utcDay(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * Gate for every AI call. `kind` is the free-plan counter it uses ("scans" / "rooms"),
 * or null for calls that only count toward the daily cap (the "after" photo of a scan).
 *
 * - Signed-out users must create a free account first (free counts can't be reset by clearing cookies).
 * - Free users get FREE_LIMITS in total; everyone has a per-day cap and a per-IP burst limit.
 */
export async function checkAllowance(req: NextRequest, kind: keyof Usage | null) {
  const deny = (reason: DenyReason) => ({ allowed: false as const, reason, pro: false, async record() {} });

  if (!rateLimit(`ai:${clientIp(req)}`, IP_LIMIT.max, IP_LIMIT.windowMs)) return deny("busy");

  const state = await loadBilling(req);
  if (!state.userId && accountsAvailable()) return deny("login");

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
  if (kind && !pro && state.usage[kind] >= FREE_LIMITS[kind]) return { ...deny("paywall"), pro };

  const today = utcDay();
  const usedToday = state.aiDay === today ? state.aiCount : 0;
  if (state.userId && usedToday >= (pro ? DAILY_AI_LIMIT.pro : DAILY_AI_LIMIT.free)) return { ...deny("daily"), pro };

  return {
    allowed: true as const,
    reason: null,
    pro,
    async record(res: NextResponse) {
      if (kind && !pro) await saveBilling(res, state, { usage: { ...state.usage, [kind]: state.usage[kind] + 1 } });
      if (state.userId) {
        try {
          await accounts().updateProfile(state.userId, { aiDay: today, aiCount: usedToday + 1 });
        } catch (err) {
          // Missing ai_day/ai_count columns (run supabase/schema.sql) shouldn't break scanning.
          console.error("Daily AI counter update failed", err);
        }
      }
    },
  };
}

/** The JSON error response for a denied AI call. */
export function denyResponse(reason: DenyReason, kind: keyof Usage | null) {
  switch (reason) {
    case "login":
      return NextResponse.json(
        { error: "Create a free account to scan. It takes 20 seconds and keeps your rooms safe.", needLogin: true },
        { status: 401 },
      );
    case "paywall":
      return NextResponse.json({ error: PAYWALL_MESSAGE[kind ?? "scans"], paywall: kind ?? "scans" }, { status: 402 });
    case "daily":
      return NextResponse.json({ error: "You've reached today's scan limit. It resets at midnight (UTC)." }, { status: 429 });
    case "busy":
      return NextResponse.json({ error: "Too many scans in a short time. Please wait a few minutes." }, { status: 429 });
  }
}

export const PAYWALL_MESSAGE: Record<keyof Usage, string> = {
  scans: `You've used your ${FREE_LIMITS.scans} free scans. Go Pro for unlimited scans.`,
  rooms: `The free plan includes ${FREE_LIMITS.rooms} rooms. Go Pro to map your whole home.`,
};

export function originOf(req: NextRequest) {
  return process.env.APP_URL ?? req.nextUrl.origin;
}
