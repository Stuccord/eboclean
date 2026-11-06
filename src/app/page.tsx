"use client";

import { useState, useSyncExternalStore } from "react";
import { currentStreak, loadProgress, onRestDay, recordMission, serverProgress, subscribeProgress } from "@/lib/progress";
import { markTasksDone, type PlannedStep } from "@/lib/store";
import { AccountCard, AuthSheet, useAccount } from "@/components/Account";
import { CheckoutToast, Paywall, useBilling, type PaywallReason } from "@/components/Billing";
import { MissionRunner, type MissionOutcome } from "@/components/MissionRunner";
import { ProgressView } from "@/components/ProgressView";
import { RoomDetail, RoomsView } from "@/components/RoomsView";
import { ScanFlow } from "@/components/ScanFlow";
import { SetupFlow } from "@/components/SetupFlow";
import { TodayView } from "@/components/TodayView";
import { LogoMark, Wordmark } from "@/components/Logo";
import { Onboarding } from "@/components/Onboarding";
import { loadPrefs, serverPrefs, subscribePrefs } from "@/lib/prefs";
import { Confetti, PrimaryButton, Stat, useHomeData, type Energy } from "@/components/ui";

type Tab = "today" | "rooms" | "progress";
type View =
  | { kind: "tab"; tab: Tab }
  | { kind: "scan"; roomId?: string }
  | { kind: "setup" }
  | { kind: "room"; roomId: string }
  | { kind: "daily"; steps: PlannedStep[]; companion: boolean }
  | { kind: "dailyDone"; outcome: MissionOutcome; steps: PlannedStep[]; points: number };

