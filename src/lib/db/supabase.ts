import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AuthCodeError, SendLimitError, type AccountBackend, type Profile, type ProfilePatch, type UserData } from "./types";

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
}
