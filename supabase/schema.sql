-- Eboclean database schema.
-- Run this once in your Supabase project: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Then create a PRIVATE storage bucket named "photos" (Storage -> New bucket, leave "Public" off).

-- One row per user: billing, trial, free-usage counters.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  paystack_customer_id bigint,
  paystack_customer_code text,
  trial_ends_at timestamptz,
  trial_used boolean not null default false,
  usage_scans integer not null default 0,
  usage_rooms integer not null default 0,
  ai_day text,
  ai_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- Added later: daily AI-use counter. Safe to run again on an existing database.
alter table public.profiles add column if not exists ai_day text;
alter table public.profiles add column if not exists ai_count integer not null default 0;
create index if not exists profiles_paystack_customer_idx on public.profiles (paystack_customer_id);
-- Added later: email opt-out for announcement emails.
alter table public.profiles add column if not exists email_opt_out boolean not null default false;

-- Everything that happens in the app (sign-ups, trials, scans, payments, emails), for the admin dashboard.
-- Not linked to auth.users on purpose: when an account is deleted its events stay as anonymous counts
-- (the app clears the email on them).
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  type text not null,
  user_id uuid,
  email text,
  amount bigint,
  currency text,
  meta jsonb
);
create index if not exists events_created_idx on public.events (created_at desc);
create index if not exists events_type_created_idx on public.events (type, created_at desc);
create index if not exists events_user_idx on public.events (user_id, created_at desc);
alter table public.events enable row level security;

-- One row per user: their home (rooms, tasks, history) and progress, synced from the app.
create table if not exists public.user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  rooms jsonb not null default '[]'::jsonb,
  history jsonb not null default '[]'::jsonb,
  progress jsonb,
  updated_at timestamptz not null default now()
);

-- Lock both tables down. The app only reads/writes them from the server with the
-- service role key, scoped to the signed-in user, so no client policies are needed.
alter table public.profiles enable row level security;
alter table public.user_data enable row level security;
