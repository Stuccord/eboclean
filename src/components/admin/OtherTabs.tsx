"use client";

import { useMemo, useState } from "react";
import { api, Btn, date, money, Notice, Panel, Tile, usd, useApi } from "./shared";

// ---------- event wording (shared with the user timeline) ----------
export const EVENT_LABEL: Record<string, string> = {
  "user.signup": "Signed up",
  "user.sign_in": "Signed in",
  "user.deleted": "Deleted their account",
  "checkout.trial": "Opened trial checkout",
  "checkout.subscribe": "Opened subscribe checkout",
  "trial.started": "Started free trial",
  "trial.card_not_reusable": "Card couldn't be saved",
  "refund.failed": "Automatic refund failed",
  "ai.scan": "Scanned a room",
  "ai.setup": "Set up a room",
  "ai.blocked": "Scan blocked",
  "ai.error": "AI error",
  "ai.rejected": "Photo rejected",
  "paystack.charge.success": "Payment succeeded",
  "paystack.subscription.create": "Subscription created",
  "paystack.subscription.disable": "Subscription ended",
  "paystack.subscription.not_renew": "Cancelled (won't renew)",
  "paystack.subscription.expiring_cards": "Card expiring soon",
  "paystack.invoice.create": "Invoice created",
  "paystack.invoice.update": "Invoice updated",
  "paystack.invoice.payment_failed": "Payment failed",
  "paystack.refund.processed": "Refund processed",
  "paystack.refund.failed": "Refund failed",
  "paystack.charge.dispute.create": "Dispute opened",
  "email.broadcast": "Group email sent",
  "email.direct": "Email sent",
  "email.trial_reminder": "Trial reminder sent",
  "email.unsubscribed": "Unsubscribed from emails",
  "admin.action": "Admin action",
  "waitlist.join": "Joined the waitlist",
  "waitlist.spot": "Answered messiest spot",
  "waitlist.unsubscribed": "Unsubscribed from waitlist emails",
  "checkout.earlybird": "Opened early-bird checkout",
  "earlybird.purchased": "Bought the early-bird year",
  "earlybird.failed": "Early-bird purchase failed",
  "earlybird.card_not_reusable": "Early-bird card couldn't be saved",
};

type Ev = { id?: string; at: number; type: string; userId?: string | null; email?: string | null; amount: number | null; currency: string | null; meta: Record<string, unknown> | null };

export function eventLine(e: Ev) {
  const m = e.meta ?? {};
  const bits: string[] = [];
  if (e.amount != null && e.currency) bits.push(money(e.amount, e.currency));
  if (typeof m.mode === "string") bits.push(m.mode === "before" ? "before photo" : "after photo");
  if (typeof m.costUsd === "number" && m.costUsd > 0) bits.push(usd(m.costUsd));
  if (m.demo) bits.push("demo");
  if (typeof m.reason === "string") bits.push({ paywall: "no trial or plan", daily: "daily limit", busy: "too many, too fast" }[m.reason] ?? m.reason);
  if (typeof m.plan === "string") bits.push(m.plan);
  if (typeof m.action === "string") bits.push(`${m.action.replace(/_/g, " ")}${m.by ? ` by ${m.by}` : ""}`);
  if (typeof m.subject === "string") bits.push(`“${m.subject}”`);
  if (typeof m.sent === "number") bits.push(`${m.sent} sent`);
  if (typeof m.error === "string" && m.error) bits.push(m.error);
  return bits.join(" · ");
}

// ---------- payments ----------
interface Tx {
  id: number;
  reference: string;
  at: number;
  amount: number;
  currency: string;
  status: string;
  fees: number;
  email: string;
  userId: string | null;
  kind: string;
  channel: string;
  message: string;
  refunded: number;
}

