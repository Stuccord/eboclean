import { accounts, type AppEvent } from "./db";

// Records what happens in the app for the admin dashboard (/admin).
// Never throws: a logging problem must not break sign-in, scans or payments.

export type EventInput = Partial<Omit<AppEvent, "id" | "type" | "at">> & { at?: number };

export async function track(type: string, data: EventInput = {}) {
  try {
    await accounts().logEvent({
      at: data.at ?? Date.now(),
      type,
      userId: data.userId ?? null,
      email: data.email ?? null,
      amount: data.amount ?? null,
      currency: data.currency ?? null,
      meta: data.meta ?? null,
    });
  } catch (err) {
    console.error("Event log failed", type, err instanceof Error ? err.message : err);
  }
}
