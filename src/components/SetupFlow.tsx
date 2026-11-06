"use client";

import { useRef, useState } from "react";
import type { SetupResult } from "@/lib/scan";
import { compressImage } from "@/lib/image";
import { DAY, newId, saveRoom, savePhoto, type Room, type RoomTask } from "@/lib/store";
import { CATEGORY_EMOJI, PrimaryButton, ScanningView, ScoreBadge } from "./ui";

type Stage = "pick" | "scanning" | "review" | "saved";

function everyLabel(days: number) {
  if (days === 1) return "Daily";
  if (days === 7) return "Weekly";
  if (days === 14) return "Every 2 weeks";
  if (days === 30) return "Monthly";
  return `Every ${days} days`;
}

export function SetupFlow({
  roomsCount,
  onDemo,
  onDone,
  onExit,
  onPaywall,
  onUsed,
}: {
  roomsCount: number;
  onDemo: (demo: boolean) => void;
  onDone: () => void;
  onExit: () => void;
  onPaywall: (reason: "rooms") => void;
  onUsed: () => void;
}) {
  const [stage, setStage] = useState<Stage>("pick");
  const [image, setImage] = useState<string | null>(null);
  const [result, setResult] = useState<SetupResult | null>(null);
  const [name, setName] = useState("");
  const [tasks, setTasks] = useState<SetupResult["recurring_tasks"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState(0);
  // Room count when this flow opened (the live count grows as rooms are saved).
  const [startCount] = useState(roomsCount);
  const input = useRef<HTMLInputElement>(null);

  async function run(file: File) {
    setError(null);
    let dataUrl: string;
    try {
      dataUrl = await compressImage(file);
    } catch {
      setError("Couldn't read that photo. Try another one.");
      return;
    }
    setImage(dataUrl);
    setStage("scanning");
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl, roomIndex: startCount + added }),
      });
      const data = await res.json();
      if (res.status === 402 && data.paywall) {
        setStage(added > 0 ? "saved" : "pick");
        onPaywall("rooms");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Setup failed");
      onDemo(Boolean(data.demo));
      onUsed();
      const r = data.result as SetupResult;
      setResult(r);
      setName(r.room_name);
      setTasks(r.recurring_tasks);
      setStage("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup failed");
      setStage("pick");
    }
  }

  async function save() {
    if (!result || !image) return;
    setSaving(true);
    const now = Date.now();
    const photoId = await savePhoto(image);
    // A messy room starts with its tasks due; a tidy one starts part-way through each cycle.
    const roomTasks: RoomTask[] = tasks.map((t) => ({
      id: newId(),
      title: t.title,
      minutes: t.minutes,
      category: t.category,
      everyDays: t.every_days,
      lastDoneAt: result.mess_score >= 46 ? null : now - t.every_days * DAY * (0.3 + result.mess_score / 100),
    }));
    const room: Room = {
      id: newId(),
      name: name.trim() || result.room_name,
      emoji: result.emoji,
      createdAt: now,
      tasks: roomTasks,
      lastScore: result.mess_score,
      coverPhotoId: photoId,
    };
    await saveRoom(room);
    setAdded((a) => a + 1);
    setSaving(false);
    setStage("saved");
  }

  return (
    <section className="flex flex-1 flex-col">
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) run(f);
        }}
      />
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
          <div className="text-6xl">🏠</div>
          <h2 className="mt-4 text-3xl font-bold">{startCount + added === 0 ? "Let's map your home" : "Add another room"}</h2>
          <p className="mt-2 text-neutral-900/60">
            Snap one photo per room. AI builds a gentle cleaning routine for it, so you never have to type out tasks.
          </p>
          <div className="mt-auto">
            <PrimaryButton onClick={() => input.current?.click()}>📸 Snap a room</PrimaryButton>
          </div>
        </div>
      )}

      {stage === "scanning" && <ScanningView image={image} label="Building your room's routine…" />}

      {stage === "review" && result && image && (
        <div className="flex flex-1 flex-col">
          <div className="relative overflow-hidden rounded-3xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="Room photo" className="h-48 w-full object-cover" />
            {result.is_space && <ScoreBadge score={result.mess_score} />}
          </div>
          {result.is_space ? (
            <>
              <div className="mt-4 flex items-center gap-2">
                <span className="text-3xl">{result.emoji}</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="flex-1 rounded-xl bg-neutral-100 px-3 py-2 text-xl font-bold outline-none focus:ring-2 focus:ring-neutral-400"
                  aria-label="Room name"
                />
              </div>
              <p className="mt-2 text-neutral-900/60">{result.headline}</p>
              <div className="mt-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-neutral-950/5">
                <h3 className="mb-3 font-bold">Your routine for this room</h3>
                <ul className="space-y-2">
                  {tasks.map((t, i) => (
                    <li key={i} className="flex items-center gap-3 text-sm">
                      <span>{CATEGORY_EMOJI[t.category] ?? "✨"}</span>
                      <span className="flex-1">{t.title}</span>
                      <span className="whitespace-nowrap text-xs text-neutral-900/50">
                        {everyLabel(t.every_days)} · {t.minutes}m
                      </span>
                      <button
                        onClick={() => setTasks(tasks.filter((_, j) => j !== i))}
                        className="rounded-full px-2 text-neutral-900/50 hover:bg-neutral-100 hover:text-neutral-900"
                        aria-label={`Remove ${t.title}`}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-5">
                <PrimaryButton variant="success" onClick={save} disabled={saving || tasks.length === 0}>
                  {saving ? "Saving…" : "✓ Save this room"}
                </PrimaryButton>
              </div>
            </>
          ) : (
            <>
              <h2 className="mt-5 text-2xl font-bold">{result.headline}</h2>
              <div className="mt-6">
                <PrimaryButton variant="plain" onClick={() => input.current?.click()}>
                  📸 Try another photo
                </PrimaryButton>
              </div>
            </>
          )}
        </div>
      )}

      {stage === "saved" && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="text-7xl">✅</div>
          <h2 className="mt-4 text-3xl font-bold">{name} added!</h2>
          <p className="mt-2 text-neutral-900/60">
            {startCount + added} room{startCount + added === 1 ? "" : "s"} mapped. Add the rest of your home, or start today&apos;s reset.
          </p>
          <div className="mt-8 w-full space-y-3">
            <PrimaryButton onClick={() => input.current?.click()}>📸 Add another room</PrimaryButton>
            <PrimaryButton variant="success" onClick={onDone}>
              I&apos;m done, show my plan
            </PrimaryButton>
          </div>
        </div>
      )}
    </section>
  );
}
