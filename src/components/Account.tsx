"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LogoMark } from "./Logo";
import { subscribeProgress } from "@/lib/progress";
import { PHOTO_EVENT, subscribeHome } from "@/lib/store";
import { clearDeviceData, pushNow, pushSoon, syncAfterSignIn } from "@/lib/sync";

export interface AccountUser {
  id: string;
  email: string;
}

type Backend = "supabase" | "local" | "none";

/** Current account + background sync of local changes while signed in. */
export function useAccount() {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [backend, setBackend] = useState<Backend>("none");
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { user: null, backend: "none" }))
      .catch(() => ({ user: null, backend: "none" }))
      .then((d: { user: AccountUser | null; backend: Backend }) => {
        if (!alive) return;
        setUser(d.user);
        setBackend(d.backend);
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // While signed in, upload changes shortly after they happen.
  const uid = user?.id;
  useEffect(() => {
    if (!uid) return;
    const push = () => pushSoon(uid);
    const unsubHome = subscribeHome(push);
    const unsubProgress = subscribeProgress(push);
    window.addEventListener(PHOTO_EVENT, push);
    return () => {
      unsubHome();
      unsubProgress();
      window.removeEventListener(PHOTO_EVENT, push);
    };
  }, [uid]);

  const completeSignIn = useCallback(async (u: AccountUser) => {
    setSyncing(true);
    try {
      return await syncAfterSignIn(u.id);
    } finally {
      setUser(u);
      setSyncing(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    if (uid) await pushNow(uid).catch(() => undefined); // save anything pending first
    await fetch("/api/auth/logout", { method: "POST" });
    await clearDeviceData();
    setUser(null);
  }, [uid]);

  /** Permanently deletes the account on the server, then wipes this device. */
  const deleteAccount = useCallback(async () => {
    const res = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "DELETE" }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(data.error ?? "Couldn't delete your account. Please try again.");
    await clearDeviceData();
    try {
      localStorage.clear();
    } catch {}
    setUser(null);
  }, []);

  return { user, backend, loaded, syncing, completeSignIn, signOut, deleteAccount };
}

/** Email -> 6-digit code sign-in. No passwords. */
export function AuthSheet({
  title = "Save your progress",
  subtitle = "Sign in with your email to keep your rooms, streak and Pro on every device.",
  onClose,
  onSignedIn,
}: {
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onSignedIn: (user: AccountUser) => Promise<unknown>;
}) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeInput = useRef<HTMLInputElement>(null);

  // Countdown for "Send a new code" (codes can only be requested every ~30 seconds).
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function sendCode() {
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json();
      if (res.status === 429 && typeof data.retryAfter === "number") {
        setCooldown(data.retryAfter);
        // A code was already sent recently: it still works, so go to (or stay on) the code step.
        if (step === "code") {
          setError(`${data.error} Your last code still works.`);
          return;
        }
        setStep("code");
        setError(`${data.error} If you already got a code, enter it below.`);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Couldn't send the code.");
      setDevCode(data.devCode ?? null);
      setCooldown(30);
      setStep("code");
      setTimeout(() => codeInput.current?.focus(), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the code.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That code didn't work.");
      await onSignedIn(data.user as AccountUser);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That code didn't work.");
      setBusy(false);
    }
  }

  return (
    <div
      className="sheet-backdrop fixed inset-0 z-50 flex items-end justify-center bg-neutral-950/55 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={step === "email" ? title : "Check your email"}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet-panel relative w-full max-w-md rounded-t-[28px] bg-white px-6 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-8 shadow-2xl sm:rounded-[28px] sm:px-8">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
          aria-label="Close"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        {step === "email" ? (
          <LogoMark size={52} className="mx-auto block" />
        ) : (
          <div className="mx-auto grid h-[52px] w-[52px] place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="3" />
              <path d="M4 7l8 6 8-6" />
            </svg>
          </div>
        )}
        <h2 className="mt-4 text-center text-[26px] font-bold leading-tight tracking-tight">{step === "email" ? title : "Check your email"}</h2>
        <p className="mx-auto mt-2 max-w-xs text-balance text-center text-[15px] leading-snug text-neutral-500">
          {step === "email" ? (
            subtitle
          ) : (
            <>
              We sent a 6-digit code to <span className="font-semibold text-neutral-900">{email.trim()}</span>
            </>
          )}
        </p>

        {step === "email" ? (
          <form
            className="mt-6"
            onSubmit={(e) => {
              e.preventDefault();
              sendCode();
            }}
          >
            <label className="block text-sm font-medium text-neutral-700" htmlFor="auth-email">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1.5 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3.5 text-base outline-none transition placeholder:text-neutral-400 focus:border-neutral-950 focus:ring-4 focus:ring-neutral-950/5"
            />
            {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="mt-4 w-full rounded-2xl bg-neutral-950 py-4 font-semibold text-white transition hover:bg-neutral-800 active:scale-[0.99] disabled:opacity-60"
            >
              {busy ? "Sending…" : "Continue"}
            </button>
            <p className="mt-4 text-center text-xs leading-relaxed text-neutral-400">
              New or returning, the same code signs you in.
              <br />
              By continuing you agree to our{" "}
              <Link href="/terms" className="underline hover:text-neutral-700">
                Terms
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="underline hover:text-neutral-700">
                Privacy Policy
              </Link>
              .
            </p>
          </form>
        ) : (
          <form
            className="mt-6"
            onSubmit={(e) => {
              e.preventDefault();
              verify();
            }}
          >
            {devCode && (
              <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-center text-sm text-amber-800 ring-1 ring-amber-200">
                Demo accounts: no email is sent. Your code is <b className="font-mono tracking-widest">{devCode}</b>
              </p>
            )}
            <label className="sr-only" htmlFor="auth-code">
              6-digit code
            </label>
            <input
              id="auth-code"
              ref={codeInput}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-4 text-center font-mono text-[28px] tracking-[0.5em] outline-none transition placeholder:text-neutral-300 focus:border-neutral-950 focus:ring-4 focus:ring-neutral-950/5"
            />
            <p className="mt-2 text-center text-xs text-neutral-400">Can&apos;t find it? Check your spam or promotions folder.</p>
            {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="mt-4 w-full rounded-2xl bg-neutral-950 py-4 font-semibold text-white transition hover:bg-neutral-800 active:scale-[0.99] disabled:opacity-60"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <div className="mt-4 flex justify-between text-sm font-medium text-neutral-600">
              <button
                type="button"
                className="hover:text-neutral-950"
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setError(null);
                }}
              >
                ← Change email
              </button>
              <button type="button" onClick={sendCode} disabled={busy || cooldown > 0} className="hover:text-neutral-950 disabled:text-neutral-300">
                {cooldown > 0 ? `Send a new code (${cooldown}s)` : "Send a new code"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export function AccountCard({
  user,
  syncing,
  onSignIn,
  onSignOut,
  onDelete,
}: {
  user: AccountUser | null;
  syncing: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onDelete: () => Promise<void>;
}) {
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState<"closed" | "open" | "busy">("closed");
  const [typed, setTyped] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  if (!user) {
    return (
      <div className="flex items-center gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-neutral-950/5">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-sky-50 text-2xl">💾</span>
        <div className="flex-1">
          <p className="font-bold">Save your progress</p>
          <p className="text-sm text-neutral-900/60">Keep your rooms and streak on every device.</p>
        </div>
        <button onClick={onSignIn} className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-black">
          Sign in
        </button>
      </div>
    );
  }
  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-neutral-950/5">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-neutral-100 text-xl font-bold uppercase text-neutral-900">
          {user.email[0]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{user.email}</p>
          <p className="text-sm text-emerald-600">{syncing ? "Syncing…" : "✓ Saved to your account"}</p>
        </div>
      </div>
      {confirm ? (
        <div className="mt-3 rounded-2xl bg-neutral-100 p-3 text-sm">
          <p>Sign out? Your data stays safe in your account and is removed from this device.</p>
          <div className="mt-2 flex gap-2">
            <button onClick={onSignOut} className="flex-1 rounded-xl bg-white py-2 font-bold text-rose-600 ring-1 ring-rose-200">
              Sign out
            </button>
            <button onClick={() => setConfirm(false)} className="flex-1 rounded-xl bg-white py-2 font-bold ring-1 ring-neutral-950/10">
              Cancel
            </button>
          </div>
        </div>
      ) : deleting !== "closed" ? (
        <div className="mt-3 rounded-2xl bg-rose-50 p-3 text-sm ring-1 ring-rose-100">
          <p className="font-bold text-rose-700">Delete your account forever?</p>
          <p className="mt-1 text-neutral-700">
            This removes your rooms, history, photos and streak from our servers and this device, and cancels any Pro subscription so
            you won&apos;t be charged again. This can&apos;t be undone.
          </p>
          <label className="mt-3 block text-xs font-semibold text-neutral-600">
            Type DELETE to confirm
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoCapitalize="characters"
              className="mt-1 w-full rounded-xl bg-white px-3 py-2 text-base ring-1 ring-neutral-950/10 outline-none focus:ring-2 focus:ring-rose-400"
            />
          </label>
          {deleteError && <p className="mt-2 text-rose-700">{deleteError}</p>}
          <div className="mt-3 flex gap-2">
            <button
              disabled={typed.trim().toUpperCase() !== "DELETE" || deleting === "busy"}
              onClick={async () => {
                setDeleting("busy");
                setDeleteError(null);
                try {
                  await onDelete();
                } catch (err) {
                  setDeleteError(err instanceof Error ? err.message : "Couldn't delete your account.");
                  setDeleting("open");
                }
              }}
              className="flex-1 rounded-xl bg-rose-600 py-2 font-bold text-white disabled:opacity-40"
            >
              {deleting === "busy" ? "Deleting…" : "Delete forever"}
            </button>
            <button
              onClick={() => {
                setDeleting("closed");
                setTyped("");
                setDeleteError(null);
              }}
              className="flex-1 rounded-xl bg-white py-2 font-bold ring-1 ring-neutral-950/10"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between">
          <button onClick={() => setConfirm(true)} className="text-sm font-semibold text-neutral-900/50 hover:text-neutral-900">
            Sign out
          </button>
          <button onClick={() => setDeleting("open")} className="text-sm font-semibold text-neutral-900/40 hover:text-rose-600">
            Delete account
          </button>
        </div>
      )}
    </div>
  );
}
