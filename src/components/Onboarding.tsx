"use client";

import { useEffect, useState } from "react";
import { savePrefs } from "@/lib/prefs";
import { addRooms, buildDailyPlan, type PlannedStep } from "@/lib/store";
import { ROOM_TEMPLATES, roomsFromTemplates, type HomeVibe } from "@/lib/templates";
import { LogoMark, Wordmark } from "./Logo";
import { CATEGORY_EMOJI, CATEGORY_TINT, IconTile } from "./ui";

// Step-by-step setup, inspired by habit/cleaning apps: one question per screen,
// big tappable cards, a progress bar, then a personalized plan reveal.

const GOALS = [
  { key: "overwhelm", emoji: "😵‍💫", label: "I get overwhelmed by mess" },
  { key: "start", emoji: "🧠", label: "Starting is the hardest part (ADHD)" },
  { key: "busy", emoji: "⏰", label: "I'm always busy or tired" },
  { key: "shared", emoji: "🏠", label: "I share my home with others" },
  { key: "calm", emoji: "🌿", label: "I just want a calmer space" },
];

const VIBES: { key: HomeVibe; emoji: string; label: string; sub: string }[] = [
  { key: "chaos", emoji: "🌪️", label: "Total chaos", sub: "I don't know where to start" },
  { key: "messy", emoji: "😬", label: "Pretty messy", sub: "It's piling up" },
  { key: "okay", emoji: "🙂", label: "Mostly okay", sub: "I want to keep it that way" },
];

const MINUTES = [
  { value: 5, label: "5 min", sub: "Tiny but mighty" },
  { value: 10, label: "10 min", sub: "Most popular" },
  { value: 15, label: "15 min", sub: "Solid reset" },
  { value: 30, label: "30 min", sub: "Big energy" },
];

const BUILD_LINES = ["Picking your easiest wins…", "Spreading tasks across the week…", "Making day one feel doable…"];

type Step = "welcome" | "goals" | "vibe" | "rooms" | "time" | "building" | "plan";
const QUESTION_STEPS: Step[] = ["goals", "vibe", "rooms", "time"];

