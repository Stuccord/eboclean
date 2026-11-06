"use client";

import { useEffect, useState } from "react";
import {
  effortPoints,
  getHistory,
  getPhoto,
  getRooms,
  needLevel,
  subscribeHome,
  type HistoryEntry,
  type NeedLevel,
  type Room,
} from "@/lib/store";
import { fetchAccountPhoto } from "@/lib/sync";

export const CATEGORY_EMOJI: Record<string, string> = {
  trash: "🗑️",
  dishes: "🍽️",
  laundry: "👕",
  put_away: "📦",
  surfaces: "🧽",
  floor: "🧹",
  other: "✨",
};

// Soft pastel tile behind each category icon.
export const CATEGORY_TINT: Record<string, string> = {
  trash: "bg-slate-100",
  dishes: "bg-sky-100",
  laundry: "bg-violet-100",
  put_away: "bg-amber-100",
  surfaces: "bg-teal-100",
  floor: "bg-orange-100",
  other: "bg-pink-100",
};

export const ROOM_TINTS = ["bg-violet-100", "bg-sky-100", "bg-teal-100", "bg-amber-100", "bg-pink-100", "bg-lime-100"];

export const LEVEL_STYLE: Record<NeedLevel, { label: string; text: string; bar: string; segments: number }> = {
  fresh: { label: "Clean", text: "text-emerald-600", bar: "bg-emerald-400", segments: 1 },
  soon: { label: "Getting there", text: "text-lime-600", bar: "bg-lime-400", segments: 2 },
  due: { label: "Due", text: "text-amber-600", bar: "bg-amber-400", segments: 3 },
  overdue: { label: "Needs love", text: "text-rose-600", bar: "bg-rose-400", segments: 4 },
};

export type Energy = "low" | "medium" | "high";

// ---------- data hooks ----------
export interface HomeData {
  rooms: Room[];
  history: HistoryEntry[];
  loaded: boolean;
  now: number;
}

export function useHomeData(): HomeData {
  const [data, setData] = useState<HomeData>({ rooms: [], history: [], loaded: false, now: 0 });
  useEffect(() => {
    let alive = true;
    const load = () =>
      Promise.all([getRooms(), getHistory()]).then(([rooms, history]) => {
        if (alive) setData({ rooms, history, loaded: true, now: Date.now() });
      });
    load();
    const unsub = subscribeHome(load);
    return () => {
      alive = false;
      unsub();
    };
  }, []);
  return data;
}

export function usePhoto(id: string | null | undefined): string | null {
  const [state, setState] = useState<{ id: string; src: string | null } | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    getPhoto(id)
      // Not on this device yet (e.g. signed in on a new phone): fetch it from the account.
      .then((src) => src ?? fetchAccountPhoto(id).catch(() => null))
      .then((src) => {
        if (alive) setState({ id, src: src ?? null });
      });
    return () => {
      alive = false;
    };
  }, [id]);
  return state && state.id === id ? state.src : null;
}

// ---------- layout pieces ----------
export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-3xl bg-white p-4 shadow-sm ring-1 ring-indigo-950/5 ${className}`}>{children}</div>;
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  variant = "primary",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "success" | "plain";
}) {
  const styles = {
    primary: "bg-violet-600 text-white shadow-lg shadow-violet-600/25 hover:bg-violet-700",
    success: "bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-600",
    plain: "bg-white text-indigo-950 ring-1 ring-indigo-950/10 hover:bg-indigo-50",
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-2xl py-4 text-base font-bold transition active:scale-[0.98] disabled:opacity-50 ${styles}`}
    >
      {children}
    </button>
  );
}

export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
        active ? "bg-violet-600 text-white shadow-sm" : "bg-white text-indigo-900 ring-1 ring-indigo-950/10 hover:bg-indigo-50"
      }`}
    >
      {children}
    </button>
  );
}

export function BackButton({ onClick, label = "Back" }: { onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick} className="mb-4 self-start rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-indigo-900 ring-1 ring-indigo-950/10">
      ← {label}
    </button>
  );
}

export function IconTile({ emoji, tint, size = "md" }: { emoji: string; tint: string; size?: "sm" | "md" | "lg" }) {
  const s = size === "sm" ? "h-9 w-9 text-lg" : size === "lg" ? "h-16 w-16 text-3xl" : "h-11 w-11 text-xl";
  return <div className={`grid shrink-0 place-items-center rounded-2xl ${tint} ${s}`}>{emoji}</div>;
}

// ---------- status visuals ----------
export function FreshnessRing({ value, size = 64, stroke = 7, children }: { value: number; size?: number; stroke?: number; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = value >= 70 ? "#10b981" : value >= 45 ? "#84cc16" : value >= 25 ? "#f59e0b" : "#f43f5e";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label="Freshness">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef0f7" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0.02, value / 100))}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children ?? <span className="text-sm font-black">{value}%</span>}</div>
    </div>
  );
}

export function DirtBar({ level }: { level: NeedLevel }) {
  const s = LEVEL_STYLE[level];
  return (
    <div className="flex gap-0.5" aria-label={s.label}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={`h-1.5 w-3 rounded-full ${i < s.segments ? s.bar : "bg-indigo-950/10"}`} />
      ))}
    </div>
  );
}

export function EffortDots({ minutes }: { minutes: number }) {
  const pts = effortPoints(minutes);
  return (
    <span className="flex items-center gap-0.5" aria-label={`${pts} effort points`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${i <= pts ? "bg-violet-500" : "bg-indigo-950/10"}`} />
      ))}
    </span>
  );
}

