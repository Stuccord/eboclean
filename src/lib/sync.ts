// Client-side sync between this device (IndexedDB + localStorage) and the signed-in account.
import { loadProgress, replaceProgress, type Progress } from "./progress";
import { cachePhoto, clearHome, getHistory, getPhoto, getRooms, referencedPhotoIds, replaceHome, type HistoryEntry, type Room } from "./store";

const uploadedKey = (uid: string) => `clean-sweep-uploaded-${uid}`;

function uploadedSet(uid: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(uploadedKey(uid)) ?? "[]"));
  } catch {
    return new Set();
  }
}

function saveUploaded(uid: string, set: Set<string>) {
  localStorage.setItem(uploadedKey(uid), JSON.stringify([...set]));
}

let suppressPush = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let pushing: Promise<void> | null = null;

async function uploadMissingPhotos(uid: string, rooms: Room[], history: HistoryEntry[]) {
  const done = uploadedSet(uid);
  for (const id of referencedPhotoIds(rooms, history)) {
    if (done.has(id)) continue;
    const dataUrl = await getPhoto(id);
    if (!dataUrl) continue;
    const res = await fetch(`/api/photos/${id}`, { method: "PUT", body: dataUrl });
    if (res.ok) {
      done.add(id);
      saveUploaded(uid, done);
    }
  }
}

/** Uploads everything on this device to the account right now. */
export async function pushNow(uid: string) {
  if (pushing) await pushing;
  pushing = (async () => {
    const [rooms, history] = await Promise.all([getRooms(), getHistory()]);
    const progress = loadProgress();
    const res = await fetch("/api/sync", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rooms, history, progress }),
    });
    if (res.ok) await uploadMissingPhotos(uid, rooms, history);
  })().finally(() => {
    pushing = null;
  });
  return pushing;
}

/** Debounced upload after local changes. */
export function pushSoon(uid: string) {
  if (suppressPush) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    pushNow(uid).catch(() => {
      // offline: the next change will retry
    });
  }, 1500);
}

/**
 * First sync after signing in:
 * - empty account  -> upload this device's data
 * - account has data -> download it here (replacing this device's copy)
 */
export async function syncAfterSignIn(uid: string): Promise<"uploaded" | "downloaded"> {
  const res = await fetch("/api/sync", { cache: "no-store" });
  if (!res.ok) throw new Error("Couldn't load your account data.");
  const remote = (await res.json()) as { rooms: Room[]; history: HistoryEntry[]; progress: Progress | null; updatedAt: number };

  const hasRemote = remote.updatedAt > 0 && (remote.rooms.length > 0 || remote.history.length > 0 || remote.progress);
  if (!hasRemote) {
    await pushNow(uid);
    return "uploaded";
  }

  suppressPush = true;
  try {
    await replaceHome(remote.rooms, remote.history);
    replaceProgress(remote.progress);
    // Photos referenced by the account already live there.
    saveUploaded(uid, new Set(referencedPhotoIds(remote.rooms, remote.history)));
  } finally {
    // Let the change events from the replace settle before pushes resume.
    setTimeout(() => {
      suppressPush = false;
    }, 50);
  }
  return "downloaded";
}

/** Downloads a photo from the account if this device doesn't have it yet. */
export async function fetchAccountPhoto(id: string): Promise<string | null> {
  const res = await fetch(`/api/photos/${id}`);
  if (!res.ok) return null;
  const blob = await res.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  await cachePhoto(id, dataUrl);
  return dataUrl;
}

/** Signing out removes this account's data from the device (it stays safe in the account). */
export async function clearDeviceData() {
  if (timer) clearTimeout(timer);
  suppressPush = true;
  try {
    await clearHome();
    replaceProgress(null);
  } finally {
    setTimeout(() => {
      suppressPush = false;
    }, 50);
  }
}
