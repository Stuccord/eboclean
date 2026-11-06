"use client";

import { useCallback, useEffect, useState } from "react";

// Building blocks for the admin dashboard: formatting, data loading, tiles, a column chart.

// ---------- formatting ----------
export function money(minor: number, currency = "USD", compact = false) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: compact && Math.abs(minor) >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: compact ? 0 : 2,
    minimumFractionDigits: compact ? 0 : undefined,
  }).format(minor / 100);
}

export function usd(dollars: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: dollars < 10 ? 2 : 0 }).format(dollars);
}

export function num(n: number) {
  return new Intl.NumberFormat("en-US", { notation: n >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);
}

export function pct(r: number | null) {
  return r === null ? "–" : `${Math.round(r * 100)}%`;
}

export function date(ms: number | null | undefined, withTime = false) {
  if (!ms) return "–";
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: new Date(ms).getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

export function ago(ms: number | null | undefined) {
  if (!ms) return "never";
  const s = (Date.now() - ms) / 1000;
  if (s < 0) return -s < 86_400 ? `in ${Math.ceil(-s / 3600)}h` : `in ${Math.ceil(-s / 86_400)}d`;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86_400 * 30) return `${Math.floor(s / 86_400)}d ago`;
  return date(ms);
}

// ---------- data ----------
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: Record<string, unknown>,
  ) {
    super(message);
  }
}

export async function api<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(String(data.error ?? `Request failed (${res.status})`), res.status, data);
  return data as T;
}

/** GET a JSON endpoint; `reload` refetches. */
export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [tick, setTick] = useState(0);
  const [doneKey, setDoneKey] = useState<string | null>(null);
  const key = url ? `${url}#${tick}` : null;
  useEffect(() => {
    if (!url || !key) return;
    let alive = true;
    api<T>(url)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => alive && setError(e instanceof ApiError ? e : new ApiError(String(e), 0, {})))
      .finally(() => alive && setDoneKey(key));
    return () => {
      alive = false;
    };
  }, [url, key]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading: key !== null && doneKey !== key, reload };
}

