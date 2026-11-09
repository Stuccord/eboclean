import { accounts } from "./db";
import { WAITLIST_EVENT, WAITLIST_SPOT_EVENT, WAITLIST_UNSUB_EVENT } from "./waitlist";

// Server-only waitlist helpers (reads the events table). Keep out of client components.

export interface WaitlistMember {
  position: number;
  email: string;
  joinedAt: number;
  spot: string | null;
  ref: string | null;
  unsubscribed: boolean;
}

/** Everyone on the waitlist, oldest first (row order = position). */
export async function waitlistMembers(): Promise<WaitlistMember[]> {
  const db = accounts();
  const [joins, answers, unsubs] = await Promise.all([
    db.listEvents({ types: [WAITLIST_EVENT], limit: 50_000 }),
    db.listEvents({ types: [WAITLIST_SPOT_EVENT], limit: 50_000 }),
    db.listEvents({ types: [WAITLIST_UNSUB_EVENT], limit: 50_000 }),
  ]);
  const spotByEmail = new Map(answers.map((e) => [e.email, (e.meta?.spot as string | undefined) ?? null]));
  const unsubscribed = new Set(unsubs.map((e) => e.email));
  return joins
    .slice()
    .reverse()
    .filter((e) => e.email)
    .map((e, i) => ({
      position: i + 1,
      email: e.email as string,
      joinedAt: e.at,
      spot: (e.meta?.spot as string | null) ?? spotByEmail.get(e.email) ?? null,
      ref: (e.meta?.ref as string | null) ?? null,
      unsubscribed: unsubscribed.has(e.email),
    }));
}
