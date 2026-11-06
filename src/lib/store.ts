// Home data: rooms, recurring tasks and cleaning history.
// Stored on the device in IndexedDB (photos are too big for localStorage).
// Moves to a server database once accounts are added.

export type Category =
  | "trash"
  | "dishes"
  | "laundry"
  | "put_away"
  | "surfaces"
  | "floor"
  | "other";

export interface RoomTask {
  id: string;
  title: string;
  minutes: number;
  category: Category;
  everyDays: number;
  lastDoneAt: number | null;
}

export interface Room {
  id: string;
  name: string;
  emoji: string;
  createdAt: number;
  tasks: RoomTask[];
  lastScore: number | null;
  coverPhotoId: string | null;
}

export interface HistoryEntry {
  id: string;
  roomId: string | null;
  roomName: string;
  date: number;
  beforeScore: number;
  afterScore: number;
  beforePhotoId: string;
  afterPhotoId: string;
  minutes: number;
}

export const DAY = 86_400_000;

// ---------- tiny IndexedDB key-value helper ----------
const DB_NAME = "clean-sweep";
const STORE = "kv";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- change notifications ----------
const CHANGE_EVENT = "clean-sweep-home";
function notify() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
export function subscribeHome(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

export function newId() {
  return crypto.randomUUID();
}

// ---------- rooms ----------
export async function getRooms(): Promise<Room[]> {
  return (await kvGet<Room[]>("rooms")) ?? [];
}

export async function saveRoom(room: Room) {
  const rooms = await getRooms();
  const i = rooms.findIndex((r) => r.id === room.id);
  if (i === -1) rooms.push(room);
  else rooms[i] = room;
  await kvSet("rooms", rooms);
  notify();
}

export async function addRooms(newRooms: Room[]) {
  const rooms = await getRooms();
  await kvSet("rooms", [...rooms, ...newRooms]);
  notify();
}

export async function deleteRoom(roomId: string) {
  const rooms = (await getRooms()).filter((r) => r.id !== roomId);
  await kvSet("rooms", rooms);
  notify();
}

export async function markTasksDone(taskIds: string[], at = Date.now()) {
  const ids = new Set(taskIds);
  const rooms = await getRooms();
  for (const room of rooms) {
    for (const t of room.tasks) if (ids.has(t.id)) t.lastDoneAt = at;
  }
  await kvSet("rooms", rooms);
  notify();
}

// ---------- photos ----------
export async function savePhoto(dataUrl: string): Promise<string> {
  const id = newId();
  await kvSet(`photo:${id}`, dataUrl);
  window.dispatchEvent(new CustomEvent(PHOTO_EVENT, { detail: id }));
  return id;
}

/** Caches a photo downloaded from the account, under its existing id. */
export async function cachePhoto(id: string, dataUrl: string) {
  await kvSet(`photo:${id}`, dataUrl);
}

export async function getPhoto(id: string): Promise<string | undefined> {
  return kvGet<string>(`photo:${id}`);
}

/** Fired with the photo id whenever a new photo is saved (used for cloud upload). */
export const PHOTO_EVENT = "clean-sweep-photo";

/** Ids of every photo referenced by rooms and history. */
export function referencedPhotoIds(rooms: Room[], history: HistoryEntry[]): string[] {
  const ids = new Set<string>();
  for (const r of rooms) if (r.coverPhotoId) ids.add(r.coverPhotoId);
  for (const h of history) {
    ids.add(h.beforePhotoId);
    ids.add(h.afterPhotoId);
  }
  return [...ids];
}

// ---------- whole-home replace / clear (account sync) ----------
export async function replaceHome(rooms: Room[], history: HistoryEntry[]) {
  await kvSet("rooms", rooms);
  await kvSet("history", history);
  notify();
}

export async function clearHome() {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  notify();
}

// ---------- history ----------
export async function getHistory(): Promise<HistoryEntry[]> {
  return (await kvGet<HistoryEntry[]>("history")) ?? [];
}

export async function addHistory(entry: HistoryEntry) {
  const history = await getHistory();
  history.push(entry);
  await kvSet("history", history);
  if (entry.roomId) {
    const rooms = await getRooms();
    const room = rooms.find((r) => r.id === entry.roomId);
    if (room) {
      room.lastScore = entry.afterScore;
      await kvSet("rooms", rooms);
    }
  }
  notify();
}

// ---------- "how much does this need doing" ----------
/** A task counts as "due" (shown in plans and room cards) at this need level. */
export const DUE_AT = 0.8;

/** 0 = just done, 1 = due now, >1 = overdue. */
export function taskNeed(t: RoomTask, now: number): number {
  if (t.lastDoneAt === null) return 1.2;
  return (now - t.lastDoneAt) / (t.everyDays * DAY);
}

/** Effort points (1-3) based on how long a task takes. */
export function effortPoints(minutes: number): 1 | 2 | 3 {
  return minutes <= 2 ? 1 : minutes <= 5 ? 2 : 3;
}

export type NeedLevel = "fresh" | "soon" | "due" | "overdue";

export function needLevel(need: number): NeedLevel {
  if (need < 0.5) return "fresh";
  if (need < DUE_AT) return "soon";
  if (need < 1.3) return "due";
  return "overdue";
}

/** Freshness meter: 100 = fresh, 0 = needs love. */
export function roomFreshness(room: Room, now: number): number {
  if (room.tasks.length === 0) return 100;
  const avg = room.tasks.reduce((s, t) => s + Math.min(2, taskNeed(t, now)), 0) / room.tasks.length;
  return Math.round(Math.max(0, Math.min(100, 100 - (avg / 1.5) * 100)));
}

export interface PlannedStep {
  title: string;
  detail: string;
  minutes: number;
  category: Category;
  roomName?: string;
  taskId?: string;
}

/** Picks the most-needed tasks across the home that fit the time budget. */
export function buildDailyPlan(rooms: Room[], budgetMinutes: number, now: number): PlannedStep[] {
  const candidates = rooms
    .flatMap((room) => room.tasks.map((task) => ({ room, task, need: taskNeed(task, now) })))
    .filter((c) => c.need >= DUE_AT)
    .sort((a, b) => b.need - a.need);

  const plan: PlannedStep[] = [];
  let used = 0;
  for (const c of candidates) {
    if (used + c.task.minutes > budgetMinutes && plan.length > 0) continue;
    plan.push({
      title: c.task.title,
      detail: `${c.room.emoji} ${c.room.name}`,
      minutes: c.task.minutes,
      category: c.task.category,
      roomName: c.room.name,
      taskId: c.task.id,
    });
    used += c.task.minutes;
    if (used >= budgetMinutes) break;
  }
  // Group by room so the user walks around less.
  return plan.sort((a, b) => (a.roomName ?? "").localeCompare(b.roomName ?? ""));
}
