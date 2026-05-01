-- ============================================================================
-- Survivor GO — database schema (future Supabase persistence)
-- ============================================================================
-- This file prepares tables, RLS, and triggers for a later migration from
-- client-side localStorage game state. The app currently continues to use
-- localStorage only; nothing in this migration wires the game loop to Supabase.
-- Apply manually in the Supabase SQL editor or via `supabase db push` when ready.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions (UUID generation for defaults)
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- updated_at helper (reusable)
-- ----------------------------------------------------------------------------
create or replace function public.survivor_go_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.survivor_go_set_updated_at() is
  'Sets updated_at to now() before row update; used by player_state and tribe_challenges.';

-- ============================================================================
-- 1. profiles
-- ============================================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

comment on table public.profiles is
  'Player-facing profile row; one row per auth user when persistence migrates from localStorage.';

create index profiles_display_name_idx on public.profiles (display_name)
  where display_name is not null;

-- ============================================================================
-- 2. player_state
-- ============================================================================
create table public.player_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  energy int not null default 100,
  food int not null default 0,
  water int not null default 0,
  materials int not null default 0,
  coins int not null default 0,
  idols int not null default 0,
  clues int not null default 0,
  xp int not null default 0,
  level int not null default 1,
  daily_streak int not null default 0,
  last_played_date date,
  achievements text[] not null default '{}',
  bag jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  unique (user_id)
);

comment on table public.player_state is
  'Canonical numeric stats + bag JSON (mirrors GameState / BagItem shape for future sync).';

create trigger player_state_set_updated_at
  before update on public.player_state
  for each row
  execute function public.survivor_go_set_updated_at();

create index player_state_user_id_idx on public.player_state (user_id);

-- ============================================================================
-- 3. tribes
-- ============================================================================
create table public.tribes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

comment on table public.tribes is
  'Tribe headers; member rows live in tribe_members.';

create index tribes_created_by_idx on public.tribes (created_by);

-- ============================================================================
-- 4. tribe_members
-- ============================================================================
create table public.tribe_members (
  id uuid primary key default gen_random_uuid(),
  tribe_id uuid not null references public.tribes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  unique (tribe_id, user_id)
);

comment on table public.tribe_members is
  'Many-to-many between users and tribes with optional role.';

create index tribe_members_tribe_id_idx on public.tribe_members (tribe_id);
create index tribe_members_user_id_idx on public.tribe_members (user_id);

-- ============================================================================
-- 5. tribe_challenges
-- ============================================================================
create table public.tribe_challenges (
  id uuid primary key default gen_random_uuid(),
  tribe_id uuid not null references public.tribes (id) on delete cascade,
  challenge_name text not null,
  goal_type text not null,
  target_amount int not null,
  contributed_amount int not null default 0,
  completed boolean not null default false,
  reward_coins int not null default 0,
  reward_claimed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tribe_challenges is
  'Weekly-style tribe goals; aligns with TribeChallengeState when synced from localStorage.';

create trigger tribe_challenges_set_updated_at
  before update on public.tribe_challenges
  for each row
  execute function public.survivor_go_set_updated_at();

create index tribe_challenges_tribe_id_idx on public.tribe_challenges (tribe_id);

-- ============================================================================
-- 6. map_items
-- ============================================================================
create table public.map_items (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  item_type text not null,
  variant text not null,
  rarity text not null,
  lat double precision not null,
  lng double precision not null,
  collected boolean not null default false,
  collected_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.map_items is
  'Per-user spawned map pickups; mirrors MapItem fields for future island sync.';

create index map_items_owner_user_id_idx on public.map_items (owner_user_id);
create index map_items_collected_idx on public.map_items (collected);
create index map_items_expires_at_idx on public.map_items (expires_at);

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.player_state enable row level security;
alter table public.tribes enable row level security;
alter table public.tribe_members enable row level security;
alter table public.tribe_challenges enable row level security;
alter table public.map_items enable row level security;

-- profiles
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- player_state
create policy "player_state_select_own"
  on public.player_state for select
  to authenticated
  using (user_id = auth.uid());

create policy "player_state_insert_own"
  on public.player_state for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "player_state_update_own"
  on public.player_state for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- tribes
create policy "tribes_select_authenticated"
  on public.tribes for select
  to authenticated
  using (true);

create policy "tribes_insert_authenticated"
  on public.tribes for insert
  to authenticated
  with check (created_by = auth.uid());

-- tribe_members
create policy "tribe_members_select_own_memberships"
  on public.tribe_members for select
  to authenticated
  using (user_id = auth.uid());

create policy "tribe_members_insert_self"
  on public.tribe_members for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "tribe_members_delete_own"
  on public.tribe_members for delete
  to authenticated
  using (user_id = auth.uid());

-- tribe_challenges
create policy "tribe_challenges_select_for_members"
  on public.tribe_challenges for select
  to authenticated
  using (
    exists (
      select 1
      from public.tribe_members tm
      where tm.tribe_id = tribe_challenges.tribe_id
        and tm.user_id = auth.uid()
    )
  );

create policy "tribe_challenges_update_for_members"
  on public.tribe_challenges for update
  to authenticated
  using (
    exists (
      select 1
      from public.tribe_members tm
      where tm.tribe_id = tribe_challenges.tribe_id
        and tm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.tribe_members tm
      where tm.tribe_id = tribe_challenges.tribe_id
        and tm.user_id = auth.uid()
    )
  );

-- map_items
create policy "map_items_select_own"
  on public.map_items for select
  to authenticated
  using (owner_user_id = auth.uid());

create policy "map_items_insert_own"
  on public.map_items for insert
  to authenticated
  with check (owner_user_id = auth.uid());

create policy "map_items_update_own"
  on public.map_items for update
  to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());
