"use client";

import { useEffect, useRef, useState } from "react";
import type { PlannedStep } from "@/lib/store";
import { CATEGORY_EMOJI, CATEGORY_TINT, IconTile } from "./ui";

/**
 * "Pick for me": beats choice paralysis. Flicks through due tasks like a slot
 * machine and lands on one, then starts it.
 */
export function SpinPicker({
  options,
  onPick,
  onClose,
}: {
  options: PlannedStep[];
  onPick: (step: PlannedStep) => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Final landing spot is chosen once, when the spin starts (event-driven, not render).
    const target = Math.floor(Math.random() * options.length);
    const totalTicks = options.length * 3 + target;
    let tick = 0;
    const step = () => {
      tick += 1;
      setIndex(tick % options.length);
      if (tick >= totalTicks) {
        setDone(true);
        return;
      }
      // Slow down towards the end, like a real wheel.
      const delay = 60 + Math.pow(tick / totalTicks, 3) * 380;
      timer.current = setTimeout(step, delay);
    };
    timer.current = setTimeout(step, 60);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [options.length]);

  const current = options[index];

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-neutral-950/40 p-6" role="dialog" aria-modal="true" aria-label="Pick a task for me">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
        <p className="text-sm font-bold uppercase tracking-wider text-neutral-900">{done ? "Your task is…" : "Picking for you…"}</p>
        <div className={`mt-4 flex flex-col items-center rounded-3xl p-5 transition ${done ? "bg-neutral-100 ring-2 ring-neutral-400" : "bg-neutral-100"}`}>
          <IconTile emoji={CATEGORY_EMOJI[current.category] ?? "✨"} tint={CATEGORY_TINT[current.category] ?? "bg-pink-100"} size="lg" />
          <p className="mt-3 text-xl font-bold">{current.title}</p>
          <p className="text-sm text-neutral-900/60">
            {current.detail} · {current.minutes} min
          </p>
        </div>
        {done ? (
          <div className="mt-5 space-y-2">
            <button onClick={() => onPick(current)} className="w-full rounded-2xl bg-emerald-500 py-3 font-bold text-white shadow-lg shadow-emerald-500/25">
              Let&apos;s do it ▶
            </button>
            <button onClick={onClose} className="w-full py-2 text-sm font-semibold text-neutral-900/60">
              Not now
            </button>
          </div>
        ) : (
          <p className="mt-5 text-sm text-neutral-900/50">No decisions needed. We&apos;ve got this.</p>
        )}
      </div>
    </div>
  );
}