/** One task row with a one-tap check circle. */
export function TaskRow({
  title,
  subtitle,
  category,
  minutes,
  need,
  onCheck,
}: {
  title: string;
  subtitle?: string;
  category: string;
  minutes: number;
  need?: number;
  onCheck?: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const level = need !== undefined ? needLevel(need) : undefined;
  return (
    <li className={`flex items-center gap-3 py-2.5 ${checked ? "row-done" : ""}`}>
      <IconTile emoji={CATEGORY_EMOJI[category] ?? "✨"} tint={CATEGORY_TINT[category] ?? "bg-pink-100"} />
      <div className="min-w-0 flex-1">
        <p className={`font-semibold leading-snug ${checked ? "text-indigo-900/40 line-through" : ""}`}>{title}</p>
        {subtitle && <p className="truncate text-xs text-indigo-900/50">{subtitle}</p>}
        <div className="mt-1 flex items-center gap-2 text-xs text-indigo-900/50">
          {level && <DirtBar level={level} />}
          {level && <span className={`font-semibold ${LEVEL_STYLE[level].text}`}>{LEVEL_STYLE[level].label}</span>}
          <span className="whitespace-nowrap">⏱ {minutes} min</span>
          <EffortDots minutes={minutes} />
        </div>
      </div>
      {onCheck && (
        <button
          onClick={() => {
            if (checked) return;
            setChecked(true);
            setTimeout(onCheck, 650);
          }}
          aria-label={`Mark "${title}" done`}
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 text-white transition ${
            checked ? "pop border-emerald-500 bg-emerald-500" : "border-indigo-950/15 hover:border-emerald-400"
          }`}
        >
          {checked && "✓"}
        </button>
      )}
    </li>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 1200);
      setShown(Math.round(score * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [score]);

  const color = score >= 66 ? "bg-rose-500" : score >= 36 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className={`absolute bottom-3 right-3 rounded-2xl ${color} px-4 py-2 text-center text-white shadow-xl`}>
      <div className="text-[10px] font-bold uppercase tracking-widest">Mess Score</div>
      <div className="text-4xl font-black leading-none">{shown}</div>
    </div>
  );
}

const SCAN_MESSAGES = ["Scanning for chaos…", "Counting the mugs…", "Locating the floor…", "Building your plan…"];

export function ScanningView({ image, label }: { image: string | null; label?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % SCAN_MESSAGES.length), 1100);
    return () => clearInterval(id);
  }, []);
  return (
    <section className="flex flex-1 flex-col items-center">
      <div className="relative w-full overflow-hidden rounded-3xl shadow-lg">
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="Scanning your photo" className="h-80 w-full object-cover" />
        )}
        <div className="scan-line absolute inset-x-0 h-1 bg-violet-400 shadow-[0_0_20px_6px_rgba(167,139,250,0.8)]" />
        <div className="absolute inset-0 bg-violet-900/10" />
      </div>
      <p className="mt-6 animate-pulse text-xl font-bold text-violet-700">{label ?? SCAN_MESSAGES[i]}</p>
    </section>
  );
}

// Deterministic "random" spread so render stays pure.
function pseudoRandom(i: number, salt: number) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function Confetti() {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
      {Array.from({ length: 28 }).map((_, i) => (
        <span
          key={i}
          className="confetti absolute top-1/2 left-1/2 h-3 w-2 rounded-sm"
          style={
            {
              background: ["#8b5cf6", "#10b981", "#f59e0b", "#ec4899"][i % 4],
              "--dx": `${(pseudoRandom(i, 1) - 0.5) * 380}px`,
              "--dy": `${-120 - pseudoRandom(i, 2) * 260}px`,
              "--rot": `${pseudoRandom(i, 3) * 720}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

export function PhotoTile({ src, label, score, color, small }: { src: string | null; label: string; score: number; color: string; small?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-indigo-50">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`${label} photo`} className={`${small ? "h-28" : "h-44"} w-full object-cover`} />
      ) : (
        <div className={`${small ? "h-28" : "h-44"} w-full animate-pulse bg-indigo-100`} />
      )}
      <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-xs font-bold text-indigo-950">{label}</span>
      <span className={`absolute bottom-2 right-2 rounded-xl ${color} px-2 py-0.5 ${small ? "text-base" : "text-xl"} font-black text-white`}>{score}</span>
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white py-3 text-center shadow-sm ring-1 ring-indigo-950/5">
      <div className="text-xl font-black">{value}</div>
      <div className="text-xs text-indigo-900/50">{label}</div>
    </div>
  );
}

export function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
