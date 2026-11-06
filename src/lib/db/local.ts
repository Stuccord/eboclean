import { createHash, randomInt, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { AuthCodeError, type AccountBackend, type Profile, type ProfilePatch, type UserData } from "./types";

// Demo backend: stores accounts in a JSON file and photos in a folder on this computer,
// and shows sign-in codes on screen instead of emailing them. For local testing only;
// it won't keep data on hosts like Vercel. Connect Supabase for real users.

const DIR = path.join(process.cwd(), ".data");
const DB_FILE = path.join(DIR, "dev-db.json");
const PHOTO_DIR = path.join(DIR, "photos");
const CODE_TTL_MS = 10 * 60_000;

interface DevDb {
  users: Record<string, { id: string; email: string }>; // keyed by email
  profiles: Record<string, Profile>;
  data: Record<string, UserData>;
  codes: Record<string, { hash: string; expires: number; tries: number }>;
}

function hashCode(email: string, code: string) {
  return createHash("sha256").update(`${email}:${code}`).digest("hex");
}

// Serialize writes so concurrent requests don't clobber the file.
let queue: Promise<unknown> = Promise.resolve();
function withDb<T>(fn: (db: DevDb) => T | Promise<T>, write = false): Promise<T> {
  const run = queue.then(async () => {
    let db: DevDb;
    try {
      db = JSON.parse(await readFile(DB_FILE, "utf8")) as DevDb;
    } catch {
      db = { users: {}, profiles: {}, data: {}, codes: {} };
    }
    const result = await fn(db);
    if (write) {
      await mkdir(DIR, { recursive: true });
      await writeFile(DB_FILE, JSON.stringify(db, null, 2));
    }
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

function safeId(id: string) {
  if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) throw new Error("Bad id");
  return id;
}

export class LocalBackend implements AccountBackend {
  readonly kind = "local" as const;

  sendCode(email: string) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    return withDb((db) => {
      db.codes[email] = { hash: hashCode(email, code), expires: Date.now() + CODE_TTL_MS, tries: 0 };
      return { devCode: code };
    }, true);
  }

  verifyCode(email: string, code: string) {
    return withDb((db) => {
      const entry = db.codes[email];
      if (!entry || entry.expires < Date.now() || entry.tries >= 5) {
        delete db.codes[email];
        throw new AuthCodeError("That code has expired. Request a new one.");
      }
      if (entry.hash !== hashCode(email, code)) {
        entry.tries += 1;
        throw new AuthCodeError("That code didn't work. Check it or request a new one.");
      }
      delete db.codes[email];
      db.users[email] ??= { id: randomUUID(), email };
      return db.users[email];
    }, true);
  }

  getProfile(userId: string, email: string) {
    return withDb((db) => {
      db.profiles[userId] ??= {
        id: userId,
        email,
        paystackCustomerId: null,
        paystackCustomerCode: null,
        trialEndsAt: null,
        trialUsed: false,
        usageScans: 0,
        usageRooms: 0,
        aiDay: null,
        aiCount: 0,
      };
      const p = db.profiles[userId];
      return { ...p, aiDay: p.aiDay ?? null, aiCount: p.aiCount ?? 0 };
    }, true);
  }

  updateProfile(userId: string, patch: ProfilePatch) {
    return withDb((db) => {
      if (db.profiles[userId]) Object.assign(db.profiles[userId], patch);
    }, true);
  }

  getData(userId: string) {
    return withDb((db) => db.data[userId] ?? { rooms: [], history: [], progress: null, updatedAt: 0 });
  }

  putData(userId: string, d: Omit<UserData, "updatedAt">) {
    return withDb((db) => {
      const updatedAt = Date.now();
      db.data[userId] = { ...d, updatedAt };
      return updatedAt;
    }, true);
  }

  async putPhoto(userId: string, photoId: string, bytes: Buffer, contentType: string) {
    const dir = path.join(PHOTO_DIR, safeId(userId));
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, safeId(photoId)), bytes);
    await writeFile(path.join(dir, `${safeId(photoId)}.type`), contentType);
  }

  async getPhoto(userId: string, photoId: string) {
    const dir = path.join(PHOTO_DIR, safeId(userId));
    try {
      const [bytes, contentType] = await Promise.all([
        readFile(path.join(dir, safeId(photoId))),
        readFile(path.join(dir, `${safeId(photoId)}.type`), "utf8").catch(() => "image/jpeg"),
      ]);
      return { bytes, contentType };
    } catch {
      return null;
    }
  }

  findByPaystackCustomer(customerId: number) {
    return withDb((db) => Object.values(db.profiles).find((p) => p.paystackCustomerId === customerId) ?? null);
  }

  claimTrial(userId: string) {
    return withDb((db) => {
      const p = db.profiles[userId];
      if (!p || p.trialUsed) return false;
      p.trialUsed = true;
      return true;
    }, true);
  }

  async deleteAccount(userId: string) {
    await withDb((db) => {
      const email = db.profiles[userId]?.email ?? Object.values(db.users).find((u) => u.id === userId)?.email;
      delete db.profiles[userId];
      delete db.data[userId];
      if (email) delete db.users[email];
    }, true);
    await rm(path.join(PHOTO_DIR, safeId(userId)), { recursive: true, force: true });
  }
}
