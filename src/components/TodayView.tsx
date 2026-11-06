"use client";

import { useState } from "react";
import { recordTask } from "@/lib/progress";
import { buildDailyPlan, effortPoints, markTasksDone, roomFreshness, taskNeed, type PlannedStep, type Room } from "@/lib/store";
import { InstallCard } from "./Pwa";
import { SpinPicker } from "./SpinPicker";
import { Card, Chip, FreshnessRing, PrimaryButton, TaskRow, type Energy, type HomeData } from "./ui";

const TIME_OPTIONS = [5, 10, 15, 30];
const ENERGY_OPTIONS: { value: Energy; label: string }[] = [
  { value: "low", label: "🪫 Low" },
  { value: "medium", label: "🔋 Okay" },
  { value: "high", label: "⚡ High" },
];

/** SOS: the single tiniest, most useful task in the whole home. */
export function sosTask(rooms: Room[], now: number): PlannedStep | null {
  const all = rooms.flatMap((room) => room.tasks.map((task) => ({ room, task, need: taskNeed(task, now) })));
  if (all.length === 0) return null;
  const pool = all.filter((c) => c.need >= 0.5);
  const best = (pool.length ? pool : all).sort((a, b) => a.task.minutes - b.task.minutes || b.need - a.need)[0];
  return {
    title: best.task.title,
    detail: `${best.room.emoji} ${best.room.name} · just this one thing`,
    minutes: Math.min(best.task.minutes, 3),
    category: best.task.category,
    roomName: best.room.name,
    taskId: best.task.id,
  };
}

// Low energy = smaller plan and easiest tasks first.
function budgetFor(minutes: number, energy: Energy) {
  return energy === "low" ? Math.max(5, Math.round(minutes * 0.6)) : minutes;
}

