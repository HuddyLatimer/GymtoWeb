-- =============================================
-- GYM-TO-WEB SYNC — Supabase Database Setup
-- Run this in your Supabase SQL Editor
-- =============================================

-- 1. PROFILES (extends auth.users)
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  role text not null check (role in ('trainer', 'client')),
  full_name text not null default '',
  email text not null default '',
  trainer_id uuid references public.profiles(id) on delete set null,
  has_paid boolean not null default false,
  stripe_customer_id text,
  invite_code text unique,
  created_at timestamptz not null default now()
);

-- 2. WORKOUT PLANS (trainer creates)
create table if not exists public.workout_plans (
  id uuid default gen_random_uuid() primary key,
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  day_of_week int, -- 0=Sun, 1=Mon, etc. nullable for any-day plans
  exercises jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. CLIENT WORKOUTS (plan assignments)
create table if not exists public.client_workouts (
  id uuid default gen_random_uuid() primary key,
  client_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid not null references public.workout_plans(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique(client_id, plan_id)
);

-- 4. WORKOUT LOGS (client tracks weights/completion)
create table if not exists public.workout_logs (
  id uuid default gen_random_uuid() primary key,
  client_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid not null references public.workout_plans(id) on delete cascade,
  exercise_index int not null,
  weight numeric,
  reps_done text,
  completed boolean not null default false,
  logged_at timestamptz not null default now()
);

-- 5. CHECKINS (weekly client check-ins)
create table if not exists public.checkins (
  id uuid default gen_random_uuid() primary key,
  client_id uuid not null references public.profiles(id) on delete cascade,
  energy text,
  sleep numeric,
  soreness text,
  bodyweight numeric,
  goal text,
  notes text,
  submitted_at timestamptz not null default now()
);

-- =============================================
-- INDEXES
-- =============================================
create index if not exists idx_profiles_trainer on public.profiles(trainer_id);
create index if not exists idx_profiles_invite on public.profiles(invite_code);
create index if not exists idx_plans_trainer on public.workout_plans(trainer_id);
create index if not exists idx_client_workouts_client on public.client_workouts(client_id);
create index if not exists idx_workout_logs_client on public.workout_logs(client_id);
create index if not exists idx_workout_logs_plan on public.workout_logs(plan_id);
create index if not exists idx_checkins_client on public.checkins(client_id);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
alter table public.profiles enable row level security;
alter table public.workout_plans enable row level security;
alter table public.client_workouts enable row level security;
alter table public.workout_logs enable row level security;
alter table public.checkins enable row level security;

-- PROFILES policies
create policy "Users can read own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "Trainers can read their clients"
  on public.profiles for select using (
    trainer_id = auth.uid()
  );

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

create policy "Service role can insert profiles"
  on public.profiles for insert with check (true);

-- Allow clients to read their trainer's profile
create policy "Clients can read their trainer"
  on public.profiles for select using (
    id = (select trainer_id from public.profiles where id = auth.uid())
  );

-- WORKOUT PLANS policies
create policy "Trainers can CRUD own plans"
  on public.workout_plans for all using (trainer_id = auth.uid());

create policy "Clients can read assigned plans"
  on public.workout_plans for select using (
    id in (select plan_id from public.client_workouts where client_id = auth.uid())
  );

-- CLIENT WORKOUTS policies
create policy "Trainers can manage assignments for their plans"
  on public.client_workouts for all using (
    plan_id in (select id from public.workout_plans where trainer_id = auth.uid())
  );

create policy "Clients can read own assignments"
  on public.client_workouts for select using (client_id = auth.uid());

-- WORKOUT LOGS policies
create policy "Clients can CRUD own logs"
  on public.workout_logs for all using (client_id = auth.uid());

create policy "Trainers can read client logs"
  on public.workout_logs for select using (
    client_id in (select id from public.profiles where trainer_id = auth.uid())
  );

-- CHECKINS policies
create policy "Clients can CRUD own checkins"
  on public.checkins for all using (client_id = auth.uid());

create policy "Trainers can read client checkins"
  on public.checkins for select using (
    client_id in (select id from public.profiles where trainer_id = auth.uid())
  );

-- =============================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- =============================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role, full_name, email, invite_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'trainer'),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.email, ''),
    case
      when coalesce(new.raw_user_meta_data->>'role', 'trainer') = 'trainer'
      then encode(gen_random_bytes(6), 'hex')
      else null
    end
  );
  return new;
end;
$$ language plpgsql security definer;

-- Drop trigger if exists and recreate
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =============================================
-- LINK CLIENT TO TRAINER (via invite code)
-- =============================================
create or replace function public.link_client_to_trainer(code text)
returns void as $$
declare
  trainer uuid;
begin
  select id into trainer from public.profiles where invite_code = code and role = 'trainer';
  if trainer is null then
    raise exception 'Invalid invite code';
  end if;
  update public.profiles set trainer_id = trainer where id = auth.uid();
end;
$$ language plpgsql security definer;
