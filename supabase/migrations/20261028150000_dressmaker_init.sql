-- dressmaker.ai initial schema: profiles, plans, generations (queue + results),
-- favourites, storage buckets and row level security.

-- ---------------------------------------------------------------------------
-- Plans
-- ---------------------------------------------------------------------------
create table if not exists public.plans (
  id text primary key,
  name text not null,
  monthly_credits integer not null,
  price_eur numeric(8,2) not null default 0,
  max_priority integer not null default 0,
  allow_video boolean not null default false,
  sort_order integer not null default 0
);

insert into public.plans (id, name, monthly_credits, price_eur, max_priority, allow_video, sort_order) values
  ('free',    'Free',    20,   0,     0, false, 0),
  ('creator', 'Creator', 400,  9.99,  1, true,  1),
  ('studio',  'Studio',  2000, 29.99, 2, true,  2)
on conflict (id) do update set
  name = excluded.name,
  monthly_credits = excluded.monthly_credits,
  price_eur = excluded.price_eur,
  max_priority = excluded.max_priority,
  allow_video = excluded.allow_video,
  sort_order = excluded.sort_order;

alter table public.plans enable row level security;
drop policy if exists "plans are readable by everyone" on public.plans;
create policy "plans are readable by everyone" on public.plans for select using (true);

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  plan_id text not null default 'free' references public.plans (id),
  credits integer not null default 20,
  credits_reset_at timestamptz not null default (now() + interval '30 days'),
  stripe_customer_id text,
  stripe_subscription_id text,
  accepted_policy_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile" on public.profiles
  for select using ((select auth.uid()) = id);
drop policy if exists "users update own display fields" on public.profiles;
create policy "users update own display fields" on public.profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Users may only change cosmetic columns themselves; plan/credits/stripe are
-- server-managed (the service role is not restricted by this trigger).
-- security invoker on purpose: current_user must be the caller's role.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.plan_id := old.plan_id;
    new.credits := old.credits;
    new.credits_reset_at := old.credits_reset_at;
    new.stripe_customer_id := old.stripe_customer_id;
    new.stripe_subscription_id := old.stripe_subscription_id;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_columns on public.profiles;
create trigger protect_profile_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Generations: the queue and the stored results in one table
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.generation_status as enum ('queued', 'processing', 'completed', 'failed', 'canceled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.generation_kind as enum ('image', 'video');
exception when duplicate_object then null; end $$;

create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.generation_kind not null default 'image',
  prompt text not null check (char_length(prompt) between 3 and 2000),
  negative_prompt text,
  style text,
  aspect_ratio text not null default '3:4',
  input_path text,
  output_path text,
  thumbnail_path text,
  status public.generation_status not null default 'queued',
  priority integer not null default 0,
  cost integer not null default 1,
  error text,
  provider text,
  provider_job_id text,
  is_public boolean not null default false,
  likes integer not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists generations_user_created_idx on public.generations (user_id, created_at desc);
create index if not exists generations_queue_idx on public.generations (status, priority desc, created_at)
  where status in ('queued', 'processing');
create index if not exists generations_public_idx on public.generations (created_at desc)
  where is_public and status = 'completed';

alter table public.generations enable row level security;

drop policy if exists "users read own or public generations" on public.generations;
create policy "users read own or public generations" on public.generations
  for select using (
    (select auth.uid()) = user_id
    or (is_public and status = 'completed')
  );

-- Inserts go through the API (service role) so credits and policy checks
-- cannot be skipped. Users may toggle is_public or delete their own rows.
drop policy if exists "users update own generations" on public.generations;
create policy "users update own generations" on public.generations
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "users delete own generations" on public.generations;
create policy "users delete own generations" on public.generations
  for delete using ((select auth.uid()) = user_id);

-- security invoker on purpose: current_user must be the caller's role.
create or replace function public.protect_generation_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  wants_public boolean := new.is_public;
begin
  if current_user in ('authenticated', 'anon') then
    new := old;
    new.is_public := wants_public;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_generation_columns on public.generations;
create trigger protect_generation_columns
  before update on public.generations
  for each row execute function public.protect_generation_columns();

-- Queue position of a job (1 = next to run). Visible only for own jobs.
create or replace function public.queue_position(job_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when g.status <> 'queued' then 0 else (
    select count(*)::int from public.generations q
    where q.status = 'queued'
      and (q.priority > g.priority or (q.priority = g.priority and q.created_at <= g.created_at))
  ) end
  from public.generations g
  where g.id = job_id and g.user_id = (select auth.uid());
$$;

-- Atomically claim the next queued jobs for the worker (service role only).
create or replace function public.claim_generations(max_jobs integer)
returns setof public.generations
language plpgsql
security definer
set search_path = ''
as $$
declare
  running integer;
begin
  select count(*) into running from public.generations where status = 'processing';
  if running >= max_jobs then
    return;
  end if;
  return query
  update public.generations g
     set status = 'processing', started_at = now()
   where g.id in (
     select id from public.generations
      where status = 'queued'
      order by priority desc, created_at
      limit (max_jobs - running)
      for update skip locked
   )
  returning g.*;
end;
$$;

revoke all on function public.claim_generations(integer) from public, anon, authenticated;

-- Spend credits atomically; returns remaining credits or raises.
create or replace function public.spend_credits(uid uuid, amount integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining integer;
begin
  -- monthly refill
  update public.profiles p
     set credits = pl.monthly_credits,
         credits_reset_at = now() + interval '30 days'
    from public.plans pl
   where p.id = uid and pl.id = p.plan_id and p.credits_reset_at < now();

  update public.profiles
     set credits = credits - amount
   where id = uid and credits >= amount
  returning credits into remaining;

  if remaining is null then
    raise exception 'insufficient_credits';
  end if;
  return remaining;
end;
$$;

revoke all on function public.spend_credits(uuid, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Favourites ("My AI" collection of liked creations)
-- ---------------------------------------------------------------------------
create table if not exists public.favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  generation_id uuid not null references public.generations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, generation_id)
);

alter table public.favorites enable row level security;
drop policy if exists "users manage own favorites" on public.favorites;
create policy "users manage own favorites" on public.favorites
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Saved style presets ("My AI")
-- ---------------------------------------------------------------------------
create table if not exists public.style_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  prompt text not null,
  negative_prompt text,
  style text,
  created_at timestamptz not null default now()
);

alter table public.style_presets enable row level security;
drop policy if exists "users manage own presets" on public.style_presets;
create policy "users manage own presets" on public.style_presets
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Storage: private buckets, one folder per user (<uid>/<file>)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('inputs',  'inputs',  false, 10485760, array['image/png', 'image/jpeg', 'image/webp']),
  ('outputs', 'outputs', false, 104857600, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'video/mp4', 'video/webm'])
on conflict (id) do nothing;

drop policy if exists "users upload own inputs" on storage.objects;
create policy "users upload own inputs" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'inputs' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "users read own files" on storage.objects;
create policy "users read own files" on storage.objects
  for select to authenticated
  using (bucket_id in ('inputs', 'outputs') and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "users delete own files" on storage.objects;
create policy "users delete own files" on storage.objects
  for delete to authenticated
  using (bucket_id in ('inputs', 'outputs') and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Realtime updates for the queue view
do $$ begin
  alter publication supabase_realtime add table public.generations;
exception when others then null; end $$;
