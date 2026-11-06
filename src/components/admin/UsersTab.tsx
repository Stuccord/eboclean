"use client";

import { useMemo, useState } from "react";
import { ago, api, Btn, date, money, Notice, Panel, StatusPill, STATUS_STYLE, usd, useApi } from "./shared";
import { EVENT_LABEL, eventLine } from "./OtherTabs";

interface UserRow {
  id: string;
  email: string;
  status: string;
  createdAt: number | null;
  lastActiveAt: number | null;
  trialEndsAt: number | null;
  plan: string | null;
  nextPaymentAt: number | null;
  aiToday: number;
  scans30: number;
  aiCost30: number;
  paid12m: number;
  emailOptOut: boolean;
}

type SortKey = "createdAt" | "lastActiveAt" | "scans30" | "paid12m" | "aiCost30";

export function UsersTab({ currency, openId, setOpenId, onChanged }: { currency: string; openId: string | null; setOpenId: (id: string | null) => void; onChanged: () => void }) {
  const { data, error, loading, reload } = useApi<{ users: UserRow[]; paystackError: string | null }>("/api/admin/users");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<SortKey>("createdAt");

  const rows = useMemo(() => {
    const list = (data?.users ?? []).filter((u) => (status === "all" || u.status === status) && u.email.toLowerCase().includes(q.trim().toLowerCase()));
    return [...list].sort((a, b) => (Number(b[sort]) || 0) - (Number(a[sort]) || 0));
  }, [data, q, status, sort]);

  function exportCsv() {
    const head = ["email", "status", "joined", "last_active", "trial_ends", "plan", "next_payment", "scans_30d", "ai_cost_30d_usd", "paid_12m", "unsubscribed"];
    const iso = (ms: number | null) => (ms ? new Date(ms).toISOString() : "");
    const lines = rows.map((u) =>
      [u.email, u.status, iso(u.createdAt), iso(u.lastActiveAt), iso(u.trialEndsAt), u.plan ?? "", iso(u.nextPaymentAt), u.scans30, u.aiCost30.toFixed(4), (u.paid12m / 100).toFixed(2), u.emailOptOut]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `eboclean-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <Panel
        title="Users"
        subtitle={data ? `${rows.length} of ${data.users.length}` : undefined}
        action={
          <div className="flex gap-2">
            <Btn onClick={exportCsv} disabled={!rows.length}>
              Export CSV
            </Btn>
            <Btn onClick={reload} disabled={loading}>
              Refresh
            </Btn>
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search email"
            aria-label="Search users by email"
            className="min-w-48 flex-1 rounded-full bg-neutral-100 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status" className="rounded-full bg-neutral-100 px-4 py-2 text-sm">
            <option value="all">All statuses</option>
            {Object.entries(STATUS_STYLE).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort" className="rounded-full bg-neutral-100 px-4 py-2 text-sm">
            <option value="createdAt">Newest</option>
            <option value="lastActiveAt">Recently active</option>
            <option value="scans30">Most scans (30d)</option>
            <option value="aiCost30">Highest AI cost (30d)</option>
            <option value="paid12m">Paid the most</option>
          </select>
        </div>
        {error && <Notice kind="error">{error.message}</Notice>}
        {data?.paystackError && <Notice kind="error">Paystack: {data.paystackError}. Subscription statuses may be wrong.</Notice>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-xs text-neutral-500">
              <tr>
                <th className="py-2 font-medium">Email</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">Joined</th>
                <th className="py-2 font-medium">Last active</th>
                <th className="py-2 font-medium">Next charge</th>
                <th className="py-2 text-right font-medium">Scans 30d</th>
                <th className="py-2 text-right font-medium">AI cost 30d</th>
                <th className="py-2 text-right font-medium">Paid 12m</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} onClick={() => setOpenId(u.id)} className="cursor-pointer border-t border-neutral-100 hover:bg-neutral-50">
                  <td className="max-w-64 truncate py-2.5 font-medium">
                    <button className="text-left hover:underline" onClick={() => setOpenId(u.id)}>
                      {u.email}
                    </button>
                  </td>
                  <td className="py-2.5">
                    <StatusPill status={u.status} />
                  </td>
                  <td className="py-2.5 text-neutral-600">{date(u.createdAt)}</td>
                  <td className="py-2.5 text-neutral-600">{ago(u.lastActiveAt)}</td>
                  <td className="py-2.5 text-neutral-600">{u.nextPaymentAt && u.status !== "cancelling" ? date(u.nextPaymentAt) : "–"}</td>
                  <td className="py-2.5 text-right tabular-nums">{u.scans30}</td>
                  <td className="py-2.5 text-right tabular-nums">{usd(u.aiCost30)}</td>
                  <td className="py-2.5 text-right tabular-nums">{money(u.paid12m, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && rows.length === 0 && <p className="py-6 text-center text-sm text-neutral-500">No users match.</p>}
        </div>
      </Panel>
      {openId && (
        <UserPanel
          id={openId}
          currency={currency}
          onClose={() => setOpenId(null)}
          onChanged={() => {
            reload();
            onChanged();
          }}
        />
      )}
    </>
  );
}

interface Detail {
  profile: UserRow & { trialUsed: boolean; aiDay: string | null; aiCount: number; paystackCustomerId: number | null; emailOptOut?: boolean };
  status: string;
  subscriptions: { id: number; status: string; amount: number; next_payment_date: string | null; plan?: { name?: string; interval?: string } }[];
  transactions: { id: number; reference: string; amount: number; currency: string; status: string; paid_at: string | null; created_at?: string; cardCheck: boolean }[];
  paystackError: string | null;
  events: { id?: string; at: number; type: string; amount: number | null; currency: string | null; meta: Record<string, unknown> | null }[];
  home: { rooms: number; history: number; updatedAt: number } | null;
}

function UserPanel({ id, currency, onClose, onChanged }: { id: string; currency: string; onClose: () => void; onChanged: () => void }) {
  const { data, error, reload } = useApi<Detail>(`/api/admin/users/${id}`);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [days, setDays] = useState(7);
  const [mail, setMail] = useState({ subject: "", body: "" });
  const [confirmDelete, setConfirmDelete] = useState("");

  async function act(body: Record<string, unknown>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ message: string; deleted?: boolean }>(`/api/admin/users/${id}`, body);
      setMsg({ kind: "ok", text: r.message });
      onChanged();
      if (r.deleted) onClose();
      else reload();
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Failed" });
    } finally {
      setBusy(false);
    }
  }

  const p = data?.profile;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="User details"
        className="h-full w-full max-w-xl overflow-y-auto bg-[#f7f7f8] p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="truncate text-xl font-bold">{p?.email ?? "Loading…"}</h2>
          <Btn onClick={onClose}>Close</Btn>
        </div>
        {error && <Notice kind="error">{error.message}</Notice>}
        {msg && (
          <div className="mb-3">
            <Notice kind={msg.kind}>{msg.text}</Notice>
          </div>
        )}
        {data && p && (
          <div className="space-y-4">
            <Panel>
              <div className="mb-3">
                <StatusPill status={data.status} />
                {p.emailOptOut && <span className="ml-2 text-xs text-neutral-500">Unsubscribed from announcements</span>}
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <Field k="Joined" v={date(p.createdAt, true)} />
                <Field k="Last synced" v={ago(p.lastActiveAt)} />
                <Field k="Trial ends" v={p.trialEndsAt ? date(p.trialEndsAt, true) : p.trialUsed ? "Used" : "Not started"} />
                <Field k="Scans today" v={String(p.aiDay === new Date().toISOString().slice(0, 10) ? p.aiCount : 0)} />
                <Field k="Rooms saved" v={data.home ? String(data.home.rooms) : "–"} />
                <Field k="Cleaning sessions" v={data.home ? String(data.home.history) : "–"} />
                <Field k="Paystack customer" v={p.paystackCustomerId === -1 ? "Demo (simulated)" : p.paystackCustomerId ? String(p.paystackCustomerId) : "–"} />
                <Field k="User ID" v={p.id} mono />
              </dl>
            </Panel>

            <Panel title="Subscription & payments">
              {data.paystackError && <Notice kind="error">Paystack: {data.paystackError}</Notice>}
              {data.subscriptions.length === 0 ? (
                <p className="text-sm text-neutral-500">No Paystack subscription.</p>
              ) : (
                <ul className="mb-3 space-y-1 text-sm">
                  {data.subscriptions.map((s) => (
                    <li key={s.id} className="flex justify-between gap-2">
                      <span>
                        {s.plan?.name ?? "Plan"} · <b>{s.status}</b>
                      </span>
                      <span className="text-neutral-600">
                        {money(s.amount, currency)} · next {s.next_payment_date ? date(Date.parse(s.next_payment_date)) : "–"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {data.transactions.length > 0 && (
                <table className="w-full text-sm">
                  <tbody>
                    {data.transactions.map((t) => (
                      <tr key={t.id} className="border-t border-neutral-100">
                        <td className="py-1.5 text-neutral-600">{date(Date.parse(t.paid_at ?? t.created_at ?? ""))}</td>
                        <td className="py-1.5">{t.cardCheck ? "Trial card check" : "Payment"}</td>
                        <td className="py-1.5">{t.status}</td>
                        <td className="py-1.5 text-right tabular-nums">{money(t.amount, t.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>

            <Panel title="Actions">
              <div className="space-y-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span>Give free access for</span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={days}
                    onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
                    aria-label="Days of free access"
                    className="w-20 rounded-full bg-neutral-100 px-3 py-1.5"
                  />
                  <span>days</span>
                  <Btn disabled={busy} onClick={() => act({ action: "give_days", days })}>
                    Give
                  </Btn>
                </div>
                <p className="-mt-2 text-xs text-neutral-500">Doesn&apos;t move their Paystack charge date. To stop a charge, cancel the subscription.</p>
                <div className="flex flex-wrap gap-2">
                  <Btn disabled={busy} onClick={() => act({ action: "reset_daily_limit" })}>
                    Reset today&apos;s scan limit
                  </Btn>
                  <Btn disabled={busy || !(data.status === "trialing" || data.status === "trial_cancelled")} onClick={() => act({ action: "end_access" }, "End their free access now?")}>
                    End free access
                  </Btn>
                  <Btn kind="danger" disabled={busy} onClick={() => act({ action: "cancel_subscription" }, "Cancel their subscription? They won't be charged again.")}>
                    Cancel subscription
                  </Btn>
                </div>
                <div className="space-y-2 border-t border-neutral-100 pt-4">
                  <div className="font-semibold">Email this user</div>
                  <input
                    value={mail.subject}
                    onChange={(e) => setMail({ ...mail, subject: e.target.value })}
                    placeholder="Subject"
                    aria-label="Email subject"
                    className="w-full rounded-2xl bg-neutral-100 px-4 py-2"
                  />
                  <textarea
                    value={mail.body}
                    onChange={(e) => setMail({ ...mail, body: e.target.value })}
                    placeholder="Message"
                    aria-label="Email message"
                    rows={4}
                    className="w-full rounded-2xl bg-neutral-100 px-4 py-2"
                  />
                  <Btn kind="primary" disabled={busy || !mail.subject.trim() || !mail.body.trim()} onClick={() => act({ action: "email", ...mail })}>
                    Send email
                  </Btn>
                </div>
                <div className="space-y-2 border-t border-neutral-100 pt-4">
                  <div className="font-semibold text-red-700">Delete account</div>
                  <p className="text-neutral-600">Cancels their subscription and permanently deletes their account, data and photos. Type DELETE to confirm.</p>
                  <div className="flex gap-2">
                    <input value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} aria-label="Type DELETE" className="w-32 rounded-full bg-neutral-100 px-3 py-1.5" />
                    <Btn kind="danger" disabled={busy || confirmDelete !== "DELETE"} onClick={() => act({ action: "delete_account", confirm: "DELETE" })}>
                      Delete forever
                    </Btn>
                  </div>
                </div>
              </div>
            </Panel>

            <Panel title="Timeline" subtitle="Everything this user did, newest first.">
              {data.events.length === 0 ? (
                <p className="text-sm text-neutral-500">No activity recorded yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {data.events.map((e, i) => (
                    <li key={e.id ?? i} className="flex gap-3">
                      <span className="w-28 shrink-0 text-neutral-500">{date(e.at, true)}</span>
                      <span>
                        <b>{EVENT_LABEL[e.type] ?? e.type}</b> <span className="text-neutral-600">{eventLine(e)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        )}
      </aside>
    </div>
  );
}

function Field({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-neutral-500">{k}</dt>
      <dd className={`truncate ${mono ? "font-mono text-xs" : ""}`}>{v}</dd>
    </div>
  );
}