export function TodayView({
  data,
  timeBudget,
  energy,
  setTimeBudget,
  setEnergy,
  onStart,
  onScan,
  onSetup,
  restDay,
}: {
  data: HomeData;
  timeBudget: number;
  energy: Energy;
  setTimeBudget: (n: number) => void;
  setEnergy: (e: Energy) => void;
  onStart: (steps: PlannedStep[], companion: boolean) => void;
  onScan: () => void;
  onSetup: () => void;
  restDay?: boolean;
}) {
  const [spinning, setSpinning] = useState(false);
  const { rooms, now } = data;
  let plan = buildDailyPlan(rooms, budgetFor(timeBudget, energy), now);
  if (energy === "low") plan = [...plan].sort((a, b) => a.minutes - b.minutes);
  const total = plan.reduce((s, p) => s + p.minutes, 0);
  const points = plan.reduce((s, p) => s + effortPoints(p.minutes), 0);
  const hour = now ? new Date(now).getHours() : 12;
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const homeFresh = rooms.length ? Math.round(rooms.reduce((s, r) => s + roomFreshness(r, now), 0) / rooms.length) : 0;
  const taskById = new Map(rooms.flatMap((r) => r.tasks.map((t) => [t.id, t] as const)));

  if (rooms.length === 0) {
    return (
      <div className="flex flex-1 flex-col">
        <h1 className="text-3xl font-bold">{greeting} 👋</h1>
        <p className="mt-2 text-neutral-900/60">Add your rooms once and we&apos;ll pick the 10 minutes that matter most, every day.</p>
        <div className="mt-6 space-y-3">
          <PrimaryButton onClick={onSetup}>🏠 Set up my home</PrimaryButton>
          <PrimaryButton variant="plain" onClick={onScan}>
            📸 Just scan one messy spot
          </PrimaryButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <p className="text-sm font-semibold text-neutral-900/50">{greeting} 👋</p>
        <h1 className="text-3xl font-bold">Your home today</h1>
      </div>

      <InstallCard compact />

      {restDay && (
        <p className="rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-800 ring-1 ring-sky-100">
          😴 Yesterday was a rest day. Your streak is safe. Rest days are part of the plan.
        </p>
      )}

      <button
        onClick={() => {
          const t = sosTask(rooms, now);
          if (t) onStart([t], true);
        }}
        className="flex w-full items-center gap-3 rounded-3xl bg-gradient-to-r from-rose-50 to-orange-50 p-4 text-left ring-1 ring-rose-100 transition hover:ring-rose-200 active:scale-[0.99]"
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-2xl shadow-sm">😵‍💫</span>
        <span className="flex-1">
          <span className="block font-bold text-rose-700">Feeling overwhelmed?</span>
          <span className="text-sm text-rose-900/70">Tap here. We&apos;ll give you one tiny thing, just 2 minutes.</span>
        </span>
        <span className="text-rose-400">›</span>
      </button>

      <Card className="flex items-center gap-4">
        <FreshnessRing value={homeFresh} size={72} />
        <div>
          <p className="font-bold">Home freshness</p>
          <p className="text-sm text-neutral-900/60">
            {homeFresh >= 70 ? "Looking great! Keep the streak alive." : homeFresh >= 40 ? "A quick reset will make a big difference." : "Let's start small. Every task counts."}
          </p>
        </div>
      </Card>

      <div>
        <p className="mb-2 text-sm font-bold text-neutral-900/60">How much time do you have?</p>
        <div className="flex flex-wrap gap-2">
          {TIME_OPTIONS.map((t) => (
            <Chip key={t} active={timeBudget === t} onClick={() => setTimeBudget(t)}>
              {t} min
            </Chip>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {ENERGY_OPTIONS.map((o) => (
            <Chip key={o.value} active={energy === o.value} onClick={() => setEnergy(o.value)}>
              {o.label}
            </Chip>
          ))}
        </div>
      </div>

      <Card>
        <div className="mb-1 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Today&apos;s plan</h2>
            <span className="text-xs font-bold text-neutral-900">
              ~{total} min · {points} pts
            </span>
          </div>
          {plan.length > 1 && (
            <button
              onClick={() => setSpinning(true)}
              className="rounded-full bg-neutral-100 px-3 py-2 text-sm font-bold text-neutral-900 ring-1 ring-neutral-200 hover:bg-neutral-100"
            >
              🎲 Pick for me
            </button>
          )}
        </div>
        {plan.length === 0 ? (
          <p className="py-6 text-center text-neutral-900/60">✨ Everything&apos;s fresh. Nothing is due today!</p>
        ) : (
          <ul className="divide-y divide-neutral-950/5">
            {plan.map((s) => {
              const task = s.taskId ? taskById.get(s.taskId) : undefined;
              return (
                <TaskRow
                  key={s.taskId}
                  title={s.title}
                  subtitle={s.detail}
                  category={s.category}
                  minutes={s.minutes}
                  need={task ? taskNeed(task, now) : undefined}
                  onCheck={() => {
                    if (s.taskId) markTasksDone([s.taskId]);
                    recordTask(effortPoints(s.minutes) * 10);
                  }}
                />
              );
            })}
          </ul>
        )}
      </Card>

      {plan.length > 0 && (
        <div className="space-y-2">
          <PrimaryButton onClick={() => onStart(plan, true)}>🧹 Clean with Ebo (guided)</PrimaryButton>
          <button onClick={() => onStart(plan, false)} className="w-full py-1 text-center text-sm font-semibold text-neutral-900">
            Focus mode, one task at a time
          </button>
        </div>
      )}

      {spinning && (
        <SpinPicker
          options={plan}
          onClose={() => setSpinning(false)}
          onPick={(step) => {
            setSpinning(false);
            onStart([step], true);
          }}
        />
      )}

      <button
        onClick={onScan}
        className="flex w-full items-center gap-3 rounded-3xl border-2 border-dashed border-neutral-200 bg-neutral-50 p-4 text-left transition hover:bg-neutral-100"
      >
        <span className="text-2xl">📸</span>
        <span>
          <span className="block font-bold">Got a mess right now?</span>
          <span className="text-sm text-neutral-900/60">Snap it and get a Mess Score + quick mission.</span>
        </span>
      </button>
    </div>
  );
}
