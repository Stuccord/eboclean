import { LocalBackend } from "./local";
import { SupabaseBackend } from "./supabase";
import type { AccountBackend } from "./types";

export * from "./types";

let backend: AccountBackend | null = null;

/** True when sign-in works here (Supabase, or the local demo store outside production). */
export function accountsAvailable() {
  const supabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);
  return supabase || process.env.NODE_ENV !== "production" || process.env.ALLOW_DEMO_ACCOUNTS === "1";
}

/** Supabase when configured, otherwise the local demo store. */
export function accounts(): AccountBackend {
  if (backend) return backend;
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && anon && service) {
    backend = new SupabaseBackend(url, anon, service);
  } else {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_ACCOUNTS !== "1") {
      throw new Error("Supabase is not configured. Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.");
    }
    backend = new LocalBackend();
  }
  return backend;
}
