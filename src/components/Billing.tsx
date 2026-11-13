"use client";

import { useCallback, useEffect, useState } from "react";
import { LogoMark } from "./Logo";

export interface BillingStatus {
  /** Paywall is switched off (PAYWALL_ENABLED in lib/billing.ts): full access for every account. */
  free?: boolean;
  pro: boolean;
  subscribed: boolean;
  onTrial: boolean;
  trialDaysLeft: number;
  trialUsed: boolean;
  trialEndsAt: number | null;
  signedIn: boolean;
  email: string | null;
  demoBilling: boolean;
  canManage: boolean;
  /** Early waitlist member: first year at a discount, no trial. */
  earlyBird?: { position: number; cents: number } | null;
}

export type CheckoutNotice =
  | "success"
  | "cancelled"
  | "error"
  | "demo-cancelled"
  | "trial-started"
  | "earlybird-started"
  | "card-not-reusable"
  | "signed-in-saved"
  | "signed-in-restored"
  | "signed-in-empty"
  | "signed-out"
  | null;

const STATUS_KEY = "eboclean-billing-status";

const OFFLINE_STATUS: BillingStatus = {
  pro: false,
  subscribed: false,
  onTrial: false,
  trialDaysLeft: 0,
  trialUsed: false,
  trialEndsAt: null,
  signedIn: false,
  email: null,
  demoBilling: false,
  canManage: false,
};

function rememberStatus(s: BillingStatus) {
  try {
    localStorage.setItem(STATUS_KEY, JSON.stringify(s));
  } catch {}
}

/** Last status seen online; a trial only counts until it ends. */
function lastKnownStatus(): BillingStatus | null {
  try {
    const s = JSON.parse(localStorage.getItem(STATUS_KEY) ?? "null") as BillingStatus | null;
    if (!s) return null;
    if (s.onTrial && !s.subscribed && s.trialEndsAt && s.trialEndsAt < Date.now()) return { ...s, pro: false, onTrial: false };
    return s;
  } catch {
    return null;
  }
}

const URL_NOTICES: CheckoutNotice[] = ["success", "cancelled", "error", "trial-started", "earlybird-started", "card-not-reusable"];

/** Loads plan status from the server and reports checkout results from the URL. */
export function useBilling() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [notice, setNotice] = useState<CheckoutNotice>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/status", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as BillingStatus;
        rememberStatus(data);
        setStatus(data);
      }
    } catch {
      // offline: keep last known status
    }
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/billing/status", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
      .then((data: BillingStatus | null) => {
        if (!alive) return;
        if (data) rememberStatus(data);
        const known = data ?? lastKnownStatus();
        // Offline with nothing cached: show the gate rather than an endless spinner.
        setStatus(known ?? OFFLINE_STATUS);
        const params = new URLSearchParams(window.location.search);
        const checkout = params.get("checkout") as CheckoutNotice;
        const portal = params.get("portal");
        if (checkout && URL_NOTICES.includes(checkout)) setNotice(checkout);
        else if (portal === "demo-cancelled") setNotice("demo-cancelled");
        if (checkout || portal) window.history.replaceState(null, "", "/");
      });
    return () => {
      alive = false;
    };
  }, []);

  return { status, refresh, notice, setNotice, clearNotice: () => setNotice(null) };
}

export const TRIAL_DAYS = 3;

export const PLAN_OPTIONS = [
  { id: "monthly" as const, label: "Monthly", perMonth: "$9.99", price: "$9.99", period: "/month", periodWord: "month", trial: false },
  { id: "yearly" as const, label: "Yearly", perMonth: "$2.49", price: "$29.99", period: "/year", periodWord: "year", trial: true },
];
type PlanChoice = (typeof PLAN_OPTIONS)[number]["id"];
const YEARLY = PLAN_OPTIONS[1];
const YEARLY_LINE = `Then ${YEARLY.price} a year, about ${YEARLY.perMonth} a month`;

const DAY_MS = 86_400_000;

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

