"use client";

import { useState } from "react";
import { AuthSheet } from "@/components/Account";
import { LogoMark } from "@/components/Logo";
import { Btn, Columns, date, money, Notice, num, Panel, pct, StatusPill, STATUS_STYLE, Tile, usd, useApi } from "./shared";
import { UsersTab } from "./UsersTab";
import { ActivityTab, EmailTab, PaymentsTab } from "./OtherTabs";

export interface Overview {
  me: string;
  appUrl: string;
  generatedAt: number;
  users: { total: number; new1d: number; new7d: number; new30d: number; prev30d: number };
  active: { d1: number; d7: number; d30: number };
  statusCounts: Record<string, number>;
  money: {
    currency: string;
    mrr: number;
    arr: number;
    arpu: number;
    revenue1d: number;
    revenue7d: number;
    revenue30: number;
    revenuePrev30: number;
    revenue12m: number;
    fees30: number;
    refunds30: number;
    net30: number;
    profit30: number;
    failedCharges30: number;
    cardChecksHeld: number;
  };
  ai: {
    calls1d: number;
    calls7d: number;
    calls30d: number;
    cost1d: number;
    cost30d: number;
    blocked30d: Record<string, number>;
    errors1d: number;
    errors30d: number;
  };
  funnel: { signedUp: number; startedTrial: number; trialsEnded: number; converted: number; conversionRate: number | null };
  cancellations30: number;
  plans: Record<string, number>;
  upcoming: { at: number; amount: number; email: string; userId: string | null; kind: string }[];
  series: { date: string; signups: number; trials: number; revenue: number; aiCalls: number; aiCost: number; active: number }[];
  alerts: { level: "critical" | "warning" | "info"; title: string; detail: string }[];
  setup: { name: string; ok: boolean; detail: string }[];
}

const TABS = ["Overview", "Users", "Payments", "Emails", "Activity", "Setup"] as const;
type Tab = (typeof TABS)[number];

