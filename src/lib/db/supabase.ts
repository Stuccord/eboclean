import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  AuthCodeError,
  SendLimitError,
  type AccountBackend,
  type AdminProfile,
  type AppEvent,
  type EventQuery,
  type Profile,
  type ProfilePatch,
  type UserData,
} from "./types";

// Production backend: Supabase Auth (email codes), Postgres tables and a private Storage bucket.
// Everything runs on the server. The service role key never reaches the browser.

const BUCKET = "photos";

interface ProfileRow {
  id: string;
  email: string;
  paystack_customer_id: number | null;
  paystack_customer_code: string | null;
  trial_ends_at: string | null;
  trial_used: boolean;
  usage_scans: number;
  usage_rooms: number;
  ai_day?: string | null;
  ai_count?: number | null;
  created_at?: string | null;
  email_opt_out?: boolean | null;
}

interface EventRow {
  id: string;
  created_at: string;
  type: string;
  user_id: string | null;
  email: string | null;
  amount: number | null;
  currency: string | null;
  meta: Record<string, unknown> | null;
}

const PAGE = 1000;

function toEvent(r: EventRow): AppEvent {
  return {
    id: r.id,
    at: Date.parse(r.created_at),
    type: r.type,
    userId: r.user_id,
    email: r.email,
    amount: r.amount,
    currency: r.currency,
    meta: r.meta,
  };
}

function toProfile(r: ProfileRow): Profile {
  return {
    id: r.id,
    email: r.email,
    paystackCustomerId: r.paystack_customer_id,
    paystackCustomerCode: r.paystack_customer_code,
    trialEndsAt: r.trial_ends_at ? Date.parse(r.trial_ends_at) : null,
    trialUsed: r.trial_used,
    usageScans: r.usage_scans,
    usageRooms: r.usage_rooms,
    aiDay: r.ai_day ?? null,
    aiCount: r.ai_count ?? 0,
    createdAt: r.created_at ? Date.parse(r.created_at) : null,
    emailOptOut: Boolean(r.email_opt_out),
  };
}

function toRow(patch: ProfilePatch): Partial<ProfileRow> {
  const row: Partial<ProfileRow> = {};
  if (patch.paystackCustomerId !== undefined) row.paystack_customer_id = patch.paystackCustomerId;
  if (patch.paystackCustomerCode !== undefined) row.paystack_customer_code = patch.paystackCustomerCode;
  if (patch.trialEndsAt !== undefined) row.trial_ends_at = patch.trialEndsAt ? new Date(patch.trialEndsAt).toISOString() : null;
  if (patch.trialUsed !== undefined) row.trial_used = patch.trialUsed;
  if (patch.usageScans !== undefined) row.usage_scans = patch.usageScans;
  if (patch.usageRooms !== undefined) row.usage_rooms = patch.usageRooms;
  if (patch.aiDay !== undefined) row.ai_day = patch.aiDay;
  if (patch.aiCount !== undefined) row.ai_count = patch.aiCount;
  if (patch.emailOptOut !== undefined) row.email_opt_out = patch.emailOptOut;
  return row;
}

export class SupabaseBackend implements AccountBackend {
  readonly kind = "supabase" as const;
  private admin: SupabaseClient;
  private url: string;
  private anonKey: string;

