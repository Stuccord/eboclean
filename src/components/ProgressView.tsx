"use client";

import { currentStreak, type Progress } from "@/lib/progress";
import { PlanCard, type BillingStatus } from "./Billing";
import { InstallCard } from "./Pwa";
import { TimelineEntry } from "./RoomsView";
import { Card, Stat, type HomeData } from "./ui";

// Simple levels so points feel like progress.
const LEVELS = [
  { at: 0, name: "Dust Bunny", emoji: "🐰" },
  { at: 100, name: "Tidy Rookie", emoji: "🧽" },
  { at: 300, name: "Reset Regular", emoji: "🧺" },
  { at: 700, name: "Clutter Crusher", emoji: "💪" },
  { at: 1500, name: "Home Hero", emoji: "🏆" },
];

export function ProgressView({
  data,
  progress,
  billing,
  onUpgrade,
  accountCard,
}: {
  data: HomeData;
  progress: Progress;
  billing: BillingStatus | null;
  onUpgrade: () => void;
  accountCard?: React.ReactNode;
}) {
  const entries = [...data.history].sort((a, b) => b.date - a.date);
  const levelIdx = LEVELS.reduce((idx, l, i) => (progress.points >= l.at ? i : idx), 0);
  const level = LEVELS[levelIdx];
  const next = LEVELS[levelIdx + 1];
  const pct = next ? Math.round(((progress.points - level.at) / (next.at - level.at)) * 100) : 100;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <h1 className="text-3xl font-bold">Progress</h1>

      <Card className="bg-gradient-to-br from-neutral-900 to-neutral-700 text-white ring-0">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/20 text-4xl">{level.emoji}</div>
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/70">Level {levelIdx + 1}</p>
            <p className="text-xl font-bold">{level.name}</p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-xs text-white/70">{next ? `${next.at - progress.points} pts to ${next.name}` : "Max level reached!"}</p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Day streak" value={`🔥 ${currentStreak(progress)}`} />
        <Stat label="Points" value={`${progress.points}`} />
        <Stat label="Best drop" value={`-${progress.bestDrop}`} />
      </div>

      {accountCard}
      <InstallCard />
      <PlanCard status={billing} onUpgrade={onUpgrade} />

      <div>
        <h2 className="font-bold">Glow-up timeline</h2>
        {entries.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-900/60">Scan a mess, clean it, and snap the after photo. Your before/after moments will collect here.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {entries.map((e) => (
              <TimelineEntry key={e.id} entry={e} showRoom />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