export function Onboarding({
  onBegin,
  onFinish,
  onStartFirstReset,
  onSignIn,
  onScanInstead,
}: {
  onBegin: () => void;
  onFinish: (minutes: number) => void;
  onStartFirstReset: (steps: PlannedStep[], minutes: number) => void;
  onSignIn: () => void;
  onScanInstead: () => void;
}) {
  const [step, setStep] = useState<Step>("welcome");
  const [goals, setGoals] = useState<string[]>([]);
  const [vibe, setVibe] = useState<HomeVibe | null>(null);
  const [rooms, setRooms] = useState<string[]>(["bedroom", "kitchen", "bathroom"]);
  const [minutes, setMinutes] = useState(10);
  const [plan, setPlan] = useState<PlannedStep[]>([]);
  const [taskCount, setTaskCount] = useState(0);
  const [buildLine, setBuildLine] = useState(0);

  const qIndex = QUESTION_STEPS.indexOf(step);

  function next() {
    const order: Step[] = ["welcome", "goals", "vibe", "rooms", "time", "building"];
    setStep(order[order.indexOf(step) + 1]);
  }
  function back() {
    const order: Step[] = ["welcome", "goals", "vibe", "rooms", "time"];
    const i = order.indexOf(step);
    if (i > 0) setStep(order[i - 1]);
  }

  // "Building your plan": create the rooms, then reveal the plan.
  useEffect(() => {
    if (step !== "building") return;
    let alive = true;
    const ticker = setInterval(() => setBuildLine((l) => Math.min(l + 1, BUILD_LINES.length - 1)), 700);
    const created = roomsFromTemplates(rooms, vibe ?? "messy");
    const now = Date.now();
    const firstPlan = buildDailyPlan(created, minutes, now);
    Promise.all([addRooms(created), new Promise((r) => setTimeout(r, 2200))]).then(() => {
      if (!alive) return;
      savePrefs({ onboarded: true, goals, vibe, minutes });
      setPlan(firstPlan);
      setTaskCount(created.reduce((s, r) => s + r.tasks.length, 0));
      setStep("plan");
    });
    return () => {
      alive = false;
      clearInterval(ticker);
    };
    // Runs once when entering the building step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const totalMin = plan.reduce((s, p) => s + p.minutes, 0);
  const roomCount = rooms.length;

  return (
    <section className="flex flex-1 flex-col">
      {qIndex >= 0 && (
        <div className="mb-6 flex items-center gap-3">
          <button onClick={back} className="grid h-10 w-10 place-items-center rounded-full bg-neutral-200/70 text-neutral-900" aria-label="Back">
            ←
          </button>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-neutral-200" role="progressbar" aria-valuenow={qIndex + 1} aria-valuemin={1} aria-valuemax={QUESTION_STEPS.length}>
            <div className="h-full rounded-full bg-neutral-900 transition-all duration-500" style={{ width: `${((qIndex + 1) / QUESTION_STEPS.length) * 100}%` }} />
          </div>
                  </div>
      )}

      {step === "welcome" && (
        <div className="flex flex-1 flex-col items-center text-center">
          <div className="mt-6">
            <LogoMark size={96} className="drop-shadow-xl" />
          </div>
          <Wordmark className="mt-5 text-4xl" />
          <h1 className="mt-4 text-3xl font-bold leading-tight">
            Cleaning help for
            <br />
            <span className="text-neutral-900">brains that hate starting.</span>
          </h1>
          <p className="mt-3 max-w-xs text-neutral-900/60">Tiny steps, a friendly voice to start with you, and zero guilt. Made for ADHD, burnout and busy lives.</p>
          <div className="mt-6 grid w-full grid-cols-3 gap-2 text-xs font-semibold text-neutral-900/70">
            <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-neutral-950/5">
              <div className="text-2xl">⏱️</div>2-min starts
            </div>
            <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-neutral-950/5">
              <div className="text-2xl">🎲</div>We pick for you
            </div>
            <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-neutral-950/5">
              <div className="text-2xl">😴</div>Rest days OK
            </div>
          </div>
          <div className="mt-auto w-full space-y-2 pt-8">
            <PrimaryCta
              onClick={() => {
                onBegin();
                next();
              }}
            >
              Get started
            </PrimaryCta>
            <button onClick={onSignIn} className="w-full py-2 text-sm font-semibold text-neutral-900">
              I already have an account
            </button>
          </div>
        </div>
      )}

      {step === "goals" && (
        <Question title="What brings you here?" sub="Pick all that apply. We'll shape your plan around it.">
          <div className="space-y-2">
            {GOALS.map((g) => (
              <ChoiceCard
                key={g.key}
                emoji={g.emoji}
                label={g.label}
                selected={goals.includes(g.key)}
                multi
                onClick={() => setGoals((cur) => (cur.includes(g.key) ? cur.filter((x) => x !== g.key) : [...cur, g.key]))}
              />
            ))}
          </div>
          <Footer>
            <PrimaryCta onClick={next} disabled={goals.length === 0}>
              Continue
            </PrimaryCta>
          </Footer>
        </Question>
      )}

      {step === "vibe" && (
        <Question title="How does your home feel right now?" sub="No judgment. Mess is normal. This just sets your starting point.">
          <div className="space-y-2">
            {VIBES.map((v) => (
              <ChoiceCard
                key={v.key}
                emoji={v.emoji}
                label={v.label}
                sub={v.sub}
                selected={vibe === v.key}
                onClick={() => {
                  setVibe(v.key);
                  setTimeout(next, 250);
                }}
              />
            ))}
          </div>
        </Question>
      )}

      {step === "rooms" && (
        <Question title="Which rooms do you have?" sub="We'll add a gentle routine for each one. You can change it anytime.">
          <div className="grid grid-cols-2 gap-2">
            {ROOM_TEMPLATES.map((t) => {
              const on = rooms.includes(t.key);
              return (
                <button
                  key={t.key}
                  onClick={() => setRooms((cur) => (on ? cur.filter((x) => x !== t.key) : [...cur, t.key]))}
                  aria-pressed={on}
                  className={`relative flex flex-col items-center gap-1 rounded-2xl p-4 text-sm font-bold transition active:scale-[0.97] ${
                    on ? "bg-neutral-950 text-white" : "bg-neutral-200/60 text-neutral-900"
                  }`}
                >
                  {on && <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-white text-[11px] text-neutral-950">✓</span>}
                  <span className="text-3xl">{t.emoji}</span>
                  {t.name}
                </button>
              );
            })}
          </div>
          <button onClick={onScanInstead} className="mt-3 w-full text-center text-sm font-semibold text-neutral-900">
            📸 Or snap a photo of a room instead
          </button>
          <Footer>
            <PrimaryCta onClick={next} disabled={rooms.length === 0}>
              Continue with {rooms.length} room{rooms.length === 1 ? "" : "s"}
            </PrimaryCta>
          </Footer>
        </Question>
      )}

      {step === "time" && (
        <Question title="How much time on a normal day?" sub="Be honest, small is great. You can always do more.">
          <div className="grid grid-cols-2 gap-2">
            {MINUTES.map((m) => (
              <button
                key={m.value}
                onClick={() => setMinutes(m.value)}
                aria-pressed={minutes === m.value}
                className={`rounded-2xl p-4 text-left transition active:scale-[0.97] ${
                  minutes === m.value ? "bg-neutral-950 text-white" : "bg-neutral-200/60 text-neutral-900"
                }`}
              >
                <span className="block text-2xl font-bold">{m.label}</span>
                <span className={`text-xs ${minutes === m.value ? "text-white/60" : "text-neutral-500"}`}>{m.sub}</span>
              </button>
            ))}
          </div>
          <Footer>
            <PrimaryCta onClick={next}>Build my plan ✨</PrimaryCta>
          </Footer>
        </Question>
      )}

      {step === "building" && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="animate-bounce">
            <LogoMark size={80} />
          </div>
          <h2 className="mt-6 text-2xl font-bold">Building your plan</h2>
          <p className="mt-2 animate-pulse text-neutral-900/60">{BUILD_LINES[buildLine]}</p>
        </div>
      )}

      {step === "plan" && (
        <div className="flex flex-1 flex-col">
          <div className="text-center">
            <div className="text-5xl">🎉</div>
            <h2 className="mt-2 text-3xl font-bold">Your plan is ready</h2>
            <p className="mt-1 text-neutral-900/60">
              {roomCount} room{roomCount === 1 ? "" : "s"} · {taskCount} small tasks, spread out so nothing piles up.
            </p>
          </div>

          <div className="mt-5 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-neutral-950/5">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="font-bold">Today&apos;s first reset</h3>
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold text-neutral-900">~{totalMin} min</span>
            </div>
            <ul className="divide-y divide-neutral-950/5">
              {plan.slice(0, 4).map((s) => (
                <li key={s.taskId} className="flex items-center gap-3 py-2.5">
                  <IconTile emoji={CATEGORY_EMOJI[s.category] ?? "✨"} tint={CATEGORY_TINT[s.category] ?? "bg-pink-100"} size="sm" />
                  <span className="flex-1 text-sm font-semibold">{s.title}</span>
                  <span className="text-xs text-neutral-900/50">{s.minutes}m</span>
                </li>
              ))}
            </ul>
            {plan.length > 4 && <p className="pt-1 text-xs text-neutral-900/50">+ {plan.length - 4} more</p>}
          </div>

          <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-100">
            {goals.includes("start") || goals.includes("overwhelm")
              ? "Ebo will start with you and only ask for 2 minutes. If you stop after that, it still counts."
              : "Do it all at once or one task at a time. Every check-off makes your home fresher."}
          </p>

          <div className="mt-auto space-y-2 pt-6">
            <PrimaryCta onClick={() => (plan.length ? onStartFirstReset(plan, minutes) : onFinish(minutes))}>
              {plan.length ? "Start my first 2 minutes ▶" : "Go to my home"}
            </PrimaryCta>
            {plan.length > 0 && (
              <button onClick={() => onFinish(minutes)} className="w-full py-2 text-sm font-semibold text-neutral-900">
                Look around first
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Question({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <h2 className="text-[32px] font-bold leading-tight tracking-tight">{title}</h2>
      <p className="mt-2 text-neutral-500">{sub}</p>
      <div className="mt-6 flex flex-1 flex-col">{children}</div>
    </div>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return <div className="mt-auto pt-6">{children}</div>;
}

function ChoiceCard({
  emoji,
  label,
  sub,
  selected,
  multi,
  onClick,
}: {
  emoji: string;
  label: string;
  sub?: string;
  selected: boolean;
  multi?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={`flex w-full items-center gap-3 rounded-2xl px-4 py-4 text-left transition active:scale-[0.98] ${
        selected ? "bg-neutral-950 text-white" : "bg-neutral-200/60 text-neutral-900 hover:bg-neutral-200"
      }`}
    >
      <span className="text-2xl">{emoji}</span>
      <span className="flex-1">
        <span className="block font-bold">{label}</span>
        {sub && <span className={`text-sm ${selected ? "text-white/60" : "text-neutral-500"}`}>{sub}</span>}
      </span>
      <span
        className={`grid h-6 w-6 shrink-0 place-items-center ${multi ? "rounded-md" : "rounded-full"} border-2 text-xs ${
          selected ? "border-white bg-white text-neutral-950" : "border-neutral-950/20"
        }`}
      >
        {selected && "✓"}
      </span>
    </button>
  );
}

function PrimaryCta({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-full bg-neutral-900 py-4 text-base font-semibold text-white shadow-lg shadow-black/15 transition hover:bg-black active:scale-[0.98] disabled:opacity-40"
    >
      {children}
    </button>
  );
}
