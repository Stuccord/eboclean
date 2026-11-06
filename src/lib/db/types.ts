// Shared shapes for the account backends (Supabase in production, a local file in demo).

export interface Profile {
  id: string;
  email: string;
  paystackCustomerId: number | null;
  paystackCustomerCode: string | null;
  trialEndsAt: number | null; // ms since epoch
  trialUsed: boolean;
  usageScans: number;
  usageRooms: number;
  /** Daily AI-use counter (UTC day "YYYY-MM-DD"), caps cost even for Pro. */
  aiDay: string | null;
  aiCount: number;
  /** When the account was created (ms since epoch), if known. */
  createdAt?: number | null;
  /** Opted out of announcement emails (billing notices still go out). */
  emailOptOut?: boolean;
}

/** One thing that happened in the app, for the admin dashboard. Amounts are in the smallest currency unit. */
export interface AppEvent {
  id?: string;
  at: number; // ms since epoch
  type: string;
  userId: string | null;
  email: string | null;
  amount: number | null;
  currency: string | null;
  meta: Record<string, unknown> | null;
}

export interface EventQuery {
  since?: number;
  userId?: string;
  types?: string[];
  /** Matches types starting with this, e.g. "ai." */
  typePrefix?: string;
  limit?: number;
}

/** A profile plus when the user last synced data, for the admin user list. */
export interface AdminProfile extends Profile {
  lastActiveAt: number | null;
}

export type ProfilePatch = Partial<Omit<Profile, "id" | "email">>;

export interface UserData {
  rooms: unknown[];
  history: unknown[];
  progress: unknown | null;
  updatedAt: number; // ms since epoch, 0 if never saved
}

export interface AccountBackend {
  readonly kind: "supabase" | "local";
  /** Emails a 6-digit sign-in code. The local backend returns the code so it can be shown. */
  sendCode(email: string): Promise<{ devCode?: string }>;
  /** Checks the code; returns the user (created on first sign-in). Throws AuthCodeError if wrong. */
  verifyCode(email: string, code: string): Promise<{ id: string; email: string }>;
  getProfile(userId: string, email: string): Promise<Profile>;
  updateProfile(userId: string, patch: ProfilePatch): Promise<void>;
  getData(userId: string): Promise<UserData>;
  putData(userId: string, data: Omit<UserData, "updatedAt">): Promise<number>;
  putPhoto(userId: string, photoId: string, bytes: Buffer, contentType: string): Promise<void>;
  getPhoto(userId: string, photoId: string): Promise<{ bytes: Buffer; contentType: string } | null>;
  /** Finds the account linked to a Paystack customer (used by the webhook). */
  findByPaystackCustomer(customerId: number): Promise<Profile | null>;
  /** Atomically marks the free trial as used. Returns false if it was already used. */
  claimTrial(userId: string): Promise<boolean>;
  /** Permanently deletes the user, their profile, synced data and photos. */
  deleteAccount(userId: string): Promise<void>;

  // ---- admin dashboard ----
  logEvent(event: Omit<AppEvent, "id">): Promise<void>;
  /** Newest first. */
  listEvents(query: EventQuery): Promise<AppEvent[]>;
  listProfiles(): Promise<AdminProfile[]>;
  findProfile(userId: string): Promise<AdminProfile | null>;
}

export class AuthCodeError extends Error {}

/** Too many codes requested; `retryAfter` is in seconds. */
export class SendLimitError extends Error {
  constructor(
    message: string,
    public retryAfter: number,
  ) {
    super(message);
  }
}