  constructor(url: string, anonKey: string, serviceKey: string) {
    this.url = url;
    this.anonKey = anonKey;
    this.admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  // A fresh, stateless auth client per request (no shared session between users).
  private authClient() {
    return createClient(this.url, this.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async sendCode(email: string) {
    const { error } = await this.authClient().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) {
      const wait = error.message.match(/after (\d+) seconds?/i);
      if (wait) throw new SendLimitError(`Please wait ${wait[1]} seconds before asking for another code.`, Number(wait[1]));
      if (/rate limit/i.test(error.message) || error.status === 429) {
        throw new SendLimitError("Too many codes were requested. Please wait a few minutes and try again.", 300);
      }
      throw new Error(`Supabase signInWithOtp failed: ${error.message}`);
    }
    return {};
  }

  async verifyCode(email: string, code: string) {
    const { data, error } = await this.authClient().auth.verifyOtp({ email, token: code, type: "email" });
    if (error || !data.user) throw new AuthCodeError("That code didn't work. Check it or request a new one.");
    return { id: data.user.id, email: data.user.email ?? email };
  }

  async getProfile(userId: string, email: string): Promise<Profile> {
    const { data, error } = await this.admin.from("profiles").select("*").eq("id", userId).maybeSingle<ProfileRow>();
    if (error) throw new Error(`Load profile failed: ${error.message}`);
    if (data) return toProfile(data);
    const { data: created, error: insErr } = await this.admin
      .from("profiles")
      .insert({ id: userId, email })
      .select("*")
      .single<ProfileRow>();
    if (insErr) throw new Error(`Create profile failed: ${insErr.message}`);
    await this.logEvent({ at: Date.now(), type: "user.signup", userId, email, amount: null, currency: null, meta: null }).catch(() => undefined);
    return toProfile(created);
  }

  async updateProfile(userId: string, patch: ProfilePatch) {
    const { error } = await this.admin.from("profiles").update(toRow(patch)).eq("id", userId);
    if (error) throw new Error(`Update profile failed: ${error.message}`);
  }

  async getData(userId: string): Promise<UserData> {
    const { data, error } = await this.admin
      .from("user_data")
      .select("rooms, history, progress, updated_at")
      .eq("user_id", userId)
      .maybeSingle<{ rooms: unknown[]; history: unknown[]; progress: unknown; updated_at: string }>();
    if (error) throw new Error(`Load data failed: ${error.message}`);
    if (!data) return { rooms: [], history: [], progress: null, updatedAt: 0 };
    return { rooms: data.rooms, history: data.history, progress: data.progress, updatedAt: Date.parse(data.updated_at) };
  }

  async putData(userId: string, d: Omit<UserData, "updatedAt">) {
    const now = new Date();
    const { error } = await this.admin
      .from("user_data")
      .upsert({ user_id: userId, rooms: d.rooms, history: d.history, progress: d.progress, updated_at: now.toISOString() });
    if (error) throw new Error(`Save data failed: ${error.message}`);
    return now.getTime();
  }

  async putPhoto(userId: string, photoId: string, bytes: Buffer, contentType: string) {
    const { error } = await this.admin.storage.from(BUCKET).upload(`${userId}/${photoId}`, bytes, { contentType, upsert: true });
    if (error) throw new Error(`Photo upload failed: ${error.message}`);
  }

  async getPhoto(userId: string, photoId: string) {
    const { data, error } = await this.admin.storage.from(BUCKET).download(`${userId}/${photoId}`);
    if (error || !data) return null;
    return { bytes: Buffer.from(await data.arrayBuffer()), contentType: data.type || "image/jpeg" };
  }

  async findByPaystackCustomer(customerId: number) {
    const { data, error } = await this.admin.from("profiles").select("*").eq("paystack_customer_id", customerId).maybeSingle<ProfileRow>();
    if (error) throw new Error(`Find profile failed: ${error.message}`);
    return data ? toProfile(data) : null;
  }

  async claimTrial(userId: string) {
    const { data, error } = await this.admin
      .from("profiles")
      .update({ trial_used: true })
      .eq("id", userId)
      .eq("trial_used", false)
      .select("id");
    if (error) throw new Error(`Claim trial failed: ${error.message}`);
    return (data?.length ?? 0) > 0;
  }

  async deleteAccount(userId: string) {
    // Photos first (storage isn't covered by the database cascade), in pages of 1000.
    for (;;) {
      const { data: files, error } = await this.admin.storage.from(BUCKET).list(userId, { limit: 1000 });
      if (error) throw new Error(`List photos failed: ${error.message}`);
      if (!files?.length) break;
      const { error: rmErr } = await this.admin.storage.from(BUCKET).remove(files.map((f) => `${userId}/${f.name}`));
      if (rmErr) throw new Error(`Delete photos failed: ${rmErr.message}`);
      if (files.length < 1000) break;
    }
    // Deleting the auth user cascades to profiles and user_data.
    const { error } = await this.admin.auth.admin.deleteUser(userId);
    if (error) throw new Error(`Delete user failed: ${error.message}`);
    // Keep anonymous activity counts, but forget who it was.
    await this.admin.from("events").update({ email: null }).eq("user_id", userId);
  }

  async logEvent(e: Omit<AppEvent, "id">) {
    const { error } = await this.admin.from("events").insert({
      created_at: new Date(e.at).toISOString(),
      type: e.type,
      user_id: e.userId,
      email: e.email,
      amount: e.amount,
      currency: e.currency,
      meta: e.meta,
    });
    if (error) throw new Error(`Log event failed: ${error.message}`);
  }

  async listEvents(q: EventQuery) {
    const limit = Math.min(q.limit ?? 500, 50_000);
    const out: AppEvent[] = [];
    for (let from = 0; from < limit; from += PAGE) {
      let query = this.admin.from("events").select("*").order("created_at", { ascending: false });
      if (q.since) query = query.gte("created_at", new Date(q.since).toISOString());
      if (q.userId) query = query.eq("user_id", q.userId);
      if (q.types?.length) query = query.in("type", q.types);
      if (q.typePrefix) query = query.like("type", `${q.typePrefix}%`);
      const to = Math.min(from + PAGE, limit) - 1;
      const { data, error } = await query.range(from, to).returns<EventRow[]>();
      if (error) throw new Error(`List events failed: ${error.message}`);
      out.push(...(data ?? []).map(toEvent));
      if (!data || data.length < to - from + 1) break;
    }
    return out;
  }

  async listProfiles() {
    const rows: ProfileRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.admin
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1)
        .returns<ProfileRow[]>();
      if (error) throw new Error(`List profiles failed: ${error.message}`);
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    const active = new Map<string, number>();
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.admin
        .from("user_data")
        .select("user_id, updated_at")
        .range(from, from + PAGE - 1)
        .returns<{ user_id: string; updated_at: string }[]>();
      if (error) throw new Error(`List activity failed: ${error.message}`);
      for (const d of data ?? []) active.set(d.user_id, Date.parse(d.updated_at));
      if (!data || data.length < PAGE) break;
    }
    return rows.map((r): AdminProfile => ({ ...toProfile(r), lastActiveAt: active.get(r.id) ?? null }));
  }

  async findProfile(userId: string) {
    const { data, error } = await this.admin.from("profiles").select("*").eq("id", userId).maybeSingle<ProfileRow>();
    if (error) throw new Error(`Load profile failed: ${error.message}`);
    if (!data) return null;
    const { data: ud } = await this.admin.from("user_data").select("updated_at").eq("user_id", userId).maybeSingle<{ updated_at: string }>();
    return { ...toProfile(data), lastActiveAt: ud ? Date.parse(ud.updated_at) : null };
  }
}
