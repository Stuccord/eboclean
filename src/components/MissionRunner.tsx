"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlannedStep } from "@/lib/store";
import { LogoMark } from "./Logo";
import { CATEGORY_EMOJI, Confetti } from "./ui";

const NEXT_LINES = [
  "Nice one! Next up: {t}.",
  "Boom. Next: {t}.",
  "Look at you go! Now: {t}.",
  "Done and done. Next: {t}.",
];
const CHEER_LINES = [
  "You're doing great. I'm right here.",
  "Tiny steps still count.",
  "Keep going, you've got this.",
  "Future you is already saying thank you.",
  "No rush. Just keep moving.",
];

function useSpeech(enabled: boolean) {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  return useCallback(
    (text: string) => {
      if (!enabled || !supported) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.02;
      u.pitch = 1.1;
      window.speechSynthesis.speak(u);
    },
    [enabled, supported],
  );
}

export interface MissionOutcome {
  completedIndices: number[];
  stoppedEarly: boolean;
  seconds: number;
  reward: string | null;
}

const REWARDS = ["☕ A coffee", "📺 One episode", "🍫 A snack", "🎮 Game time", "📱 Guilt-free scrolling", "🛁 A long shower"];

export function MissionRunner({
  steps,
  companion,
  startScore,
  onFinish,
}: {
  steps: PlannedStep[];
  companion: boolean;
  startScore?: number;
  onFinish: (outcome: MissionOutcome) => void;
}) {
  const [started, setStarted] = useState(!companion);
  const [stepIndex, setStepIndex] = useState(0);
  const [completed, setCompleted] = useState<boolean[]>(() => steps.map(() => false));
  const [elapsed, setElapsed] = useState(0);
  const [voiceOn, setVoiceOn] = useState(companion);
  const [bubble, setBubble] = useState<string>("Hi, I'm Ebo! ✨ Let's just do 2 minutes together. You can stop after that, no guilt.");
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [burst, setBurst] = useState(0);
  const [reward, setReward] = useState<string | null>(null);
  const speak = useSpeech(voiceOn);
  const cheerIdx = useRef(0);
  const elapsedRef = useRef(0);
  const checkInState = useRef<"pending" | "open" | "done">("pending");

  const say = useCallback(
    (text: string) => {
      setBubble(text);
      speak(text);
    },
    [speak],
  );
  const sayRef = useRef(say);
  useEffect(() => {
    sayRef.current = say;
  }, [say]);

  // Mission clock + companion check-ins (cheer every 50s, check in at 2 minutes)
  useEffect(() => {
    if (!started) return;
    const id = setInterval(() => {
      elapsedRef.current += 1;
      const e = elapsedRef.current;
      setElapsed(e);
      if (!companion) return;
      if (e === 120 && checkInState.current === "pending") {
        checkInState.current = "open";
        setShowCheckIn(true);
        sayRef.current("Two minutes done! That already counts. Want to keep going?");
      } else if (e % 50 === 0 && checkInState.current !== "open") {
        const line = CHEER_LINES[cheerIdx.current % CHEER_LINES.length];
        cheerIdx.current += 1;
        sayRef.current(line);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [started, companion]);

  useEffect(() => () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const doneCount = completed.filter(Boolean).length;
  const liveScore =
    startScore !== undefined
      ? Math.round(startScore - ((startScore - Math.min(startScore, 15)) * doneCount) / (steps.length || 1))
      : undefined;

  function finish(done: boolean[], early: boolean) {
    if (companion) say(early ? "That counts! Proud of you." : "Mission complete! You did it!");
    onFinish({
      completedIndices: done.flatMap((d, i) => (d ? [i] : [])),
      stoppedEarly: early,
      seconds: elapsed,
      reward,
    });
  }

  function advance(done: boolean[]) {
    const next = done.findIndex((d, i) => !d && i > stepIndex);
    if (next === -1) {
      finish(done, false);
    } else {
      setStepIndex(next);
      if (companion) {
        const line = NEXT_LINES[next % NEXT_LINES.length].replace("{t}", steps[next].title);
        say(line);
      }
    }
  }

  if (!started) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center text-center">
        <LogoMark size={88} className="drop-shadow-lg" />
        <h2 className="mt-4 text-3xl font-black">Just 2 minutes.</h2>
        <p className="mt-3 max-w-xs text-indigo-900/60">
          I&apos;ll stay with you and tell you exactly what to do. After 2 minutes you can stop, and it still counts.
        </p>
        <div className="mt-6 w-full rounded-3xl bg-white p-4 text-left shadow-sm ring-1 ring-indigo-950/5">
          <p className="text-sm font-bold">🎁 Pick a reward for after</p>
          <p className="text-xs text-indigo-900/50">Your brain works better with something to look forward to.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {REWARDS.map((r) => (
              <button
                key={r}
                onClick={() => setReward(reward === r ? null : r)}
                aria-pressed={reward === r}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                  reward === r ? "bg-violet-600 text-white" : "bg-indigo-50 text-indigo-900 hover:bg-indigo-100"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <label className="mt-3 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-indigo-950/5 text-sm">
          <input type="checkbox" checked={voiceOn} onChange={(e) => setVoiceOn(e.target.checked)} className="h-5 w-5 accent-violet-600" />
          Talk to me out loud 🔊
        </label>
        <div className="mt-6 w-full">
          <button
            onClick={() => {
              setStarted(true);
              const t = `Let's go! First up: ${steps[0].title}.`;
              setBubble(t);
              if (voiceOn && "speechSynthesis" in window) {
                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(new SpeechSynthesisUtterance(t));
              }
            }}
            className="w-full rounded-3xl bg-emerald-500 py-5 text-2xl font-black text-white shadow-lg shadow-emerald-500/25 transition active:scale-95"
          >
            ▶ Start with me
          </button>
        </div>
      </section>
    );
  }

  const step = steps[stepIndex];
  const pct = Math.round((doneCount / steps.length) * 100);
  const mm = Math.floor(elapsed / 60);
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <section className="relative flex flex-1 flex-col">
      <div className="flex items-center justify-between text-sm text-indigo-900/60">
        <span>
          Step {stepIndex + 1} of {steps.length}
        </span>
        <span className="font-mono">⏱ {mm}:{ss}</span>
        {liveScore !== undefined ? (
          <span>
            Mess Score <b className="text-indigo-950">{liveScore}</b>
          </span>
        ) : (
          <span>{doneCount} done</span>
        )}
      </div>
      <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-indigo-950/10">
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>

      {reward && (
        <p className="mt-3 rounded-full bg-amber-50 px-3 py-1 text-center text-xs font-bold text-amber-700 ring-1 ring-amber-100">
          🎁 Then you get: {reward}
        </p>
      )}

      {companion && (
        <div className="mt-4 flex items-start gap-3">
          <LogoMark size={40} className="shrink-0 rounded-full" />
          <div className="relative rounded-2xl rounded-tl-sm bg-indigo-50 px-4 py-2 text-sm" aria-live="polite">
            {bubble}
          </div>
          <button
            onClick={() => setVoiceOn((v) => !v)}
            className="ml-auto shrink-0 rounded-full bg-indigo-50 px-2 py-1 text-sm"
            aria-label={voiceOn ? "Mute Ebo" : "Unmute Ebo"}
          >
            {voiceOn ? "🔊" : "🔇"}
          </button>
        </div>
      )}

      <StepCard key={`step-${stepIndex}`} title={step.title} detail={step.detail} minutes={step.minutes} category={step.category} />

      {burst > 0 && <Confetti key={`burst-${burst}`} />}

      <button
        onClick={() => {
          const next = [...completed];
          next[stepIndex] = true;
          setCompleted(next);
          setBurst((b) => b + 1);
          advance(next);
        }}
        className="w-full rounded-3xl bg-emerald-500 py-5 text-2xl font-black text-white shadow-lg shadow-emerald-500/25 transition active:scale-95"
      >
        ✓ Done (+10)
      </button>
      <div className="mt-3 flex justify-between text-sm text-indigo-900/50">
        <button onClick={() => advance(completed)} className="underline-offset-4 hover:underline">
          Skip this one
        </button>
        <button onClick={() => finish(completed, true)} className="underline-offset-4 hover:underline">
          Stop here (still counts)
        </button>
      </div>

      {showCheckIn && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-indigo-950/40 p-6">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl ring-1 ring-indigo-950/5">
            <div className="text-5xl">🎉</div>
            <h3 className="mt-3 text-2xl font-black">2 minutes done!</h3>
            <p className="mt-2 text-indigo-900/60">That already counts. Keep the momentum going?</p>
            <button
              onClick={() => {
                setShowCheckIn(false);
                checkInState.current = "done";
                say(`Let's keep going! Still on: ${steps[stepIndex].title}.`);
              }}
              className="mt-5 w-full rounded-2xl bg-emerald-500 py-3 font-black text-white"
            >
              Keep going 💪
            </button>
            <button
              onClick={() => {
                setShowCheckIn(false);
                checkInState.current = "done";
                finish(completed, true);
              }}
              className="mt-2 w-full rounded-2xl bg-indigo-50 py-3 font-bold"
            >
              Stop here, I did it
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function StepCard({ title, detail, minutes, category }: { title: string; detail: string; minutes: number; category: string }) {
  // Keyed by step, so the countdown resets for each step.
  const total = minutes * 60;
  const [secondsLeft, setSecondsLeft] = useState(total);
  useEffect(() => {
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, "0");

  // Visual timer: a shrinking ring makes time visible (helps with time blindness).
  const size = 200;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? secondsLeft / total : 0;
  const color = frac > 0.5 ? "#8b5cf6" : frac > 0.2 ? "#f59e0b" : "#f43f5e";

  return (
    <div className="my-6 flex flex-1 flex-col items-center text-center">
      <h2 className="text-3xl font-black">{title}</h2>
      <p className="mt-2 text-base text-indigo-900/70">{detail}</p>
      <div className="relative mt-6" style={{ width: size, height: size }} role="timer" aria-label={`${mm} minutes ${ss} seconds left`}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eceaf8" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - frac)}
            style={{ transition: "stroke-dashoffset 1s linear, stroke 0.5s" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-5xl">{CATEGORY_EMOJI[category] ?? "✨"}</span>
          <span className={`mt-1 font-mono text-3xl font-black ${secondsLeft === 0 ? "text-amber-500" : ""}`}>
            {mm}:{ss}
          </span>
        </div>
      </div>
      {secondsLeft === 0 && <p className="mt-3 text-sm text-amber-600">Time&apos;s up for this one, but no rush. Finish or skip, both are fine.</p>}
    </div>
  );
}