function Check({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={`h-5 w-5 ${className}`} aria-hidden="true">
      <path d="M4.5 10.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** "$0 today" line under the trial buttons (the $1 card check is refunded, see fine print). */
function NothingDueToday() {
  return (
    <p className="flex items-center justify-center gap-1.5 text-sm font-semibold">
      <Check /> $0 due today, cancel anytime
    </p>
  );
}

/** A small, static picture of the Today screen for the first paywall step. */
function AppPreview() {
  const rows = [
    ["👕", "Clothes into the basket", "2 min"],
    ["🍽️", "Dishes back to the kitchen", "2 min"],
    ["🛏️", "Make the bed", "3 min"],
  ];
  return (
    <div className="mx-auto w-[min(17rem,72vw)] rounded-[2.6rem] bg-neutral-950 p-2.5 shadow-2xl shadow-black/25">
      <div className="overflow-hidden rounded-[2.1rem] bg-neutral-50 px-4 pb-5 pt-7 text-left">
        <p className="text-[11px] font-semibold text-neutral-400">Good morning 👋</p>
        <p className="text-lg font-bold leading-tight">Your home today</p>
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5">
          <svg viewBox="0 0 36 36" className="h-11 w-11 shrink-0 -rotate-90">
            <circle cx="18" cy="18" r="15" fill="none" stroke="#e5e5e5" strokeWidth="4" />
            <circle cx="18" cy="18" r="15" fill="none" stroke="#0a0a0a" strokeWidth="4" strokeLinecap="round" strokeDasharray="94.2" strokeDashoffset="26" />
          </svg>
          <div>
            <p className="text-xs font-bold">Home freshness</p>
            <p className="text-[11px] text-neutral-500">A quick reset will make a big difference.</p>
          </div>
        </div>
        <div className="mt-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5">
          <p className="text-xs font-bold">Today&apos;s plan</p>
          {rows.map(([icon, title, min]) => (
            <div key={title} className="mt-2 flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-neutral-100 text-sm">{icon}</span>
              <span className="flex-1 truncate text-[11px] font-semibold">{title}</span>
              <span className="text-[10px] text-neutral-400">{min}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-full bg-neutral-950 py-2 text-center text-[11px] font-bold text-white">🧹 Clean with Ebo</div>
      </div>
    </div>
  );
}

/**
 * Full-screen gate for anyone without an active trial or subscription.
 * Signed out: create an account / sign in. Signed in: a three-step paywall (what you get, the
 * reminder promise, how the trial works + plan choice). The free trial is on the yearly plan only; monthly is paid
 * at checkout. If the trial was already used, it goes straight to the plan choice.
 */
export function AccessGate({
  email,
  status,
  onSignUp,
  onSignOut,
  onRestore,
}: {
  email: string | null;
  status: BillingStatus | null;
  onSignUp: () => void;
  onSignOut: () => void;
  onRestore: () => Promise<void>;
}) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [plan, setPlan] = useState<PlanChoice>("yearly");
  const [loading, setLoading] = useState<"pay" | "restore" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  /** Early waitlist members can still choose the regular plans (with the trial). */
  const [showRegular, setShowRegular] = useState(false);

  if (!email) {
    const free = Boolean(status?.free);
    return (
      <section className="flex flex-1 flex-col items-center pt-10 text-center">
        <LogoMark size={88} />
        <h1 className="mt-6 text-3xl font-bold tracking-tight">Save your plan</h1>
        <p className="mt-2 max-w-xs text-neutral-500">
          {free
            ? "Create your account to keep your rooms and streak safe. Eboclean is free to use."
            : `Create your account to keep your rooms and streak safe, then try Eboclean free for ${TRIAL_DAYS} days.`}
        </p>
        <div className="mt-8 w-full space-y-3 text-left">
          {[
            ["🔒", "Your home, saved", "Rooms, tasks and photos sync to every device."],
            ["✉️", "No password", "We email you a 6-digit code to sign in."],
            free
              ? ["🎁", "Free to use", "Everything is unlocked. No card needed."]
              : ["🎁", `${TRIAL_DAYS} days free`, "Try everything before you pay anything."],
          ].map(([icon, title, text]) => (
            <div key={title} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-neutral-100 text-xl">{icon}</span>
              <span>
                <span className="block font-semibold">{title}</span>
                <span className="text-sm text-neutral-500">{text}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="mt-auto w-full space-y-2 pt-8">
          <button onClick={onSignUp} className="w-full rounded-full bg-neutral-950 py-4 font-semibold text-white shadow-lg shadow-black/15 active:scale-[0.98]">
            Continue with email
          </button>
          <button onClick={onSignUp} className="w-full py-2 text-sm font-semibold text-neutral-900">
            Already have an account? Sign in
          </button>
          <LegalLinks />
        </div>
      </section>
    );
  }

  const trialAvailable = status ? !status.trialUsed : true;
  const shown = trialAvailable ? step : 2;
  const chosen = PLAN_OPTIONS.find((p) => p.id === plan)!;
  const withTrial = trialAvailable && chosen.trial;
  const chargeDate = formatDate(now + TRIAL_DAYS * DAY_MS);

  async function checkout() {
    setLoading("pay");
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, trial: withTrial }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "Couldn't start checkout.");
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start checkout.");
      setLoading(null);
    }
  }

  async function restore() {
    setLoading("restore");
    await onRestore();
    setLoading(null);
  }

  const topBar = (
    <div className="flex h-10 items-center justify-between">
      {trialAvailable && shown > 0 ? (
        <button
          onClick={() => setStep((s) => (s > 0 ? ((s - 1) as 0 | 1) : s))}
          aria-label="Back"
          className="grid h-10 w-10 place-items-center rounded-full bg-neutral-100 text-lg font-bold"
        >
          ←
        </button>
      ) : (
        <span />
      )}
      <button onClick={restore} disabled={loading !== null} className="text-sm font-semibold text-neutral-500">
        {loading === "restore" ? "Checking…" : "Restore"}
      </button>
    </div>
  );

  const footer = (
    <>
      {status?.demoBilling && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-center text-xs text-amber-700 ring-1 ring-amber-200">
          Demo payments: no card is charged. Add Paystack keys to take real payments.
        </p>
      )}
      <p className="mt-3 truncate text-center text-xs text-neutral-400">
        Signed in as {email} ·{" "}
        <button onClick={onSignOut} className="font-semibold underline">
          Sign out
        </button>
      </p>
      <LegalLinks />
    </>
  );

  const primary = "w-full rounded-full bg-neutral-950 py-4 text-lg font-semibold text-white shadow-lg shadow-black/15 active:scale-[0.98] disabled:opacity-60";

  // Early waitlist members: first year half price, paid today, no trial.
  const offer = status?.earlyBird ?? null;
  if (offer && !showRegular) {
    const price = `$${(offer.cents / 100).toFixed(2)}`;
    const perMonth = `$${(offer.cents / 100 / 12).toFixed(2)}`;
    const percentOff = Math.round((1 - offer.cents / 2999) * 100);

    async function checkoutEarlyBird() {
      setLoading("pay");
      setError(null);
      try {
        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan: "yearly", earlyBird: true }),
        });
        const data = await res.json();
        if (!res.ok || !data.url) throw new Error(data.error ?? "Couldn't start checkout.");
        window.location.href = data.url;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't start checkout.");
        setLoading(null);
      }
    }

    return (
      <section className="flex flex-1 flex-col pt-2">
        {topBar}
        <div className="mt-3 text-center">
          <span className="inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-800">
            Waitlist #{offer.position} · Early bird
          </span>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">Your early-bird price is ready</h1>
          <p className="mt-2 text-neutral-500">Thanks for joining the waitlist early. Your first year is half price.</p>
        </div>

        <div className="my-8 flex flex-1 items-center justify-center">
          <div className="w-full rounded-3xl bg-white p-6 text-center shadow-xl shadow-black/10 ring-2 ring-neutral-950">
            <p className="text-sm font-semibold text-neutral-500">Yearly plan · your first year</p>
            <p className="mt-2 flex items-baseline justify-center gap-2">
              <span className="text-lg font-semibold text-neutral-400 line-through">{YEARLY.price}</span>
              <span className="text-5xl font-bold tracking-tight">{price}</span>
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              about {perMonth} a month · {percentOff}% off
            </p>
            <ul className="mt-5 space-y-2.5 border-t border-neutral-100 pt-5 text-left text-sm">
              {["Room scans and 10-minute cleaning plans", "Ebo, your friendly cleaning coach", "Streaks, points and your before/after timeline"].map(
                (t) => (
                  <li key={t} className="flex items-center gap-2.5">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    {t}
                  </li>
                ),
              )}
            </ul>
          </div>
        </div>

        {error && <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <div className="space-y-3">
          <button onClick={checkoutEarlyBird} disabled={loading !== null} className={primary}>
            {loading === "pay" ? "Opening secure checkout…" : `Get my first year for ${price}`}
          </button>
          <p className="text-center text-xs text-neutral-500">
            {price} charged today in US dollars through Paystack. After your first year it renews at {YEARLY.price} a year. Cancel
            anytime.
          </p>
          <button onClick={() => setShowRegular(true)} className="w-full py-1 text-sm font-semibold text-neutral-500 hover:text-neutral-900">
            See other plans
          </button>
        </div>
        {footer}
      </section>
    );
  }

  // Step 1: what you get, free.
  if (shown === 0) {
    return (
      <section className="flex flex-1 flex-col pt-2">
        {topBar}
        <h1 className="mt-4 text-center text-3xl font-bold tracking-tight">Your calmer home starts here, free.</h1>
        <div className="my-8 flex flex-1 items-center">
          <AppPreview />
        </div>
        <div className="space-y-3">
          <NothingDueToday />
          <button onClick={() => setStep(1)} className={primary}>
            Get started free
          </button>
          <p className="text-center text-sm text-neutral-500">{YEARLY_LINE}</p>
        </div>
        {footer}
      </section>
    );
  }

  // Step 2: the reminder promise.
  if (shown === 1) {
    return (
      <section className="flex flex-1 flex-col pt-2">
        {topBar}
        <h1 className="mt-4 text-center text-3xl font-bold tracking-tight">No surprise charge after your trial.</h1>
        <p className="mt-2 text-center text-neutral-500">We email you a day before your trial ends, so you can decide calmly.</p>
        <div className="my-8 flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs rounded-3xl bg-white p-4 text-left shadow-xl shadow-black/10 ring-1 ring-black/5">
            <p className="flex items-center gap-2 text-xs font-semibold text-neutral-400">
              <span className="text-base">📬</span> Eboclean · a day before
            </p>
            <p className="mt-2 font-bold">Your free trial ends tomorrow</p>
            <p className="mt-1 text-sm text-neutral-500">Keep going and do nothing, or cancel in two taps. Your call.</p>
          </div>
        </div>
        <div className="space-y-3">
          <NothingDueToday />
          <button onClick={() => setStep(2)} className={primary}>
            Sounds good
          </button>
          <p className="text-center text-sm text-neutral-500">{YEARLY_LINE}</p>
        </div>
        {footer}
      </section>
    );
  }

  // Step 3: how the trial works + plan choice (or, after the trial, just the plan choice).
  const timeline = [
    { icon: "🧹", title: "Today", text: "Full access: room scans, tiny daily plans and Ebo, your cleaning coach." },
    { icon: "📬", title: "Day 2: a heads-up", text: "We email you to say your trial is almost over." },
    { icon: "✨", title: `Day ${TRIAL_DAYS}: ${chargeDate}`, text: "Your yearly plan begins, unless you cancel before then." },
  ];

  return (
    <section className="flex flex-1 flex-col pt-2">
      {topBar}
      <h1 className="mt-3 text-3xl font-bold tracking-tight">
        {trialAvailable ? "How your free trial works" : "Your free trial has ended"}
      </h1>
      {!trialAvailable && <p className="mt-2 text-neutral-500">Pick a plan to keep your home on track. Your rooms and streak are waiting.</p>}

      {trialAvailable && (
        <ol className={`mt-6 transition-opacity ${withTrial ? "" : "opacity-40"}`} aria-hidden={!withTrial}>
          {timeline.map((t, i) => (
            <li key={t.title} className="flex gap-3">
              <span className="flex flex-col items-center">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-neutral-950 text-lg">{t.icon}</span>
                {i < timeline.length - 1 && <span className="w-1 flex-1 rounded-full bg-neutral-950/15" />}
              </span>
              <span className="pb-5 pt-1">
                <span className="block font-semibold">{t.title}</span>
                <span className="text-sm text-neutral-500">{t.text}</span>
              </span>
            </li>
          ))}
        </ol>
      )}

      <div className={`${trialAvailable ? "mt-2" : "mt-6"} grid grid-cols-2 gap-3`}>
        {PLAN_OPTIONS.map((p) => {
          const on = plan === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setPlan(p.id)}
              aria-pressed={on}
              className={`relative rounded-2xl p-4 text-left transition ${on ? "bg-white ring-2 ring-neutral-950" : "bg-white ring-1 ring-black/10"}`}
            >
              {trialAvailable && p.trial && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-neutral-950 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
                  Free for {TRIAL_DAYS} days
                </span>
              )}
              <span className="flex items-center justify-between">
                <span className="text-sm font-semibold">{p.label}</span>
                <span className={`grid h-6 w-6 place-items-center rounded-full ${on ? "bg-neutral-950 text-white" : "ring-1 ring-black/20"}`}>
                  {on && <Check className="h-4 w-4" />}
                </span>
              </span>
              <span className="mt-1 block text-xl font-bold">
                {p.perMonth} <span className="text-sm font-semibold text-neutral-500">/mo</span>
              </span>
              <span className="block text-xs text-neutral-500">{p.id === "yearly" ? `${p.price} billed yearly` : "billed monthly"}</span>
            </button>
          );
        })}
      </div>

      {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="mt-auto space-y-3 pt-6">
        {withTrial && <NothingDueToday />}
        <button onClick={checkout} disabled={loading !== null} className={primary}>
          {loading === "pay" ? "Opening secure checkout…" : withTrial ? "Start free trial" : `Subscribe for ${chosen.price}${chosen.period}`}
        </button>
        <p className="text-center text-xs text-neutral-500">
          {withTrial
            ? `Free for ${TRIAL_DAYS} days, then ${chosen.price} a year (about ${chosen.perMonth} a month). To check your card, Paystack charges $1.00 and refunds it right away. Renews automatically until you cancel.`
            : `${chosen.price} charged today, then every ${chosen.periodWord}, in US dollars through Paystack. Renews automatically. Cancel anytime.`}
        </p>
      </div>
      {footer}
    </section>
  );
}