export default function Home() {
  const data = useHomeData();
  const progress = useSyncExternalStore(subscribeProgress, loadProgress, serverProgress);
  const [view, setView] = useState<View>({ kind: "tab", tab: "today" });
  const prefs = useSyncExternalStore(subscribePrefs, loadPrefs, serverPrefs);
  const [timeOverride, setTimeBudget] = useState<number | null>(null);
  const timeBudget = timeOverride ?? prefs.minutes;
  const [energy, setEnergy] = useState<Energy>("medium");
  const [demo, setDemo] = useState(false);
  const billing = useBilling();
  const [paywall, setPaywall] = useState<PaywallReason | null>(null);
  const account = useAccount();
  const [auth, setAuth] = useState<{ title?: string; subtitle?: string; then?: PaywallReason } | null>(null);

  const goTab = (tab: Tab) => setView({ kind: "tab", tab });
  // Keeps onboarding on screen until the user finishes it (rooms get created mid-way).
  const [onboarding, setOnboarding] = useState(false);
  const isNewUser = data.loaded && ((data.rooms.length === 0 && data.history.length === 0) || onboarding);

  return (
    <main className="min-h-dvh text-indigo-950">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-32 pt-2">
        {!(view.kind === "tab" && isNewUser) && (
        <header className="sticky top-0 z-30 -mx-5 mb-3 flex items-center justify-between bg-[#f4f5fb]/90 px-5 pb-3 pt-3 backdrop-blur-md">
          <button onClick={() => goTab("today")} className="flex items-center gap-2 whitespace-nowrap text-lg" aria-label="Eboclean home">
            <LogoMark size={36} className="shadow-sm shadow-violet-600/30 rounded-[10px]" />
            <Wordmark className="hidden text-xl min-[400px]:inline" />
          </button>
          <div className="flex gap-1.5 text-sm font-bold">
            {billing.status?.subscribed ? (
              <span className="rounded-full bg-violet-600 px-3 py-1 text-xs font-black leading-5 text-white">PRO</span>
            ) : billing.status?.onTrial ? (
              <button onClick={() => setPaywall("upgrade")} className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black leading-5 text-violet-700">
                TRIAL
              </button>
            ) : billing.status ? (
              <button onClick={() => setPaywall("upgrade")} className="rounded-full bg-violet-50 px-3 py-1 text-xs font-black leading-5 text-violet-700 ring-1 ring-violet-200 hover:bg-violet-100">
                ✨ Pro
              </button>
            ) : null}
            <span className="rounded-full bg-orange-50 px-2.5 py-1 text-orange-600 ring-1 ring-orange-100" title="Day streak">
              🔥 {currentStreak(progress)}
            </span>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-600 ring-1 ring-amber-100" title="Points">
              ⭐ {progress.points}
            </span>
          </div>
        </header>
        )}

        <CheckoutToast notice={billing.notice} onClose={billing.clearNotice} />

        {demo && view.kind !== "tab" && (
          <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-200">
            Demo mode: showing sample results. Add an Anthropic API key to scan real photos.
          </p>
        )}

        {!data.loaded ? (
          <div className="flex flex-1 items-center justify-center text-indigo-900/50">Loading…</div>
        ) : view.kind === "tab" && isNewUser ? (
          <Onboarding
            onBegin={() => setOnboarding(true)}
            onFinish={(minutes) => {
              setOnboarding(false);
              setTimeBudget(minutes);
              goTab("today");
            }}
            onStartFirstReset={(steps, minutes) => {
              setOnboarding(false);
              setTimeBudget(minutes);
              setView({ kind: "daily", steps, companion: true });
            }}
            onSignIn={() => setAuth({ title: "Welcome back", subtitle: "Sign in to bring your home, streak and Pro to this device." })}
            onScanInstead={() => {
              setOnboarding(false);
              setView({ kind: "setup" });
            }}
          />
        ) : view.kind === "tab" && view.tab === "today" ? (
          <TodayView
            data={data}
            timeBudget={timeBudget}
            energy={energy}
            setTimeBudget={setTimeBudget}
            setEnergy={setEnergy}
            onStart={(steps, companion) => setView({ kind: "daily", steps, companion })}
            onScan={() => setView({ kind: "scan" })}
            onSetup={() => setView({ kind: "setup" })}
            restDay={onRestDay(progress)}
          />
        ) : view.kind === "tab" && view.tab === "rooms" ? (
          <RoomsView data={data} onOpen={(roomId) => setView({ kind: "room", roomId })} onAdd={() => setView({ kind: "setup" })} />
        ) : view.kind === "tab" ? (
          <ProgressView
            data={data}
            progress={progress}
            billing={billing.status}
            onUpgrade={() => setPaywall("upgrade")}
            accountCard={
              account.loaded ? (
                <AccountCard
                  user={account.user}
                  syncing={account.syncing}
                  onSignIn={() => setAuth({})}
                  onSignOut={async () => {
                    await account.signOut();
                    await billing.refresh();
                    billing.setNotice("signed-out");
                    goTab("today");
                  }}
                />
              ) : null
            }
          />
        ) : view.kind === "scan" ? (
          <ScanFlow
            room={data.rooms.find((r) => r.id === view.roomId)}
            timeBudget={timeBudget}
            energy={energy}
            onDemo={setDemo}
            onPaywall={setPaywall}
            onUsed={billing.refresh}
            onExit={() => (view.roomId ? setView({ kind: "room", roomId: view.roomId }) : goTab("today"))}
          />
        ) : view.kind === "setup" ? (
          <SetupFlow roomsCount={data.rooms.length} onDemo={setDemo} onPaywall={setPaywall} onUsed={billing.refresh} onDone={() => goTab("today")} onExit={() => goTab(data.rooms.length ? "rooms" : "today")} />
        ) : view.kind === "room" ? (
          (() => {
            const room = data.rooms.find((r) => r.id === view.roomId);
            if (!room) return <RoomsView data={data} onOpen={(roomId) => setView({ kind: "room", roomId })} onAdd={() => setView({ kind: "setup" })} />;
            return (
              <RoomDetail
                room={room}
                history={data.history}
                now={data.now}
                onBack={() => goTab("rooms")}
                onScan={() => setView({ kind: "scan", roomId: room.id })}
              />
            );
          })()
        ) : view.kind === "daily" ? (
          <MissionRunner
            steps={view.steps}
            companion={view.companion}
            onFinish={async (outcome) => {
              const ids = outcome.completedIndices.map((i) => view.steps[i].taskId).filter((x): x is string => Boolean(x));
              if (ids.length) await markTasksDone(ids);
              const points = outcome.completedIndices.length * 10 + (outcome.completedIndices.length > 0 ? 20 : 0);
              if (points > 0) recordMission(points, 0);
              setView({ kind: "dailyDone", outcome, steps: view.steps, points });
            }}
          />
        ) : (
          <DailyDone
            outcome={view.outcome}
            total={view.steps.length}
            points={view.points}
            streak={currentStreak(progress)}
            onHome={() => goTab("today")}
          />
        )}
      </div>

      {paywall && (
        <Paywall
          reason={paywall}
          status={billing.status}
          onClose={() => setPaywall(null)}
          onTrialStarted={() => {
            setPaywall(null);
            billing.refresh();
            billing.setNotice("trial-started");
          }}
          onNeedLogin={(purpose) => {
            const reason = paywall;
            setPaywall(null);
            setAuth({
              title: purpose === "trial" ? "Create your free account" : "Sign in to subscribe",
              subtitle:
                purpose === "trial"
                  ? "Your trial and progress are saved to your account, so they work on every device."
                  : "Your subscription is linked to your account, so Pro works on every device.",
              then: reason,
            });
          }}
        />
      )}

      {auth && (
        <AuthSheet
          title={auth.title}
          subtitle={auth.subtitle}
          onClose={() => setAuth(null)}
          onSignedIn={async (user) => {
            const result = await account.completeSignIn(user);
            await billing.refresh();
            const then = auth.then;
            setAuth(null);
            billing.setNotice(result === "downloaded" ? "signed-in-restored" : "signed-in-saved");
            if (then) setPaywall(then);
          }}
        />
      )}

      {(view.kind === "tab" || view.kind === "room") && !isNewUser && data.loaded && (
        <TabBar tab={view.kind === "tab" ? view.tab : "rooms"} onTab={goTab} onScan={() => setView({ kind: "scan" })} />
      )}
    </main>
  );
}