// ---------- UI ----------
export function Panel({ title, subtitle, action, children, className = "" }: { title?: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl bg-white p-5 ring-1 ring-neutral-950/5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-lg font-semibold">{title}</h2>}
            {subtitle && <p className="text-sm text-neutral-500">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Tile({ label, value, sub, delta, upIsGood = true }: { label: string; value: string; sub?: string; delta?: { now: number; before: number; period: string }; upIsGood?: boolean }) {
  let deltaEl: React.ReactNode = null;
  if (delta && (delta.now || delta.before)) {
    const diff = delta.before ? (delta.now - delta.before) / delta.before : 1;
    const up = delta.now >= delta.before;
    const good = up === upIsGood;
    deltaEl = (
      <span className={`text-xs font-semibold ${delta.now === delta.before ? "text-neutral-500" : good ? "text-emerald-700" : "text-red-700"}`}>
        {up ? "▲" : "▼"} {delta.before ? `${Math.abs(Math.round(diff * 100))}%` : "new"} <span className="font-normal text-neutral-500">vs {delta.period}</span>
      </span>
    );
  }
  return (
    <div className="rounded-2xl bg-neutral-50 p-4">
      <div className="text-sm text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {(sub || deltaEl) && <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-neutral-500">{deltaEl}{sub && <span>{sub}</span>}</div>}
    </div>
  );
}

export function Btn({
  children,
  onClick,
  disabled,
  kind = "plain",
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  kind?: "primary" | "plain" | "danger";
  type?: "button" | "submit";
}) {
  const styles = {
    primary: "bg-neutral-900 text-white hover:bg-black",
    plain: "bg-white text-neutral-900 ring-1 ring-neutral-950/10 hover:bg-neutral-100",
    danger: "bg-white text-red-700 ring-1 ring-red-700/30 hover:bg-red-50",
  }[kind];
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${styles}`}>
      {children}
    </button>
  );
}

export const STATUS_STYLE: Record<string, { label: string; cls: string; icon: string }> = {
  no_trial: { label: "No trial", cls: "bg-neutral-100 text-neutral-600", icon: "○" },
  trialing: { label: "On trial", cls: "bg-sky-100 text-sky-900", icon: "◔" },
  trial_cancelled: { label: "Trial, cancelled", cls: "bg-amber-100 text-amber-900", icon: "◌" },
  paying: { label: "Paying", cls: "bg-emerald-100 text-emerald-900", icon: "●" },
  cancelling: { label: "Cancelling", cls: "bg-amber-100 text-amber-900", icon: "◐" },
  payment_failed: { label: "Payment failed", cls: "bg-red-100 text-red-900", icon: "!" },
  expired: { label: "Trial ended", cls: "bg-neutral-200 text-neutral-700", icon: "×" },
};

export function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { label: status, cls: "bg-neutral-100 text-neutral-700", icon: "•" };
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>
      <span aria-hidden>{s.icon}</span>
      {s.label}
    </span>
  );
}

export function Notice({ kind = "info", children }: { kind?: "info" | "error" | "ok"; children: React.ReactNode }) {
  const cls = { info: "bg-neutral-100 text-neutral-800", error: "bg-red-50 text-red-800 ring-1 ring-red-700/20", ok: "bg-emerald-50 text-emerald-900" }[kind];
  return <div className={`rounded-2xl px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

// ---------- column chart (one series) ----------
function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

export function Columns({
  data,
  format,
  label,
  height = 160,
}: {
  data: { date: string; value: number }[];
  format: (v: number) => string;
  label: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = height;
  const left = 44;
  const bottom = 20;
  const top = 8;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const slot = (W - left) / Math.max(1, data.length);
  const bw = Math.min(24, Math.max(3, slot - 2));
  const y = (v: number) => top + (H - top - bottom) * (1 - v / max);
  const empty = data.every((d) => !d.value);
  // Drop ticks whose labels would repeat (e.g. tiny ranges), and show only the baseline when empty.
  const ticks = empty ? [0] : [0, max / 2, max].filter((t) => !Number.isInteger(t) && data.every((d) => Number.isInteger(d.value)) ? false : true).filter((t, i, all) => all.findIndex((u) => format(u) === format(t)) === i);
  const total = data.reduce((a, d) => a + d.value, 0);
  const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <figure className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`${label}, last ${data.length} days, total ${format(total)}`} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W} y1={y(t)} y2={y(t)} stroke="#e5e5e5" strokeWidth={1} />
            <text x={left - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#737373">
              {format(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = left + i * slot + (slot - bw) / 2;
          const h = Math.max(0, y(0) - y(d.value));
          const r = Math.min(4, h, bw / 2);
          const path = h > 0 ? `M${x},${y(0)} V${y(0) - h + r} Q${x},${y(0) - h} ${x + r},${y(0) - h} H${x + bw - r} Q${x + bw},${y(0) - h} ${x + bw},${y(0) - h + r} V${y(0)} Z` : "";
          return (
            <g key={d.date}>
              {path && <path d={path} fill={hover === null || hover === i ? "#171717" : "#a3a3a3"} />}
              <rect x={left + i * slot} y={top} width={slot} height={H - top - bottom} fill="transparent" onMouseEnter={() => setHover(i)} />
            </g>
          );
        })}
        {[0, Math.floor(data.length / 2), data.length - 1].map((i) =>
          data[i] ? (
            <text
              key={i}
              x={i === 0 ? left : i === data.length - 1 ? W : left + i * slot + slot / 2}
              y={H - 4}
              textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
              fontSize={11}
              fill="#737373"
            >
              {shortDate(data[i].date)}
            </text>
          ) : null,
        )}
        {empty && (
          <text x={(left + W) / 2} y={(top + H - bottom) / 2} textAnchor="middle" fontSize={13} fill="#a3a3a3">
            No data yet
          </text>
        )}
      </svg>
      {hover !== null && data[hover] && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-xl bg-neutral-900 px-3 py-2 text-xs text-white shadow-lg"
          style={{ left: `${((left + hover * slot + slot / 2) / W) * 100}%` }}
        >
          <div className="text-neutral-300">{shortDate(data[hover].date)}</div>
          <div className="font-semibold">{format(data[hover].value)}</div>
        </div>
      )}
      <details className="mt-2 text-xs text-neutral-500">
        <summary className="cursor-pointer">View as table</summary>
        <table className="mt-2 w-full">
          <tbody>
            {data.map((d) => (
              <tr key={d.date} className="border-t border-neutral-100">
                <td className="py-1">{d.date}</td>
                <td className="py-1 text-right tabular-nums">{format(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
