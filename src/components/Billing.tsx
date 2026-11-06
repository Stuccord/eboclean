"use client";

import { useCallback, useEffect, useState } from "react";

export interface BillingStatus {
  pro: boolean;
  subscribed: boolean;
  onTrial: boolean;
  trialDaysLeft: number;
  trialUsed: boolean;
  signedIn: boolean;
  email: string | null;
  demoBilling: boolean;
  canManage: boolean;
  usage: { scans: number; rooms: number };
  limits: { scans: number; rooms: number };
}

export type PaywallReason = "scans" | "rooms" | "upgrade";

export type CheckoutNotice =
  | "success"
  | "cancelled"
  | "error"
  | "demo-cancelled"
  | "trial-started"
  | "signed-in-saved"
  | "signed-in-restored"
  | "signed-out"
  | null;

/** Loads plan status from the server and reports checkout results from the URL. */
export function useBilling() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [notice, setNotice] = useState<CheckoutNotice>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/status", { cache: "no-store" });
      if (res.ok) setStatus(await res.json());
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
        if (data) setStatus(data);
        const params = new URLSearchParams(window.location.search);
        const checkout = params.get("checkout");
        const portal = params.get("portal");
        if (checkout === "success" || checkout === "cancelled" || checkout === "error") setNotice(checkout);
        else if (portal === "demo-cancelled") setNotice("demo-cancelled");
        if (checkout || portal) window.history.replaceState(null, "", "/");
      });
    return () => {
      alive = false;
    };
  }, []);

  return { status, refresh, notice, setNotice, clearNotice: () => setNotice(null) };
}

const PRO_FEATURES = [
  ["📸", "Unlimited AI scans", "Scan any mess, any time, no counting"],
  ["🏠", "Map your whole home", "Unlimited rooms, each with its own AI routine"],
  ["💜", "Support a small team", "Helps us keep building tools for ADHD brains"],
];

const PLAN_OPTIONS = [
  { id: "yearly" as const, label: "Yearly", price: "$29.99", period: "/year", sub: "$2.50/month, billed yearly", badge: "Save 50%" },
  { id: "monthly" as const, label: "Monthly", price: "$4.99", period: "/month", sub: "billed monthly", badge: null },
];

export function Paywall({
  reason,
  status,
  onClose,
  onTrialStarted,
  onNeedLogin,
}: {
  reason: PaywallReason;
  status: BillingStatus | null;
  onClose: () => void;
  onTrialStarted: () => void;
  onNeedLogin: (purpose: "trial" | "subscribe") => void;
}) {
  const [plan, setPlan] = useState<"yearly" | "monthly">("yearly");
  const signedIn = status?.signedIn ?? false;
  const [loading, setLoading] = useState<"trial" | "pay" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const demoBilling = status?.demoBilling ?? true;
  const canTrial = status ? !status.trialUsed && !status.pro : false;

  const headline =
    reason === "scans"
      ? "You've used your free scans"
      : reason === "rooms"
        ? "Map your whole home"
        : status?.onTrial
          ? "Keep Pro after your trial"
          : "Unlock Eboclean Pro";
  const chosen = PLAN_OPTIONS.find((p) => p.id === plan)!;

  async function startTrial() {
    if (!signedIn) return onNeedLogin("trial");
    setLoading("trial");
    setError(null);
    try {
      const res = await fetch("/api/billing/trial", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't start your trial.");
      onTrialStarted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start your trial.");
      setLoading(null);
    }
  }

  async function subscribe() {
    if (!signedIn) return onNeedLogin("subscribe");
    setLoading("pay");
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-indigo-950/40 sm:items-center" role="dialog" aria-modal="true" aria-label="Upgrade to Pro">
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
        <div className="flex justify-end">
          <button onClick={onClose} className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-900/60" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-violet-100 text-4xl">✨</div>
        <h2 className="mt-3 text-center text-2xl font-black">{headline}</h2>
        <p className="mt-1 text-center text-sm text-indigo-900/60">Go Pro and let Eboclean carry the mental load.</p>

        <ul className="mt-5 space-y-3">
          {PRO_FEATURES.map(([icon, title, text]) => (
            <li key={title} className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-violet-50 text-xl">{icon}</span>
              <span>
                <span className="block font-bold">{title}</span>
                <span className="text-xs text-indigo-900/60">{text}</span>
              </span>
            </li>
          ))}
        </ul>

        {canTrial && (
          <div className="mt-5">
            <button
              onClick={startTrial}
              disabled={loading !== null}
              className="w-full rounded-2xl bg-violet-600 py-4 font-black text-white shadow-lg shadow-violet-600/25 transition hover:bg-violet-700 active:scale-[0.98] disabled:opacity-60"
            >
              {loading === "trial" ? "Starting…" : "Try Pro free for 7 days"}
            </button>
            <p className="mt-2 text-center text-xs text-indigo-900/50">
              No card needed. Nothing is charged.{!signedIn && " Just a free account."}
            </p>
            <div className="my-4 flex items-center gap-3 text-xs font-semibold text-indigo-900/40">
              <span className="h-px flex-1 bg-indigo-950/10" /> or subscribe now <span className="h-px flex-1 bg-indigo-950/10" />
            </div>
          </div>
        )}

        <div className={`${canTrial ? "" : "mt-5"} grid grid-cols-2 gap-2`}>
          {PLAN_OPTIONS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPlan(p.id)}
              aria-pressed={plan === p.id}
              className={`relative rounded-2xl p-3 text-left ring-2 transition ${plan === p.id ? "bg-violet-50 ring-violet-600" : "bg-white ring-indigo-950/10"}`}
            >
              {p.badge && (
                <span className="absolute -top-2.5 right-2 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-black uppercase text-white">{p.badge}</span>
              )}
              <span className="block text-sm font-bold">{p.label}</span>
              <span className="block text-xl font-black">
                {p.price}
                <span className="text-xs font-semibold text-indigo-900/50"> USD</span>
              </span>
              <span className="block text-xs text-indigo-900/60">{p.sub}</span>
            </button>
          ))}
        </div>

        {signedIn && status?.email && (
          <p className="mt-3 text-center text-xs text-indigo-900/50">Receipts go to {status.email}</p>
        )}

        {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        <button
          onClick={subscribe}
          disabled={loading !== null}
          className={`mt-4 w-full rounded-2xl py-4 font-black transition active:scale-[0.98] disabled:opacity-60 ${
            canTrial ? "bg-white text-violet-700 ring-2 ring-violet-600 hover:bg-violet-50" : "bg-violet-600 text-white shadow-lg shadow-violet-600/25 hover:bg-violet-700"
          }`}
        >
          {loading === "pay" ? "Opening secure checkout…" : `Subscribe for ${chosen.price}${chosen.period}`}
        </button>
        <p className="mt-2 text-center text-xs text-indigo-900/50">
          Charged in US dollars through Paystack. Renews automatically. Cancel anytime.
        </p>
        {demoBilling && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-center text-xs text-amber-700 ring-1 ring-amber-200">
            Demo payments: no card is charged. Add Paystack keys to take real payments.
          </p>
        )}
      </div>
    </div>
  );
}

