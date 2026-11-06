-- Clean Sweep database schema.
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
  created_at timestamptz not null default now()
);

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