export function PaymentsTab({ openUser }: { openUser: (id: string) => void }) {
  const { data, error, loading, reload } = useApi<{
    transactions: Tx[];
    refunds: { id: number; at: number; amount: number; currency: string; status: string; transactionId?: number; reference: string }[];
    demo: boolean;
    paystackError: string | null;
  }>("/api/admin/payments");
  const [filter, setFilter] = useState<"all" | "success" | "failed" | "checks">("success");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const txs = useMemo(
    () =>
      (data?.transactions ?? []).filter((t) =>
        filter === "all" ? true : filter === "checks" ? t.kind === "Trial card check" : filter === "success" ? t.status === "success" && t.kind !== "Trial card check" : t.status !== "success",
      ),
    [data, filter],
  );

  async function refund(t: Tx) {
    if (!window.confirm(`Refund ${money(t.amount - t.refunded, t.currency)} to ${t.email}? This sends money back to their card.`)) return;
    try {
      const r = await api<{ message: string }>("/api/admin/payments", { action: "refund", transactionId: t.id });
      setMsg({ kind: "ok", text: r.message });
      reload();
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Refund failed" });
    }
  }

  const all = data?.transactions ?? [];
  const success = all.filter((t) => t.status === "success" && t.kind !== "Trial card check");
  const cur = all[0]?.currency ?? "USD";

  return (
    <>
      {data?.demo && <Notice>Payments are simulated (no Paystack key). Real payments will show here once PAYSTACK_SECRET_KEY is set.</Notice>}
      {data?.paystackError && <Notice kind="error">Paystack: {data.paystackError}</Notice>}
      {error && <Notice kind="error">{error.message}</Notice>}
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Money in, 12 months" value={money(success.reduce((a, t) => a + t.amount, 0), cur)} sub={`${success.length} payments`} />
        <Tile label="Paystack fees" value={money(success.reduce((a, t) => a + t.fees, 0), cur)} />
        <Tile label="Money out (refunds)" value={money((data?.refunds ?? []).filter((r) => r.status !== "failed").reduce((a, r) => a + r.amount, 0), cur)} sub={`${data?.refunds.length ?? 0} refunds`} />
        <Tile label="Failed attempts" value={String(all.filter((t) => t.status === "failed").length)} />
      </div>
      <Panel
        title="Payments"
        subtitle="From Paystack, last 12 months."
        action={
          <Btn onClick={reload} disabled={loading}>
            Refresh
          </Btn>
        }
      >
        <div className="mb-3 flex flex-wrap gap-1">
          {(
            [
              ["success", "Paid"],
              ["failed", "Failed / abandoned"],
              ["checks", "Trial card checks"],
              ["all", "All"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-3 py-1 text-sm font-semibold ${filter === k ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700"}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs text-neutral-500">
              <tr>
                <th className="py-2 font-medium">Date</th>
                <th className="py-2 font-medium">Customer</th>
                <th className="py-2 font-medium">Type</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 text-right font-medium">Amount</th>
                <th className="py-2 text-right font-medium">Fee</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {txs.map((t) => (
                <tr key={t.id} className="border-t border-neutral-100">
                  <td className="py-2 text-neutral-600">{date(t.at, true)}</td>
                  <td className="max-w-56 truncate py-2">
                    {t.userId ? (
                      <button className="hover:underline" onClick={() => openUser(t.userId!)}>
                        {t.email}
                      </button>
                    ) : (
                      t.email
                    )}
                  </td>
                  <td className="py-2">{t.kind}</td>
                  <td className="py-2" title={t.message}>
                    {t.status}
                    {t.refunded > 0 && <span className="ml-1 text-xs text-neutral-500">(refunded {money(t.refunded, t.currency)})</span>}
                  </td>
                  <td className="py-2 text-right tabular-nums">{money(t.amount, t.currency)}</td>
                  <td className="py-2 text-right tabular-nums text-neutral-500">{money(t.fees, t.currency)}</td>
                  <td className="py-2 text-right">
                    {t.status === "success" && t.refunded < t.amount && (
                      <button className="text-xs font-semibold text-red-700 hover:underline" onClick={() => refund(t)}>
                        Refund
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && txs.length === 0 && <p className="py-6 text-center text-sm text-neutral-500">Nothing here yet.</p>}
        </div>
      </Panel>
    </>
  );
}

// ---------- emails ----------
export function EmailTab() {
  const { data, error, reload } = useApi<{
    configured: boolean;
    from: string | null;
    me: string;
    segments: { id: string; label: string; count: number; optedOut: number }[];
    history: Ev[];
  }>("/api/admin/email");
  const [form, setForm] = useState({ segment: "all", subject: "", body: "", kind: "announcement" as "announcement" | "billing" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const seg = data?.segments.find((s) => s.id === form.segment);
  const recipients = seg ? (form.kind === "billing" ? seg.count : seg.count - seg.optedOut) : 0;

  async function send(test: boolean) {
    if (!test && !window.confirm(`Send "${form.subject}" to ${recipients} ${recipients === 1 ? "person" : "people"}?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ message: string }>("/api/admin/email", { ...form, test });
      setMsg({ kind: "ok", text: r.message });
      if (!test) reload();
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Couldn't send" });
    } finally {
      setBusy(false);
    }
  }

  async function runReminders() {
    setBusy(true);
    try {
      const r = await api<{ due?: number; sent?: number; error?: string }>("/api/cron/trial-reminders");
      setMsg(r.error ? { kind: "error", text: r.error } : { kind: "ok", text: `Trial reminders: ${r.sent ?? 0} sent of ${r.due ?? 0} due.` });
      reload();
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && <Notice kind="error">{error.message}</Notice>}
      {data && !data.configured && (
        <Notice kind="error">
          Email isn&apos;t set up. Create a free account at resend.com, verify your domain, then add <code>RESEND_API_KEY</code> and <code>EMAIL_FROM</code> (for example
          &quot;Eboclean &lt;hello@yourdomain.com&gt;&quot;) in Vercel.
        </Notice>
      )}
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Panel title="Email users" subtitle={data?.from ? `From ${data.from}` : undefined}>
          <div className="space-y-3 text-sm">
            <label className="block">
              <span className="mb-1 block text-neutral-600">Send to</span>
              <select value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })} className="w-full rounded-2xl bg-neutral-100 px-4 py-2">
                {data?.segments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} ({s.count})
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="flex flex-wrap gap-4">
              <legend className="sr-only">Email type</legend>
              <label className="flex items-center gap-2">
                <input type="radio" checked={form.kind === "announcement"} onChange={() => setForm({ ...form, kind: "announcement" })} />
                Announcement (skips unsubscribed)
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={form.kind === "billing"} onChange={() => setForm({ ...form, kind: "billing" })} />
                Account / billing notice
              </label>
            </fieldset>
            <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Subject" aria-label="Subject" className="w-full rounded-2xl bg-neutral-100 px-4 py-2" />
            <textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder={"Hi there,\n\nWrite your message. Leave a blank line between paragraphs."}
              aria-label="Message"
              rows={9}
              className="w-full rounded-2xl bg-neutral-100 px-4 py-2"
            />
            <p className="text-xs text-neutral-500">
              Will go to {recipients} {recipients === 1 ? "person" : "people"}
              {seg && form.kind === "announcement" && seg.optedOut ? ` (${seg.optedOut} unsubscribed are skipped)` : ""}. Announcements include an unsubscribe link. Use
              billing notices only for account or payment information.
            </p>
            <div className="flex gap-2">
              <Btn disabled={busy || !data?.configured || !form.subject.trim() || !form.body.trim()} onClick={() => send(true)}>
                Send test to me
              </Btn>
              <Btn kind="primary" disabled={busy || !data?.configured || !form.subject.trim() || !form.body.trim() || !recipients} onClick={() => send(false)}>
                Send to {recipients}
              </Btn>
            </div>
          </div>
        </Panel>
        <Panel title="Automatic emails">
          <p className="text-sm text-neutral-600">
            Every day at 09:00 UTC, people whose trial ends within the next 36 hours (day 2 of the 3-day trial) get a reminder that their card will be charged and how to cancel. This cuts surprise charges and
            chargebacks.
          </p>
          <div className="mt-3">
            <Btn disabled={busy || !data?.configured} onClick={runReminders}>
              Run trial reminders now
            </Btn>
          </div>
        </Panel>
      </div>
      <Panel title="Sent emails">
        {!data?.history.length ? (
          <p className="text-sm text-neutral-500">Nothing sent yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {data.history.map((e, i) => (
              <li key={e.id ?? i} className="flex gap-3">
                <span className="w-32 shrink-0 text-neutral-500">{date(e.at, true)}</span>
                <span>
                  <b>{EVENT_LABEL[e.type] ?? e.type}</b> {e.email && <span className="text-neutral-600">{e.email} · </span>}
                  <span className="text-neutral-600">{eventLine(e)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

// ---------- activity ----------
const FILTERS = [
  ["", "Everything"],
  ["user.", "Accounts"],
  ["trial.", "Trials"],
  ["checkout.", "Checkouts"],
  ["waitlist.", "Waitlist"],
  ["earlybird.", "Early bird"],
  ["paystack.", "Paystack"],
  ["ai.", "AI"],
  ["email.", "Emails"],
  ["admin.", "Admin"],
  ["refund.", "Refund problems"],
] as const;

export function ActivityTab({ openUser }: { openUser: (id: string) => void }) {
  const [type, setType] = useState("");
  const { data, error, loading, reload } = useApi<{ events: Ev[] }>(`/api/admin/activity?type=${encodeURIComponent(type)}&limit=500`);
  return (
    <Panel
      title="Activity"
      subtitle="Everything happening in the app, newest first."
      action={
        <Btn onClick={reload} disabled={loading}>
          Refresh
        </Btn>
      }
    >
      <div className="mb-3 flex flex-wrap gap-1">
        {FILTERS.map(([k, l]) => (
          <button key={k} onClick={() => setType(k)} className={`rounded-full px-3 py-1 text-sm font-semibold ${type === k ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700"}`}>
            {l}
          </button>
        ))}
      </div>
      {error && <Notice kind="error">{error.message}</Notice>}
      <ul className="divide-y divide-neutral-100 text-sm">
        {data?.events.map((e, i) => (
          <li key={e.id ?? i} className="flex flex-wrap gap-x-3 py-2">
            <span className="w-32 shrink-0 text-neutral-500">{date(e.at, true)}</span>
            <span className="font-semibold">{EVENT_LABEL[e.type] ?? e.type}</span>
            {e.email &&
              (e.userId ? (
                <button className="text-neutral-700 hover:underline" onClick={() => openUser(e.userId!)}>
                  {e.email}
                </button>
              ) : (
                <span className="text-neutral-700">{e.email}</span>
              ))}
            <span className="text-neutral-500">{eventLine(e)}</span>
          </li>
        ))}
      </ul>
      {data && data.events.length === 0 && <p className="py-6 text-center text-sm text-neutral-500">Nothing yet.</p>}
    </Panel>
  );
}