function LegalLinks() {
  return (
    <p className="pt-2 text-center text-xs text-neutral-500">
      By continuing you agree to our{" "}
      <a href="/terms" target="_blank" className="underline">
        Terms
      </a>{" "}
      and{" "}
      <a href="/privacy" target="_blank" className="underline">
        Privacy Policy
      </a>
      .
    </p>
  );
}

/** Plan status and "Manage or cancel" on the Progress tab. */
export function PlanCard({ status }: { status: BillingStatus | null }) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!status || !status.pro) return null;
  // Paywall off: only people with a real trial or subscription have a plan to show or cancel.
  if (status.free && !status.subscribed && !status.onTrial) return null;

  async function manage() {
    setOpening(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "Couldn't open settings.");
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open settings.");
      setOpening(false);
    }
  }

  const days = `${status.trialDaysLeft} day${status.trialDaysLeft === 1 ? "" : "s"} left`;
  const detail = status.onTrial
    ? status.subscribed && status.trialEndsAt
      ? `${days}. Your plan starts ${formatDate(status.trialEndsAt)} unless you cancel.`
      : `${days}. Cancelled, so you won't be charged.`
    : "Everything unlocked. Thanks for supporting Eboclean!";

  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-neutral-950/5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-bold">{status.onTrial ? "Free trial" : "Eboclean Pro ✨"}</p>
          <p className="text-sm text-neutral-500">{detail}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${status.onTrial ? "bg-neutral-100 text-neutral-900" : "bg-neutral-900 text-white"}`}>
          {status.onTrial ? "TRIAL" : "PRO"}
        </span>
      </div>
      {status.canManage && (
        <button onClick={manage} disabled={opening} className="mt-3 w-full rounded-2xl bg-neutral-100 py-3 text-sm font-bold text-neutral-900 hover:bg-neutral-200 disabled:opacity-60">
          {opening ? "Opening…" : status.demoBilling ? "Cancel demo subscription" : "Manage or cancel subscription"}
        </button>
      )}
      {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
    </div>
  );
}

export function CheckoutToast({ notice, onClose }: { notice: CheckoutNotice; onClose: () => void }) {
  if (!notice) return null;
  const text = {
    success: "🎉 Welcome to Pro! Thanks for subscribing.",
    "trial-started": `🎉 Your ${TRIAL_DAYS}-day free trial has started. Enjoy everything Eboclean has!`,
    "earlybird-started": "🎉 You're in! Your first year of Eboclean is half price. Welcome aboard.",
    "card-not-reusable": "That card can't be used for a subscription. Please try another card. You've been refunded.",
    cancelled: "No worries. Nothing was charged.",
    error: "We couldn't confirm your payment. If you were charged, contact support.",
    "demo-cancelled": "Demo subscription cancelled.",
    "signed-in-saved": "✅ Signed in. Your rooms and progress are now saved to your account.",
    "signed-in-restored": "👋 Welcome back! Your home, streak and plan are restored on this device.",
    "signed-in-empty": "✅ Signed in. This account has no home saved yet, so let's set one up.",
    "signed-out": "Signed out. Your data is safe in your account.",
  }[notice];
  const tone =
    notice === "success" || notice === "trial-started" || notice === "earlybird-started" || notice === "signed-in-saved" || notice === "signed-in-restored" || notice === "signed-in-empty"
      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
      : notice === "error" || notice === "card-not-reusable"
        ? "bg-rose-50 text-rose-800 ring-rose-200"
        : "bg-neutral-100 text-neutral-900 ring-neutral-200";
  return (
    <div className={`mb-4 flex items-start gap-3 rounded-2xl px-4 py-3 text-sm ring-1 ${tone}`} role="status">
      <span className="flex-1">{text}</span>
      <button onClick={onClose} aria-label="Dismiss" className="font-bold opacity-60 hover:opacity-100">
        ✕
      </button>
    </div>
  );
}
