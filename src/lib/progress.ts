// Local progress (streaks, points). Stored on the device for the MVP;
// moves to a database once accounts are added.
export interface Progress {
  points: number;
  missions: number;
  streak: number;
  lastMissionDay: string | null; // YYYY-MM-DD (local time)
  bestDrop: number;
}

const KEY = "clean-sweep-progress-v1";

const EMPTY: Progress = {
  points: 0,
  missions: 0,
  streak: 0,
  lastMissionDay: null,
  bestDrop: 0,
};

let cachedRaw: string | null = null;
let cached: Progress = EMPTY;

export function loadProgress(): Progress {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === cachedRaw) return cached;
    cachedRaw = raw;
    cached = raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
    return cached;
  } catch {
    return EMPTY;
  }
}

const CHANGE_EVENT = "clean-sweep-progress";

/** For useSyncExternalStore: re-render when progress changes. */
export function subscribeProgress(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function serverProgress(): Progress {
  return EMPTY;
}

function dayKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * No-shame streaks: one missed day is a free "rest day" and doesn't break the streak.
 * The streak only resets after 2+ missed days in a row.
 */
const GRACE_DAYS = 1;

function recentDays(now: Date, count: number) {
  return Array.from({ length: count }, (_, i) => dayKey(new Date(now.getTime() - i * 86_400_000)));
}

export function currentStreak(p: Progress, nowArg?: Date): number {
  if (!p.lastMissionDay) return 0;
  const now = nowArg ?? new Date();
  return recentDays(now, 2 + GRACE_DAYS).includes(p.lastMissionDay) ? p.streak : 0;
}

/** True when the user is currently on a rest day (missed yesterday, streak still safe). */
export function onRestDay(p: Progress, nowArg?: Date): boolean {
  if (!p.lastMissionDay || p.streak === 0) return false;
  const now = nowArg ?? new Date();
  const [today, yesterday] = recentDays(now, 2);
  return p.lastMissionDay !== today && p.lastMissionDay !== yesterday && currentStreak(p, now) > 0;
}

/** A single task checked off: adds points and keeps the streak, without counting a full session. */
export function recordTask(pointsEarned: number): Progress {
  const before = loadProgress();
  const after = recordMission(pointsEarned, 0);
  const next = { ...after, missions: before.missions };
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return next;
}

export function recordMission(pointsEarned: number, drop: number, now = new Date()): Progress {
  const p = loadProgress();
  const [today, ...previous] = recentDays(now, 2 + GRACE_DAYS);

  let streak = p.streak;
  if (p.lastMissionDay === today) {
    // already counted today
  } else if (p.lastMissionDay && previous.includes(p.lastMissionDay)) {
    streak += 1; // yesterday, or a rest day in between
  } else {
    streak = 1;
  }

  const next: Progress = {
    points: p.points + pointsEarned,
    missions: p.missions + 1,
    streak,
    lastMissionDay: today,
    bestDrop: Math.max(p.bestDrop, drop),
  };
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return next;
}

/** Replaces local progress with the copy from the account (on sign-in to a new device). */
export function replaceProgress(p: Progress | null) {
  if (p) localStorage.setItem(KEY, JSON.stringify({ ...EMPTY, ...p }));
  else localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