export function PlanCard({ status, onUpgrade }: { status: BillingStatus | null; onUpgrade: () => void }) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!status) return null;

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

  if (status.subscribed) {
    return (
      <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-indigo-950/5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-black">Eboclean Pro ✨</p>
            <p className="text-sm text-indigo-900/60">Unlimited scans and rooms.</p>
          </div>
          <span className="rounded-full bg-violet-600 px-3 py-1 text-xs font-black text-white">PRO</span>
        </div>
        {status.canManage && (
          <button onClick={manage} disabled={opening} className="mt-3 w-full rounded-2xl bg-indigo-50 py-3 text-sm font-bold text-indigo-900 hover:bg-indigo-100 disabled:opacity-60">
            {opening ? "Opening…" : status.demoBilling ? "Cancel demo subscription" : "Manage or cancel subscription"}
          </button>
        )}
        {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
      </div>
    );
  }

  if (status.onTrial) {
    return (
      <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-indigo-950/5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-black">Pro trial ✨</p>
            <p className="text-sm text-indigo-900/60">
              {status.trialDaysLeft} day{status.trialDaysLeft === 1 ? "" : "s"} left. Unlimited scans and rooms.
            </p>
          </div>
          <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700">TRIAL</span>
        </div>
        <button onClick={onUpgrade} className="mt-3 w-full rounded-2xl bg-violet-600 py-3 text-sm font-black text-white shadow-lg shadow-violet-600/25 hover:bg-violet-700">
          Keep Pro from $2.50/month
        </button>
      </div>
    );
  }

  const scansLeft = Math.max(0, status.limits.scans - status.usage.scans);
  const roomsLeft = Math.max(0, status.limits.rooms - status.usage.rooms);
  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-indigo-950/5">
      <p className="font-black">Free plan</p>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-2xl bg-indigo-50 p-3">
          <p className="text-xl font-black">{scansLeft}</p>
          <p className="text-xs text-indigo-900/60">free scans left</p>
        </div>
        <div className="rounded-2xl bg-indigo-50 p-3">
          <p className="text-xl font-black">{roomsLeft}</p>
          <p className="text-xs text-indigo-900/60">free rooms left</p>
        </div>
      </div>
      <button onClick={onUpgrade} className="mt-3 w-full rounded-2xl bg-violet-600 py-3 text-sm font-black text-white shadow-lg shadow-violet-600/25 hover:bg-violet-700">
        {status.trialUsed ? "✨ Go Pro" : "✨ Try Pro free for 7 days"}
      </button>
    </div>
  );
}

export function CheckoutToast({ notice, onClose }: { notice: CheckoutNotice; onClose: () => void }) {
  if (!notice) return null;
  const text = {
    success: "🎉 Welcome to Pro! Thanks for subscribing.",
    "trial-started": "🎉 Your 7-day Pro trial has started. Enjoy unlimited scans and rooms!",
    cancelled: "No worries. Nothing was charged.",
    error: "We couldn't confirm your payment. If you were charged, contact support.",
    "demo-cancelled": "Demo subscription cancelled. You're back on the free plan.",
    "signed-in-saved": "✅ Signed in. Your rooms and progress are now saved to your account.",
    "signed-in-restored": "👋 Welcome back! Your home, streak and plan are restored on this device.",
    "signed-out": "Signed out. Your data is safe in your account.",
  }[notice];
  const tone =
    notice === "success" || notice === "trial-started" || notice === "signed-in-saved" || notice === "signed-in-restored"
      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
      : notice === "error"
        ? "bg-rose-50 text-rose-800 ring-rose-200"
        : "bg-indigo-50 text-indigo-900 ring-indigo-200";
  return (
    <div className={`mb-4 flex items-start gap-3 rounded-2xl px-4 py-3 text-sm ring-1 ${tone}`} role="status">
      <span className="flex-1">{text}</span>
      <button onClick={onClose} aria-label="Dismiss" className="font-bold opacity-60 hover:opacity-100">
        ✕
      </button>
    </div>
  );
}
