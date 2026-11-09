"use client";

import { useState } from "react";
import { EARLY_BIRD_OFFER, SPOTS, type Spot } from "@/lib/waitlist";

type Result = { position: number | null; already?: boolean };

const SPOT_LABEL: Record<Spot, string> = {
  bedroom: "🛏️ Bedroom",
  kitchen: "🍳 Kitchen",
  desk: "💻 Desk",
  "living room": "🛋️ Living room",
  bathroom: "🛁 Bathroom",
  car: "🚗 Car",
  everywhere: "🌪️ Everywhere",
};

function joinWaitlist(body: Record<string, unknown>) {
  return fetch("/api/waitlist", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
    return data as Result;
  });
}

export function WaitlistForm({ earlyBird }: { earlyBird: number }) {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const ref = new URLSearchParams(window.location.search).get("ref")?.slice(0, 40) || undefined;
      setResult(await joinWaitlist({ email, ref, website: website || undefined }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function pickSpot(s: Spot) {
    setSpot(s);
    // Best effort: the signup already counted, this just adds the answer.
    joinWaitlist({ email, spot: s }).catch(() => undefined);
  }

  async function share() {
    const url = `${window.location.origin}/waitlist?ref=friend`;
    const text = "This app scores your messy room and gives you a 10-minute plan. Joining the early access:";
    if (navigator.share) {
      await navigator.share({ title: "Eboclean", text, url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(`${text} ${url}`).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (result) {
    const early = result.position != null && result.position <= earlyBird;
    return (
      <div className="rounded-3xl bg-white/90 p-5 text-center shadow-lg ring-1 ring-black/5 backdrop-blur" role="status">
        <div className="text-lg font-bold">
          🎉 {result.already ? "You're already on the list!" : "You're on the list!"}
        </div>
        {result.position != null && (
          <p className="mt-1 text-sm text-neutral-600">
            You&apos;re <b className="text-neutral-950">#{result.position}</b>
            {early ? <> and you&apos;ve locked in <b className="text-neutral-950">{EARLY_BIRD_OFFER}</b>.</> : "."} We&apos;ll email
            you when your spot opens.
          </p>
        )}

        <div className="mt-4 text-sm font-semibold text-neutral-700">
          {spot ? "Got it, thanks! 🙌" : "One quick question: what's your messiest spot?"}
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          {SPOTS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={spot === s}
              disabled={spot !== null}
              onClick={() => pickSpot(s)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition ${
                spot === s
                  ? "bg-neutral-950 text-white ring-neutral-950"
                  : "bg-neutral-50 text-neutral-800 ring-black/10 enabled:hover:bg-neutral-100 disabled:opacity-40"
              }`}
            >
              {SPOT_LABEL[s]}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={share}
          className="mt-4 w-full rounded-2xl bg-neutral-950 px-5 py-3 text-sm font-semibold text-white active:scale-[0.98]"
        >
          {copied ? "Link copied ✓" : "Share with a messy friend"}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="relative">
      <div className="flex rounded-2xl bg-neutral-100 p-1 ring-1 ring-black/5 focus-within:ring-2 focus-within:ring-neutral-950">
        <label htmlFor="wl-email" className="sr-only">
          Your email
        </label>
        <input
          id="wl-email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-w-0 flex-1 bg-transparent px-3 text-[15px] outline-none placeholder:text-neutral-500"
        />
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 rounded-xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white hover:bg-neutral-800 active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? "Saving…" : "Get early access →"}
        </button>
      </div>
      {/* Honeypot for bots: hidden from people and screen readers. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
      />
      {error ? (
        <p className="mt-2 text-sm font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : (
        <p className="mt-2 text-xs text-neutral-500">
          First {earlyBird} people get <b className="text-neutral-800">{EARLY_BIRD_OFFER}</b>. No spam.
        </p>
      )}
    </form>
  );
}
