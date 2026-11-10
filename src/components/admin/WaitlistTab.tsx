"use client";

import { useMemo, useState } from "react";
import { api, Btn, date, Notice, num, Panel, StatusPill, Tile, useApi } from "./shared";

// Who joined the waitlist, and whether each early member got the early-bird price they were promised.

type Perk = "claimed" | "offered" | "problem" | "missed" | "no_account" | "not_eligible";

interface Row {
  position: number;
  email: string;
  joinedAt: number;
  spot: string | null;
  ref: string | null;
  unsubscribed: boolean;
  eligible: boolean;
  perk: Perk;
  claimedAt: number | null;
  userId: string | null;
  userStatus: string | null;
  canRestore: boolean;
}

interface Data {
  enabled: boolean;
  spots: number;
  total: number;
  eligible: number;
  counts: Record<Perk, number>;
  rows: Row[];
  paystackError: string | null;
}

const PERK: Record<Perk, { label: string; cls: string; icon: string }> = {
  claimed: { label: "Got it", cls: "bg-emerald-100 text-emerald-900", icon: "●" },
  offered: { label: "Offer ready", cls: "bg-sky-100 text-sky-900", icon: "◔" },
  problem: { label: "Purchase failed", cls: "bg-red-100 text-red-900", icon: "!" },
  missed: { label: "Missed it", cls: "bg-amber-100 text-amber-900", icon: "▲" },
  no_account: { label: "Not signed up yet", cls: "bg-neutral-100 text-neutral-600", icon: "○" },
  not_eligible: { label: "After early spots", cls: "bg-neutral-200 text-neutral-700", icon: "×" },
};

const FILTERS: [Perk | "all" | "attention", string][] = [
  ["all", "Everyone"],
  ["attention", "Needs attention"],
  ["claimed", "Got it"],
  ["offered", "Offer ready"],
  ["no_account", "Not signed up yet"],
  ["not_eligible", "After early spots"],
];

export function WaitlistTab({ openUser, onChanged }: { openUser: (id: string) => void; onChanged: () => void }) {
  const { data, error, loading, reload } = useApi<Data>("/api/admin/waitlist?format=perks");
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const rows = useMemo(
    () =>
      (data?.rows ?? []).filter(
        (r) =>
          (filter === "all" || (filter === "attention" ? r.perk === "missed" || r.perk === "problem" : r.perk === filter)) &&
          r.email.includes(q.trim().toLowerCase()),
      ),
    [data, filter, q],
  );

  async function restore(r: Row) {
    if (!r.userId) return;
    if (!window.confirm(`Give the early-bird offer back to ${r.email}? They will also be able to start the free trial again.`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await api<{ message: string }>("/api/admin/waitlist", { action: "restore_offer", userId: r.userId });
      setMsg({ kind: "ok", text: res.message });
      reload();
      onChanged();
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Failed" });
    } finally {
      setBusy(false);
    }
  }

  const c = data?.counts;
  const owed = data && c ? data.eligible - c.claimed : 0;

  return (
    <>
      {error && <Notice kind="error">{error.message}</Notice>}
      {data?.paystackError && <Notice kind="error">Paystack: {data.paystackError}. Some statuses may be wrong.</Notice>}
      {data && !data.enabled && owed > 0 && (
        <Notice kind="error">
          The early-bird offer is switched off, so nobody on the waitlist can get their price yet. Set <code>EARLY_BIRD_ENABLED=1</code> in Vercel and redeploy before you invite them.
        </Notice>
      )}
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

      <Panel title="Early-bird price" subtitle={data ? `The first ${num(data.spots)} people on the waitlist get it when they sign in with the same email.` : undefined}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Tile label="On the waitlist" value={num(data?.total ?? 0)} sub={data ? `${num(data.eligible)} in the early spots` : undefined} />
          <Tile label="Got their price" value={num(c?.claimed ?? 0)} sub={data?.eligible ? `${Math.round(((c?.claimed ?? 0) / data.eligible) * 100)}% of early spots` : undefined} />
          <Tile label="Offer ready" value={num(c?.offered ?? 0)} sub="signed up, not bought yet" />
          <Tile label="Not signed up yet" value={num(c?.no_account ?? 0)} sub="invite them by email" />
          <Tile label="Needs attention" value={num((c?.missed ?? 0) + (c?.problem ?? 0))} sub={`${c?.missed ?? 0} missed · ${c?.problem ?? 0} failed`} />
        </div>
      </Panel>

      <Panel
        title="Waitlist"
        subtitle={data ? `${rows.length} of ${data.total}` : undefined}
        action={
          <div className="flex gap-2">
            <a href="/api/admin/waitlist" className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-950/10 transition hover:bg-neutral-100">
              Export CSV
            </a>
            <Btn onClick={reload} disabled={loading}>
              Refresh
            </Btn>
          </div>
        }
      >
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search email"
            aria-label="Search the waitlist by email"
            className="min-w-48 flex-1 rounded-full bg-neutral-100 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
          />
        </div>
        <div className="mb-3 flex flex-wrap gap-1">
          {FILTERS.map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-3 py-1 text-sm font-semibold ${filter === k ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700"}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-xs text-neutral-500">
              <tr>
                <th className="py-2 font-medium">#</th>
                <th className="py-2 font-medium">Email</th>
                <th className="py-2 font-medium">Joined</th>
                <th className="py-2 font-medium">Came from</th>
                <th className="py-2 font-medium">Early-bird price</th>
                <th className="py-2 font-medium">Account</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.email} className="border-t border-neutral-100">
                  <td className="py-2.5 tabular-nums text-neutral-500">{r.position}</td>
                  <td className="max-w-64 truncate py-2.5 font-medium">
                    {r.userId ? (
                      <button className="text-left hover:underline" onClick={() => openUser(r.userId!)}>
                        {r.email}
                      </button>
                    ) : (
                      r.email
                    )}
                    {r.unsubscribed && <span className="ml-2 text-xs font-normal text-neutral-500">unsubscribed</span>}
                  </td>
                  <td className="py-2.5 text-neutral-600">{date(r.joinedAt)}</td>
                  <td className="py-2.5 text-neutral-600">{r.ref ?? "–"}</td>
                  <td className="py-2.5">
                    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${PERK[r.perk].cls}`}>
                      <span aria-hidden>{PERK[r.perk].icon}</span>
                      {PERK[r.perk].label}
                    </span>
                    {r.claimedAt && <span className="ml-2 text-xs text-neutral-500">{date(r.claimedAt)}</span>}
                    {r.perk === "offered" && data && !data.enabled && <span className="ml-2 text-xs text-red-700">offer is off</span>}
                  </td>
                  <td className="py-2.5">{r.userStatus ? <StatusPill status={r.userStatus} /> : <span className="text-neutral-400">–</span>}</td>
                  <td className="py-2.5 text-right">
                    {r.canRestore && (
                      <button className="text-xs font-semibold text-neutral-900 underline disabled:opacity-50" disabled={busy} onClick={() => restore(r)}>
                        Give offer back
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && rows.length === 0 && <p className="py-6 text-center text-sm text-neutral-500">Nobody here.</p>}
        </div>
        <p className="mt-4 text-xs text-neutral-500">
          <b>Missed it</b> means they have an account but used the free trial or paid full price, so the app no longer shows them the offer. &quot;Give offer back&quot; works once they have no trial or plan
          running. Someone who signed up with a different email than the one on the waitlist shows as &quot;Not signed up yet&quot;. To invite people, use Emails → Waitlist (early access).
        </p>
      </Panel>
    </>
  );
}