export function AdminApp() {
  const [tab, setTab] = useState<Tab>("Overview");
  const [openUser, setOpenUser] = useState<string | null>(null);
  const overview = useApi<Overview>("/api/admin/overview");
  const [signIn, setSignIn] = useState(false);

  const status = overview.error?.status;
  if (overview.loading && !overview.data) return <Centered>Loading dashboard…</Centered>;

  if (status === 401 || status === 403) {
    return (
      <Centered>
        <LogoMark size={48} />
        <h1 className="mt-4 text-2xl font-bold">Eboclean admin</h1>
        {status === 403 ? (
          <p className="mt-2 max-w-sm text-center text-neutral-600">
            {String(overview.error?.body.email ?? "This account")} isn&apos;t an admin. Add it to <code>ADMIN_EMAILS</code> in your Vercel environment variables, then redeploy.
          </p>
        ) : (
          <p className="mt-2 max-w-sm text-center text-neutral-600">Sign in with an admin email to see the dashboard.</p>
        )}
        <div className="mt-6 flex gap-2">
          {status === 403 ? (
            <Btn kind="primary" onClick={signOut}>
              Use another account
            </Btn>
          ) : (
            <Btn kind="primary" onClick={() => setSignIn(true)}>
              Sign in
            </Btn>
          )}
        </div>
        {signIn && (
          <AuthSheet
            title="Admin sign-in"
            subtitle="Enter your admin email and we'll send you a 6-digit code."
            onClose={() => setSignIn(false)}
            onSignedIn={async () => {
              setSignIn(false);
              overview.reload();
            }}
          />
        )}
      </Centered>
    );
  }

  if (!overview.data) {
    return (
      <Centered>
        <Notice kind="error">{overview.error?.message ?? "Couldn't load the dashboard."}</Notice>
        <div className="mt-4">
          <Btn onClick={overview.reload}>Try again</Btn>
        </div>
      </Centered>
    );
  }

  const o = overview.data;
  const critical = o.alerts.filter((a) => a.level === "critical").length;

  return (
    <div className="min-h-dvh bg-[#f7f7f8] text-neutral-950">
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-[#f7f7f8]/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <LogoMark size={32} />
          <div className="mr-auto">
            <div className="font-bold leading-tight">Eboclean admin</div>
            <div className="text-xs text-neutral-500">
              {o.me} · updated {date(o.generatedAt, true)}
            </div>
          </div>
          <Btn onClick={overview.reload} disabled={overview.loading}>
            {overview.loading ? "Refreshing…" : "Refresh"}
          </Btn>
          <Btn onClick={signOut}>Sign out</Btn>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              aria-current={tab === t ? "page" : undefined}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition ${tab === t ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-200/60"}`}
            >
              {t}
              {t === "Overview" && critical > 0 && <span className="ml-1.5 rounded-full bg-red-600 px-1.5 text-xs text-white">{critical}</span>}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-5">
        {tab === "Overview" && <OverviewTab o={o} openUser={(id) => { setOpenUser(id); setTab("Users"); }} />}
        {tab === "Users" && <UsersTab currency={o.money.currency} openId={openUser} setOpenId={setOpenUser} onChanged={overview.reload} />}
        {tab === "Payments" && <PaymentsTab openUser={(id) => { setOpenUser(id); setTab("Users"); }} />}
        {tab === "Emails" && <EmailTab />}
        {tab === "Activity" && <ActivityTab openUser={(id) => { setOpenUser(id); setTab("Users"); }} />}
        {tab === "Setup" && <SetupTab o={o} />}
      </main>
    </div>
  );
}

async function signOut() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.reload();
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col items-center justify-center bg-[#f7f7f8] p-6 text-neutral-950">{children}</div>;
}

const LEVEL = {
  critical: { cls: "bg-red-50 ring-red-700/20", icon: "⛔", label: "Act now" },
  warning: { cls: "bg-amber-50 ring-amber-700/20", icon: "⚠️", label: "Check" },
  info: { cls: "bg-neutral-50 ring-neutral-950/5", icon: "ℹ️", label: "FYI" },
};

function OverviewTab({ o, openUser }: { o: Overview; openUser: (id: string) => void }) {
  const c = o.money.currency;
  const m = (v: number) => money(v, c);
  const totalActiveSubs = o.statusCounts.paying + o.statusCounts.trialing + o.statusCounts.cancelling + o.statusCounts.payment_failed;

  return (
    <>
      <Panel title="Look out for" subtitle={o.alerts.length ? "Things that need your attention, most urgent first." : undefined}>
        {o.alerts.length === 0 ? (
          <Notice kind="ok">All clear. Nothing needs your attention right now.</Notice>
        ) : (
          <ul className="space-y-2">
            {[...o.alerts]
              .sort((a, b) => ["critical", "warning", "info"].indexOf(a.level) - ["critical", "warning", "info"].indexOf(b.level))
              .map((a, i) => (
                <li key={i} className={`flex gap-3 rounded-2xl p-3 ring-1 ${LEVEL[a.level].cls}`}>
                  <span aria-hidden>{LEVEL[a.level].icon}</span>
                  <div>
                    <div className="text-sm font-semibold">
                      <span className="sr-only">{LEVEL[a.level].label}: </span>
                      {a.title}
                    </div>
                    <div className="text-sm text-neutral-600">{a.detail}</div>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </Panel>

      <Panel title="Money" subtitle={`In ${c}. Trial card checks are not counted as revenue.`}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Monthly recurring revenue" value={m(o.money.mrr)} sub={`${m(o.money.arr)} a year`} />
          <Tile label="Revenue, 30 days" value={m(o.money.revenue30)} delta={{ now: o.money.revenue30, before: o.money.revenuePrev30, period: "prior 30d" }} />
          <Tile label="Net after fees & refunds, 30d" value={m(o.money.net30)} sub={`Fees ${m(o.money.fees30)} · Refunds ${m(o.money.refunds30)}`} />
          <Tile label="Profit after AI costs, 30d" value={c === "USD" ? m(o.money.profit30) : "–"} sub={c === "USD" ? `AI ${usd(o.ai.cost30d)}` : "AI costs are in USD"} />
          <Tile label="Revenue today" value={m(o.money.revenue1d)} sub={`7 days: ${m(o.money.revenue7d)}`} />
          <Tile label="Revenue, 12 months" value={m(o.money.revenue12m)} />
          <Tile label="Average per paying user" value={m(o.money.arpu)} sub="per month" />
          <Tile label="Failed payments, 30d" value={num(o.money.failedCharges30)} sub={`${o.cancellations30} cancellation(s) in 30d`} />
        </div>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Revenue per day</h3>
            <Columns label="Revenue per day" data={o.series.map((s) => ({ date: s.date, value: s.revenue }))} format={(v) => money(v, c, true)} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Coming in, next 7 days</h3>
            {o.upcoming.length === 0 ? (
              <p className="text-sm text-neutral-500">No charges scheduled in the next 7 days.</p>
            ) : (
              <>
                <p className="mb-2 text-sm text-neutral-600">
                  {m(o.upcoming.reduce((a, u) => a + u.amount, 0))} expected from {o.upcoming.length} charge(s).
                </p>
                <ul className="max-h-56 divide-y divide-neutral-100 overflow-auto text-sm">
                  {o.upcoming.map((u, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 py-2">
                      <button className="truncate text-left hover:underline" onClick={() => u.userId && openUser(u.userId)}>
                        {u.email}
                        <span className="ml-2 text-xs text-neutral-500">{u.kind}</span>
                      </button>
                      <span className="whitespace-nowrap tabular-nums text-neutral-600">
                        {m(u.amount)} · {date(u.at)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Growth">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Tile label="Total users" value={num(o.users.total)} />
            <Tile label="New, 30 days" value={num(o.users.new30d)} delta={{ now: o.users.new30d, before: o.users.prev30d, period: "prior 30d" }} />
            <Tile label="New, 7 days" value={num(o.users.new7d)} sub={`Today: ${o.users.new1d}`} />
            <Tile label="Active today" value={num(o.active.d1)} />
            <Tile label="Active, 7 days" value={num(o.active.d7)} />
            <Tile label="Active, 30 days" value={num(o.active.d30)} />
          </div>
          <h3 className="mb-2 mt-5 text-sm font-semibold">Sign-ups per day</h3>
          <Columns label="Sign-ups per day" data={o.series.map((s) => ({ date: s.date, value: s.signups }))} format={(v) => num(v)} />
          <h3 className="mb-2 mt-4 text-sm font-semibold">Active users per day</h3>
          <Columns label="Active users per day" data={o.series.map((s) => ({ date: s.date, value: s.active }))} format={(v) => num(v)} />
        </Panel>

        <Panel title="Subscriptions" subtitle={`${totalActiveSubs} with access now`}>
          <ul className="space-y-2">
            {Object.entries(STATUS_STYLE).map(([k]) => {
              const n = o.statusCounts[k] ?? 0;
              const share = o.users.total ? n / o.users.total : 0;
              return (
                <li key={k} className="flex items-center gap-3">
                  <div className="w-36 shrink-0">
                    <StatusPill status={k} />
                  </div>
                  <div className="h-2 flex-1 rounded-full bg-neutral-100">
                    <div className="h-2 rounded-full bg-neutral-900" style={{ width: `${share * 100}%` }} />
                  </div>
                  <span className="w-10 text-right text-sm tabular-nums">{n}</span>
                </li>
              );
            })}
          </ul>
          <h3 className="mb-3 mt-6 text-sm font-semibold">Trial funnel</h3>
          <div className="grid grid-cols-3 gap-3">
            <Tile label="Signed up" value={num(o.funnel.signedUp)} />
            <Tile label="Started trial" value={num(o.funnel.startedTrial)} sub={pct(o.funnel.signedUp ? o.funnel.startedTrial / o.funnel.signedUp : null)} />
            <Tile label="Trial → paid" value={pct(o.funnel.conversionRate)} sub={`${o.funnel.converted} of ${o.funnel.trialsEnded} ended trials`} />
          </div>
          {Object.keys(o.plans).length > 0 && (
            <p className="mt-4 text-sm text-neutral-600">
              Paying plans: {Object.entries(o.plans).map(([k, v]) => `${v} ${k}`).join(" · ")}
            </p>
          )}
        </Panel>
      </div>

      <Panel title="AI usage & cost" subtitle="Each scan or room setup is one Claude call. Costs are estimated from the tokens each call used.">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Scans today" value={num(o.ai.calls1d)} sub={`7 days: ${num(o.ai.calls7d)} · 30 days: ${num(o.ai.calls30d)}`} />
          <Tile label="AI cost, 30 days" value={usd(o.ai.cost30d)} sub={`Today: ${usd(o.ai.cost1d)}`} />
          <Tile label="Cost per scan" value={o.ai.calls30d ? usd(o.ai.cost30d / o.ai.calls30d) : "–"} />
          <Tile
            label="Blocked, 30 days"
            value={num(Object.values(o.ai.blocked30d).reduce((a, b) => a + b, 0))}
            sub={Object.entries(o.ai.blocked30d).map(([k, v]) => `${{ paywall: "no plan", daily: "daily limit", busy: "too fast" }[k] ?? k}: ${v}`).join(" · ") || "none"}
          />
        </div>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Scans per day</h3>
            <Columns label="Scans per day" data={o.series.map((s) => ({ date: s.date, value: s.aiCalls }))} format={(v) => num(v)} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">AI cost per day (USD)</h3>
            <Columns label="AI cost per day" data={o.series.map((s) => ({ date: s.date, value: s.aiCost }))} format={(v) => usd(v)} />
          </div>
        </div>
        {o.ai.errors30d > 0 && <p className="mt-3 text-sm text-neutral-600">{o.ai.errors30d} AI error(s) in 30 days. See Activity → AI.</p>}
      </Panel>
    </>
  );
}

function SetupTab({ o }: { o: Overview }) {
  return (
    <Panel title="Setup checklist" subtitle="What's connected. Change these in Vercel → Project → Settings → Environment Variables, then redeploy.">
      <ul className="divide-y divide-neutral-100">
        {o.setup.map((s) => (
          <li key={s.name} className="flex items-start gap-3 py-3">
            <span aria-hidden className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs text-white ${s.ok ? "bg-emerald-600" : "bg-amber-500"}`}>
              {s.ok ? "✓" : "!"}
            </span>
            <div>
              <div className="font-semibold">
                {s.name} <span className="sr-only">{s.ok ? "(ok)" : "(needs attention)"}</span>
              </div>
              <div className="text-sm text-neutral-600">{s.detail}</div>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 space-y-2 text-sm text-neutral-600">
        <p>
          <b>Paystack webhook URL:</b> <code className="rounded bg-neutral-100 px-1.5 py-0.5">{o.appUrl}/api/billing/webhook</code>
        </p>
        <p>
          <b>Database:</b> after each update, run <code className="rounded bg-neutral-100 px-1.5 py-0.5">supabase/schema.sql</code> again in Supabase → SQL Editor (it&apos;s safe to re-run).
        </p>
        <p>
          <b>Other dashboards:</b> Anthropic console (AI spend limit), Paystack dashboard (disputes, payouts), Supabase (auth emails, database), Resend (email
          delivery), Vercel (logs, errors).
        </p>
      </div>
    </Panel>
  );
}