function TabItem({ id, label, icon, tab, onTab }: { id: Tab; label: string; icon: string; tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <button
      onClick={() => onTab(id)}
      className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-bold transition ${tab === id ? "text-violet-700" : "text-indigo-900/40"}`}
      aria-current={tab === id ? "page" : undefined}
    >
      <span className={`grid h-8 w-12 place-items-center rounded-full text-lg ${tab === id ? "bg-violet-100" : ""}`}>{icon}</span>
      {label}
    </button>
  );
}

function TabBar({ tab, onTab, onScan }: { tab: Tab; onTab: (t: Tab) => void; onScan: () => void }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-indigo-950/5 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-4 items-end">
        <TabItem id="today" label="Today" icon="☀️" tab={tab} onTab={onTab} />
        <TabItem id="rooms" label="My home" icon="🏠" tab={tab} onTab={onTab} />
        <div className="flex justify-center">
          <button
            onClick={onScan}
            aria-label="Scan a mess"
            className="-mt-7 mb-2 grid h-16 w-16 place-items-center rounded-full bg-violet-600 text-2xl text-white shadow-xl shadow-violet-600/40 ring-4 ring-[#f4f5fb] transition active:scale-95"
          >
            📸
          </button>
        </div>
        <TabItem id="progress" label="Progress" icon="🏆" tab={tab} onTab={onTab} />
      </div>
    </nav>
  );
}

function DailyDone({
  outcome,
  total,
  points,
  streak,
  onHome,
}: {
  outcome: MissionOutcome;
  total: number;
  points: number;
  streak: number;
  onHome: () => void;
}) {
  const done = outcome.completedIndices.length;
  const minutes = Math.max(1, Math.round(outcome.seconds / 60));
  return (
    <section className="flex flex-1 flex-col items-center justify-center text-center">
      {done > 0 && <Confetti />}
      <div className="text-7xl">{done > 0 ? "🎉" : "🌱"}</div>
      <h2 className="mt-4 text-3xl font-black">{done === total ? "Reset complete!" : done > 0 ? "That counts!" : "Showing up counts too."}</h2>
      <p className="mt-2 text-indigo-900/60">
        {done > 0 ? `You knocked out ${done} of ${total} task${total === 1 ? "" : "s"} in ${minutes} min. Your rooms just got fresher.` : "Come back when you're ready. Tomorrow's reset will be waiting."}
      </p>
      {outcome.reward && done > 0 && (
        <p className="mt-4 w-full rounded-2xl bg-amber-50 px-4 py-3 font-bold text-amber-800 ring-1 ring-amber-100">
          🎁 You earned it: {outcome.reward}. Go enjoy it!
        </p>
      )}
      <div className="mt-6 grid w-full grid-cols-3 gap-2">
        <Stat label="Tasks" value={`${done}/${total}`} />
        <Stat label="Points" value={`+${points}`} />
        <Stat label="Streak" value={`🔥 ${streak}`} />
      </div>
      <div className="mt-8 w-full">
        <PrimaryButton variant="success" onClick={onHome}>
          Back to today
        </PrimaryButton>
      </div>
    </section>
  );
}
