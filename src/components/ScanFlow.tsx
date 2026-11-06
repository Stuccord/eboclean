"use client";

import { useRef, useState } from "react";
import type { ScanResult } from "@/lib/scan";
import { compressImage } from "@/lib/image";
import { recordMission } from "@/lib/progress";
import { makeShareCard } from "@/lib/shareCard";
import { addHistory, DUE_AT, markTasksDone, newId, savePhoto, taskNeed, type Room } from "@/lib/store";
import { MissionRunner, type MissionOutcome } from "./MissionRunner";
import { CATEGORY_EMOJI, PhotoTile, PrimaryButton, ScanningView, ScoreBadge, Stat, type Energy } from "./ui";

type Stage = "pick" | "scanning" | "result" | "mission" | "after" | "scanningAfter" | "done";

export function ScanFlow({
  room,
  timeBudget,
  energy,
  onDemo,
  onExit,
  onPaywall,
  onNeedLogin,
  onUsed,
}: {
  room?: Room;
  timeBudget: number;
  energy: Energy;
  onDemo: (demo: boolean) => void;
  onExit: () => void;
  onPaywall: (reason: "scans") => void;
  onNeedLogin: () => void;
  onUsed: () => void;
}) {
  const [stage, setStage] = useState<Stage>("pick");
  const [beforeImage, setBeforeImage] = useState<string | null>(null);
  const [afterImage, setAfterImage] = useState<string | null>(null);
  const [before, setBefore] = useState<ScanResult | null>(null);
  const [after, setAfter] = useState<ScanResult | null>(null);
  const [outcome, setOutcome] = useState<MissionOutcome | null>(null);
  const [companion, setCompanion] = useState(true);
  const [pointsEarned, setPointsEarned] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const beforeInput = useRef<HTMLInputElement>(null);
  const afterInput = useRef<HTMLInputElement>(null);

  async function runScan(file: File, mode: "before" | "after") {
    setError(null);
    let dataUrl: string;
    try {
      dataUrl = await compressImage(file);
    } catch {
      setError("Couldn't read that photo. Try another one.");
      return;
    }
    if (mode === "before") {
      setBeforeImage(dataUrl);
      setStage("scanning");
    } else {
      setAfterImage(dataUrl);
      setStage("scanningAfter");
    }

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: dataUrl,
          mode,
          timeBudgetMinutes: timeBudget,
          energy,
          previous:
            mode === "after" && before ? { mess_score: before.mess_score, zone_label: before.zone_label } : undefined,
        }),
      });
      const data = await res.json();
      if (res.status === 401 && data.needLogin) {
        setStage("pick");
        onNeedLogin();
        return;
      }
      if (res.status === 402 && data.paywall) {
        setStage("pick");
        onPaywall("scans");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Scan failed");
      onDemo(Boolean(data.demo));
      if (mode === "before") onUsed();
      const result = data.result as ScanResult;

      if (mode === "before") {
        setBefore(result);
        setStage("result");
      } else {
        setAfter(result);
        const drop = Math.max(0, (before?.mess_score ?? 0) - result.mess_score);
        const earned = (outcome?.completedIndices.length ?? 0) * 10 + drop + 20;
        setPointsEarned(earned);
        recordMission(earned, drop);
        if (beforeImage && before) {
          const [beforePhotoId, afterPhotoId] = await Promise.all([savePhoto(beforeImage), savePhoto(dataUrl)]);
          await addHistory({
            id: newId(),
            roomId: room?.id ?? null,
            roomName: room?.name ?? before.zone_label,
            date: Date.now(),
            beforeScore: before.mess_score,
            afterScore: result.mess_score,
            beforePhotoId,
            afterPhotoId,
            minutes: Math.max(1, Math.round((outcome?.seconds ?? 60) / 60)),
          });
          // The room is visibly clean now, so its due tasks count as done.
          if (room && result.is_space && result.mess_score <= 30) {
            const now = Date.now();
            const dueIds = room.tasks.filter((t) => taskNeed(t, now) >= DUE_AT).map((t) => t.id);
            if (dueIds.length) await markTasksDone(dueIds, now);
          }
        }
        setStage("done");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
      setStage(mode === "before" ? "pick" : "after");
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>, mode: "before" | "after") {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) runScan(file, mode);
  }

  const totalMinutes = before?.steps.reduce((s, x) => s + x.minutes, 0) ?? 0;

  return (
    <section className="flex flex-1 flex-col">
      <input ref={beforeInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPick(e, "before")} />
      <input ref={afterInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPick(e, "after")} />

      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
          {error}
        </p>
      )}

      {stage === "pick" && (
        <div className="flex flex-1 flex-col">
          <button onClick={onExit} className="mb-4 self-start text-sm font-semibold text-neutral-900/50">
            ← Back
          </button>
          <div className="text-6xl">{room?.emoji ?? "📸"}</div>
          <h2 className="mt-4 text-3xl font-bold">{room ? `Scan your ${room.name.toLowerCase()}` : "Scan a messy spot"}</h2>
          <p className="mt-2 text-neutral-900/60">
            Take a photo of the mess. You&apos;ll get a Mess Score and a {timeBudget}-minute mission made just for it.
          </p>
          <div className="mt-auto">
            <PrimaryButton onClick={() => beforeInput.current?.click()}>📸 Take the photo</PrimaryButton>
            <p className="mt-3 text-center text-xs text-neutral-900/50">Photos stay on your device. They&apos;re only sent to make your plan.</p>
          </div>
        </div>
      )}

      {(stage === "scanning" || stage === "scanningAfter") && (
        <ScanningView image={stage === "scanning" ? beforeImage : afterImage} label={stage === "scanning" ? undefined : "Checking your glow-up…"} />
      )}

      {stage === "result" && before && beforeImage && (
        <div className="flex flex-1 flex-col">
          <div className="relative overflow-hidden rounded-3xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={beforeImage} alt="Your space before cleaning" className="h-64 w-full object-cover" />
            {before.is_space && <ScoreBadge score={before.mess_score} />}
          </div>
          {before.is_space ? (
            <>
              <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-neutral-900/50">{before.zone_label}</p>
              <h2 className="mt-1 text-2xl font-bold">{before.headline}</h2>
              {before.items_found.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {before.items_found.slice(0, 6).map((it) => (
                    <span key={it.name} className="rounded-full bg-neutral-100 px-3 py-1 text-sm">
                      {it.count} × {it.name}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-5 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-neutral-950/5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-bold">Your mission</h3>
                  <span className="text-sm text-neutral-900/60">
                    {before.steps.length} steps · ~{totalMinutes} min
                  </span>
                </div>
                <ol className="space-y-2">
                  {before.steps.map((s, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <span>{CATEGORY_EMOJI[s.category] ?? "✨"}</span>
                      <span className="flex-1">{s.title}</span>
                      <span className="text-neutral-900/50">{s.minutes}m</span>
                    </li>
                  ))}
                </ol>
              </div>
              <label className="mt-4 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-neutral-950/5 text-sm">
                <input type="checkbox" checked={companion} onChange={(e) => setCompanion(e.target.checked)} className="h-5 w-5 accent-neutral-900" />
                Clean with Ebo (talks you through it, 2-minute start)
              </label>
              <div className="mt-4">
                <PrimaryButton variant="success" onClick={() => setStage("mission")}>
                  ▶ Start mission
                </PrimaryButton>
              </div>
            </>
          ) : (
            <>
              <h2 className="mt-5 text-2xl font-bold">{before.headline}</h2>
              <div className="mt-6">
                <PrimaryButton variant="plain" onClick={() => beforeInput.current?.click()}>
                  📸 Try another photo
                </PrimaryButton>
              </div>
            </>
          )}
        </div>
      )}

      {stage === "mission" && before && (
        <MissionRunner
          steps={before.steps}
          companion={companion}
          startScore={before.mess_score}
          onFinish={(o) => {
            setOutcome(o);
            setStage("after");
          }}
        />
      )}

      {stage === "after" && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="text-7xl">🎉</div>
          <h2 className="mt-4 text-3xl font-bold">{outcome?.stoppedEarly ? "That counts!" : "Mission complete!"}</h2>
          {outcome?.reward && (
            <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-2 font-bold text-amber-800 ring-1 ring-amber-100">🎁 Reward unlocked: {outcome.reward}</p>
          )}
          <p className="mt-2 text-neutral-900/60">
            Snap an <b>after</b> photo from the same spot to see your new Mess Score.
          </p>
          <div className="mt-8 w-full">
            <PrimaryButton onClick={() => afterInput.current?.click()}>📸 Snap the after photo</PrimaryButton>
          </div>
        </div>
      )}

      {stage === "done" && before && after && beforeImage && afterImage && (
        <DoneView
          before={before}
          after={after}
          beforeImage={beforeImage}
          afterImage={afterImage}
          minutes={Math.max(1, Math.round((outcome?.seconds ?? 60) / 60))}
          pointsEarned={pointsEarned}
          onExit={onExit}
        />
      )}
    </section>
  );
}

function DoneView({
  before,
  after,
  beforeImage,
  afterImage,
  minutes,
  pointsEarned,
  onExit,
}: {
  before: ScanResult;
  after: ScanResult;
  beforeImage: string;
  afterImage: string;
  minutes: number;
  pointsEarned: number;
  onExit: () => void;
}) {
  const [sharing, setSharing] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  async function share() {
    setSharing(true);
    setShareMsg(null);
    try {
      const blob = await makeShareCard({
        beforeImage,
        afterImage,
        beforeScore: before.mess_score,
        afterScore: after.mess_score,
        minutes,
        zoneLabel: before.zone_label,
      });
      const file = new File([blob], "eboclean-glow-up.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "My Eboclean glow-up",
          text: `Mess Score ${before.mess_score} → ${after.mess_score} in ${minutes} minutes 🧹✨`,
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "eboclean-glow-up.png";
        a.click();
        URL.revokeObjectURL(url);
        setShareMsg("Saved! Post it to TikTok or your story.");
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setShareMsg("Couldn't create the card. Try again.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <h2 className="text-center text-3xl font-bold">Glow-up unlocked ✨</h2>
      <p className="mt-2 text-center text-neutral-900/60">{after.comparison || after.encouragement}</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <PhotoTile src={beforeImage} label="Before" score={before.mess_score} color="bg-red-500" />
        <PhotoTile src={afterImage} label="After" score={after.mess_score} color="bg-emerald-500" />
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2">
        <Stat label="Score drop" value={`-${Math.max(0, before.mess_score - after.mess_score)}`} />
        <Stat label="Points" value={`+${pointsEarned}`} />
        <Stat label="Minutes" value={`${minutes}`} />
      </div>
      {after.steps.length > 0 && (
        <div className="mt-5 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-neutral-950/5 text-sm">
          <p className="mb-2 font-bold">Bonus round (optional)</p>
          <ul className="space-y-1">
            {after.steps.map((s, i) => (
              <li key={i}>
                {CATEGORY_EMOJI[s.category] ?? "✨"} {s.title}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-6 space-y-3">
        <PrimaryButton onClick={share} disabled={sharing}>
          {sharing ? "Making your card…" : "📲 Share my glow-up"}
        </PrimaryButton>
        {shareMsg && <p className="text-center text-sm text-neutral-900/60">{shareMsg}</p>}
        <PrimaryButton variant="plain" onClick={onExit}>
          Done
        </PrimaryButton>
      </div>
    </div>
  );
}
