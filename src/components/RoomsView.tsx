"use client";

import { useState } from "react";
import { recordTask } from "@/lib/progress";
import { deleteRoom, DUE_AT, effortPoints, markTasksDone, roomFreshness, taskNeed, type HistoryEntry, type Room } from "@/lib/store";
import { BackButton, Card, formatDate, FreshnessRing, IconTile, PhotoTile, PrimaryButton, ROOM_TINTS, TaskRow, usePhoto, type HomeData } from "./ui";

function roomTint(index: number) {
  return ROOM_TINTS[index % ROOM_TINTS.length];
}

export function RoomsView({ data, onOpen, onAdd }: { data: HomeData; onOpen: (roomId: string) => void; onAdd: () => void }) {
  const dueTotal = data.rooms.reduce((s, r) => s + r.tasks.filter((t) => taskNeed(t, data.now) >= DUE_AT).length, 0);
  return (
    <div className="flex flex-1 flex-col">
      <h1 className="text-3xl font-black">My home</h1>
      <p className="mt-1 text-sm text-indigo-900/60">
        {data.rooms.length} room{data.rooms.length === 1 ? "" : "s"} · {dueTotal} task{dueTotal === 1 ? "" : "s"} due
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        {data.rooms.map((room, i) => (
          <RoomCard key={room.id} room={room} tint={roomTint(i)} now={data.now} onOpen={() => onOpen(room.id)} />
        ))}
        <button
          onClick={onAdd}
          className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-violet-200 bg-violet-50/50 p-4 font-bold text-violet-700 transition hover:bg-violet-50"
        >
          <span className="grid h-12 w-12 place-items-center rounded-full bg-white text-2xl shadow-sm">+</span>
          Add a room
        </button>
      </div>
    </div>
  );
}

function RoomCard({ room, tint, now, onOpen }: { room: Room; tint: string; now: number; onOpen: () => void }) {
  const fresh = roomFreshness(room, now);
  const due = room.tasks.filter((t) => taskNeed(t, now) >= DUE_AT).length;
  return (
    <button onClick={onOpen} className="flex min-h-40 flex-col items-center rounded-3xl bg-white p-4 text-center shadow-sm ring-1 ring-indigo-950/5 transition hover:shadow-md active:scale-[0.98]">
      <FreshnessRing value={fresh} size={76} stroke={6}>
        <IconTile emoji={room.emoji} tint={tint} size="md" />
      </FreshnessRing>
      <p className="mt-3 font-bold">{room.name}</p>
      <p className={`mt-0.5 text-xs font-semibold ${due > 0 ? "text-amber-600" : "text-emerald-600"}`}>{due > 0 ? `${due} due` : "All clean ✨"}</p>
    </button>
  );
}

function everyLabel(days: number) {
  if (days === 1) return "daily";
  if (days === 7) return "weekly";
  return `every ${days}d`;
}

export function RoomDetail({
  room,
  history,
  now,
  onBack,
  onScan,
}: {
  room: Room;
  history: HistoryEntry[];
  now: number;
  onBack: () => void;
  onScan: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cover = usePhoto(room.coverPhotoId);
  const fresh = roomFreshness(room, now);
  const entries = history.filter((h) => h.roomId === room.id).sort((a, b) => b.date - a.date);
  const tasks = [...room.tasks].sort((a, b) => taskNeed(b, now) - taskNeed(a, now));
  const dueTasks = tasks.filter((t) => taskNeed(t, now) >= DUE_AT);
  const freshTasks = tasks.filter((t) => taskNeed(t, now) < DUE_AT);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <BackButton onClick={onBack} label="My home" />

      <div className="relative overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-indigo-950/5">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="h-36 w-full object-cover" />
        ) : (
          <div className="h-36 w-full bg-violet-100" />
        )}
        <div className="flex items-center gap-4 p-4">
          <FreshnessRing value={fresh} size={64} />
          <div>
            <h1 className="text-2xl font-black">
              {room.emoji} {room.name}
            </h1>
            <p className="text-sm text-indigo-900/60">
              {dueTasks.length > 0 ? `${dueTasks.length} task${dueTasks.length === 1 ? " needs" : "s need"} attention` : "Everything is clean here ✨"}
            </p>
          </div>
        </div>
      </div>

      {dueTasks.length > 0 && (
        <Card>
          <h2 className="mb-1 font-black">To do</h2>
          <ul className="divide-y divide-indigo-950/5">
            {dueTasks.map((t) => (
              <TaskRow
                key={t.id}
                title={t.title}
                subtitle={everyLabel(t.everyDays)}
                category={t.category}
                minutes={t.minutes}
                need={taskNeed(t, now)}
                onCheck={() => {
                  markTasksDone([t.id]);
                  recordTask(effortPoints(t.minutes) * 10);
                }}
              />
            ))}
          </ul>
        </Card>
      )}

      {freshTasks.length > 0 && (
        <Card>
          <h2 className="mb-1 font-black">Clean for now</h2>
          <ul className="divide-y divide-indigo-950/5">
            {freshTasks.map((t) => (
              <TaskRow key={t.id} title={t.title} subtitle={everyLabel(t.everyDays)} category={t.category} minutes={t.minutes} need={taskNeed(t, now)} />
            ))}
          </ul>
        </Card>
      )}

      <PrimaryButton onClick={onScan}>📸 Scan this room</PrimaryButton>

      <div>
        <h2 className="font-black">Progress timeline</h2>
        {entries.length === 0 ? (
          <p className="mt-2 text-sm text-indigo-900/60">Scan and clean this room to start your before/after timeline.</p>
        ) : (
          <div className="mt-3 space-y-4">
            {entries.map((e) => (
              <TimelineEntry key={e.id} entry={e} />
            ))}
          </div>
        )}
      </div>

      <div className="pb-2 text-center">
        {confirmDelete ? (
          <div className="space-x-3 text-sm">
            <span className="text-indigo-900/60">Delete this room?</span>
            <button
              onClick={async () => {
                await deleteRoom(room.id);
                onBack();
              }}
              className="font-bold text-rose-600"
            >
              Yes, delete
            </button>
            <button onClick={() => setConfirmDelete(false)} className="text-indigo-900/60">
              Cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="text-xs text-indigo-900/40 hover:text-rose-600">
            Delete room
          </button>
        )}
      </div>
    </div>
  );
}

export function TimelineEntry({ entry, showRoom }: { entry: HistoryEntry; showRoom?: boolean }) {
  const before = usePhoto(entry.beforePhotoId);
  const after = usePhoto(entry.afterPhotoId);
  return (
    <Card className="p-3">
      <div className="mb-2 flex justify-between text-xs font-semibold text-indigo-900/50">
        <span>
          {formatDate(entry.date)}
          {showRoom ? ` · ${entry.roomName}` : ""}
        </span>
        <span>
          {entry.beforeScore} → {entry.afterScore} · {entry.minutes} min
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <PhotoTile src={before} label="Before" score={entry.beforeScore} color="bg-rose-500" small />
        <PhotoTile src={after} label="After" score={entry.afterScore} color="bg-emerald-500" small />
      </div>
    </Card>
  );
}
