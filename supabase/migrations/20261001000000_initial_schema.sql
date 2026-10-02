-- =============================================================================
-- Trip Split — initial schema
--
-- Design notes
--   * Money is stored as integer paise (bigint). Never numeric/float.
--   * Balances and settlements are NOT stored. They are derived from
--     expenses + expense_participants on every read.
--   * Clients can only READ tables (RLS select policies). Every write goes
--     through a SECURITY DEFINER function below that checks trip access,
--     validates input and runs in a single transaction.
--   * Integrity is also enforced by the schema itself:
--       - composite foreign keys guarantee payers/participants belong to the
--         same trip as the expense;
--       - a deferred constraint trigger guarantees that, at commit time, every
--         expense has >= 1 participant and its shares sum exactly to its amount.
--   * Custom errors use SQLSTATE 'PTxxx' so PostgREST returns HTTP status xxx.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, anon;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(btrim(display_name)) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'Application profile for an authenticated (or anonymous) Supabase user.';

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  public_code text not null unique check (public_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text check (description is null or char_length(description) <= 500),
  start_date date not null,
  end_date date not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trips_date_order check (end_date >= start_date),
  constraint trips_max_length check (end_date - start_date <= 365)
);
comment on column public.trips.public_code is 'Random, unguessable share code (8 chars, no ambiguous characters). The only public identifier.';

create table public.trip_access (
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  last_accessed_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);
create index trip_access_user_recent_idx on public.trip_access (user_id, last_accessed_at desc);
comment on table public.trip_access is 'Which users may open a trip. Granted by creating the trip or joining with its share code.';

create table public.trip_members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  email text check (email is null or (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  color text not null check (color ~ '^#[0-9a-f]{6}$'),
  position integer not null check (position > 0),
  joined_at timestamptz not null default now(),
  constraint trip_members_trip_id_id_key unique (trip_id, id),
  constraint trip_members_position_key unique (trip_id, position)
);
create unique index trip_members_name_key on public.trip_members (trip_id, lower(btrim(display_name)));
create unique index trip_members_user_key on public.trip_members (trip_id, user_id) where user_id is not null;
comment on table public.trip_members is 'People on a trip. Guests need no account (user_id null). position gives a stable order used for deterministic rounding.';

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  description text not null check (char_length(btrim(description)) between 1 and 80),
  amount_paise bigint not null check (amount_paise > 0 and amount_paise <= 1000000000),
  paid_by_member_id uuid not null,
  category text not null check (category in ('transport', 'food', 'stay', 'tickets', 'fuel', 'parking', 'shopping', 'entertainment', 'other')),
  split_method text not null check (split_method in ('equal', 'custom')),
  expense_date date not null,
  notes text check (notes is null or char_length(notes) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_trip_id_id_key unique (trip_id, id),
  -- Payer must be a member of the same trip. NO ACTION (not RESTRICT) so that
  -- deleting a whole trip can cascade to members and expenses in one statement.
  constraint expenses_payer_fkey foreign key (trip_id, paid_by_member_id)
    references public.trip_members (trip_id, id)
);
create index expenses_trip_date_idx on public.expenses (trip_id, expense_date, created_at);
create index expenses_trip_payer_idx on public.expenses (trip_id, paid_by_member_id);

create table public.expense_participants (
  expense_id uuid not null,
  trip_id uuid not null,
  member_id uuid not null,
  share_paise bigint not null check (share_paise >= 0),
  primary key (expense_id, member_id),
  constraint expense_participants_expense_fkey foreign key (trip_id, expense_id)
    references public.expenses (trip_id, id) on delete cascade,
  constraint expense_participants_member_fkey foreign key (trip_id, member_id)
    references public.trip_members (trip_id, id)
);
create index expense_participants_trip_member_idx on public.expense_participants (trip_id, member_id);
comment on table public.expense_participants is 'Each participant''s allocated share of an expense, in paise. Shares of an expense always sum to its amount.';

create table public.trip_activity (
  id bigint generated always as identity primary key,
  trip_id uuid not null references public.trips (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_name text not null,
  action text not null check (action in (
    'trip_created', 'trip_updated', 'member_added', 'member_updated', 'member_removed',
    'member_claimed', 'expense_added', 'expense_updated', 'expense_deleted')),
  subject text,
  amount_paise bigint,
  previous_amount_paise bigint,
  created_at timestamptz not null default now()
);
create index trip_activity_trip_recent_idx on public.trip_activity (trip_id, created_at desc, id desc);

-- -----------------------------------------------------------------------------
-- Integrity trigger: every expense balanced at commit time
-- -----------------------------------------------------------------------------

create function private.assert_expense_balanced()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_expense_id uuid;
  v_amount bigint;
  v_sum bigint;
  v_count integer;
begin
  if tg_table_name = 'expenses' then
    v_expense_id := new.id;
  elsif tg_op = 'DELETE' then
    v_expense_id := old.expense_id;
  else
    v_expense_id := new.expense_id;
  end if;

  select e.amount_paise into v_amount from public.expenses e where e.id = v_expense_id;
  if not found then
    return null; -- the expense itself was deleted
  end if;

  select coalesce(sum(p.share_paise), 0), count(*)
    into v_sum, v_count
    from public.expense_participants p
   where p.expense_id = v_expense_id;

  if v_count = 0 then
    raise exception 'Expense % has no participants', v_expense_id using errcode = '23514';
  end if;
  if v_sum <> v_amount then
    raise exception 'Expense % shares (%) do not add up to its amount (%)', v_expense_id, v_sum, v_amount
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger expenses_balanced
  after insert or update on public.expenses
  deferrable initially deferred
  for each row execute function private.assert_expense_balanced();

create constraint trigger expense_participants_balanced
  after insert or update or delete on public.expense_participants
  deferrable initially deferred
  for each row execute function private.assert_expense_balanced();

-- -----------------------------------------------------------------------------
-- Helper functions (private schema: not exposed through the API)
-- -----------------------------------------------------------------------------

create function private.is_trip_member(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trip_access a
     where a.trip_id = p_trip_id and a.user_id = (select auth.uid())
  );
$$;

create function private.require_trip_member(p_trip_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Please sign in to continue.' using errcode = 'PT401';
  end if;
  if not private.is_trip_member(p_trip_id) then
    raise exception 'You don''t have access to this trip.' using errcode = 'PT403';
  end if;
end;
$$;

create function private.actor_name(p_trip_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select m.display_name from public.trip_members m
      where m.trip_id = p_trip_id and m.user_id = (select auth.uid())),
    (select p.display_name from public.profiles p where p.id = (select auth.uid())),
    'Someone'
  );
$$;

create function private.log_activity(
  p_trip_id uuid, p_action text, p_subject text,
  p_amount bigint default null, p_previous_amount bigint default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.trip_activity (trip_id, actor_user_id, actor_name, action, subject, amount_paise, previous_amount_paise)
  values (p_trip_id, (select auth.uid()), private.actor_name(p_trip_id), p_action, p_subject, p_amount, p_previous_amount);
$$;

create function private.generate_trip_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  -- 32 symbols: no 0/O or 1/I to avoid confusion when codes are read aloud.
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := extensions.gen_random_bytes(8);
  v_code text := '';
begin
  for i in 0..7 loop
    -- 256 is a multiple of 32, so byte % 32 is uniformly distributed.
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return v_code;
end;
$$;

create function private.member_color(p_position integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array['#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed', '#dc2626',
                '#0891b2', '#65a30d', '#c026d3', '#ea580c', '#4f46e5', '#0d9488'])
         [((p_position - 1) % 12) + 1];
$$;

create function private.clean_text(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(regexp_replace(coalesce(p_value, ''), '\s+', ' ', 'g')), '');
$$;

create function private.next_member_position(p_trip_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(max(position), 0) + 1 from public.trip_members where trip_id = p_trip_id;
$$;

-- -----------------------------------------------------------------------------
-- Row Level Security: read-only access for trip members
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_access enable row level security;
alter table public.trip_members enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_participants enable row level security;
alter table public.trip_activity enable row level security;

create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy "trips: members read" on public.trips
  for select to authenticated using (private.is_trip_member(id));

create policy "trip_access: read own and trip-mates" on public.trip_access
  for select to authenticated using (user_id = (select auth.uid()) or private.is_trip_member(trip_id));

create policy "trip_members: members read" on public.trip_members
  for select to authenticated using (private.is_trip_member(trip_id));

create policy "expenses: members read" on public.expenses
  for select to authenticated using (private.is_trip_member(trip_id));

create policy "expense_participants: members read" on public.expense_participants
  for select to authenticated using (private.is_trip_member(trip_id));

create policy "trip_activity: members read" on public.trip_activity
  for select to authenticated using (private.is_trip_member(trip_id));

-- Defence in depth: no direct writes from API roles at all. Writes use the functions below.
revoke insert, update, delete, truncate on
  public.profiles, public.trips, public.trip_access, public.trip_members,
  public.expenses, public.expense_participants, public.trip_activity
  from anon, authenticated;
revoke all on
  public.profiles, public.trips, public.trip_access, public.trip_members,
  public.expenses, public.expense_participants, public.trip_activity
  from anon;

-- -----------------------------------------------------------------------------
-- API functions (RPC). All SECURITY DEFINER with an explicit access check.
-- -----------------------------------------------------------------------------

-- Create a trip, make the caller its owner and first member.
create function public.create_trip(
  p_name text, p_description text, p_start_date date, p_end_date date, p_creator_name text
)
returns table (trip_id uuid, public_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_trip_id uuid;
  v_code text;
  v_name text := private.clean_text(p_name);
  v_creator text := private.clean_text(p_creator_name);
begin
  if v_uid is null then
    raise exception 'Please sign in to continue.' using errcode = 'PT401';
  end if;
  if v_name is null or char_length(v_name) > 80 then
    raise exception 'Trip name must be 1–80 characters.' using errcode = 'PT400';
  end if;
  if v_creator is null or char_length(v_creator) > 40 then
    raise exception 'Your name must be 1–40 characters.' using errcode = 'PT400';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'End date must be on or after the start date.' using errcode = 'PT400';
  end if;
  if p_end_date - p_start_date > 365 then
    raise exception 'A trip can be at most one year long.' using errcode = 'PT400';
  end if;
  if (select count(*) from public.trip_access a where a.user_id = v_uid and a.role = 'owner') >= 200 then
    raise exception 'You have reached the maximum number of trips.' using errcode = 'PT429';
  end if;

  loop
    v_code := private.generate_trip_code();
    begin
      insert into public.trips (public_code, name, description, start_date, end_date, created_by)
      values (v_code, v_name, private.clean_text(p_description), p_start_date, p_end_date, v_uid)
      returning id into v_trip_id;
      exit;
    exception when unique_violation then
      -- extremely unlikely code collision: try another code
    end;
  end loop;

  insert into public.profiles (id, display_name) values (v_uid, v_creator)
  on conflict (id) do update set display_name = coalesce(public.profiles.display_name, excluded.display_name);

  insert into public.trip_access (trip_id, user_id, role) values (v_trip_id, v_uid, 'owner');
  insert into public.trip_members (trip_id, user_id, display_name, color, position)
  values (v_trip_id, v_uid, v_creator, private.member_color(1), 1);

  perform private.log_activity(v_trip_id, 'trip_created', v_name);
  return query select v_trip_id, v_code;
end;
$$;

-- Public, minimal preview of a trip for the join screen (code holders only).
create function public.get_trip_preview(p_code text)
returns table (name text, start_date date, end_date date, member_count integer, is_member boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select t.name, t.start_date, t.end_date,
         (select count(*)::integer from public.trip_members m where m.trip_id = t.id),
         private.is_trip_member(t.id)
    from public.trips t
   where t.public_code = upper(btrim(p_code));
$$;

-- Join a trip using its share code. Idempotent.
create function public.join_trip(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_trip_id uuid;
begin
  if v_uid is null then
    raise exception 'Please sign in to continue.' using errcode = 'PT401';
  end if;
  select t.id into v_trip_id from public.trips t where t.public_code = upper(btrim(p_code));
  if v_trip_id is null then
    raise exception 'No trip found with that code.' using errcode = 'PT404';
  end if;
  insert into public.trip_access (trip_id, user_id, role) values (v_trip_id, v_uid, 'member')
  on conflict on constraint trip_access_pkey do nothing;
  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;
  return v_trip_id;
end;
$$;

-- Record that the caller opened the trip (for "Recent trips"). Cheap: at most one write per minute.
create function public.touch_trip(p_trip_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.trip_access
     set last_accessed_at = now()
   where trip_id = p_trip_id and user_id = (select auth.uid())
     and last_accessed_at < now() - interval '1 minute';
$$;

create function public.update_trip(
  p_trip_id uuid, p_name text, p_description text, p_start_date date, p_end_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := private.clean_text(p_name);
  v_outside integer;
begin
  perform private.require_trip_member(p_trip_id);
  if v_name is null or char_length(v_name) > 80 then
    raise exception 'Trip name must be 1–80 characters.' using errcode = 'PT400';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'End date must be on or after the start date.' using errcode = 'PT400';
  end if;
  if p_end_date - p_start_date > 365 then
    raise exception 'A trip can be at most one year long.' using errcode = 'PT400';
  end if;
  select count(*) into v_outside from public.expenses e
   where e.trip_id = p_trip_id and (e.expense_date < p_start_date or e.expense_date > p_end_date);
  if v_outside > 0 then
    raise exception '% expense(s) fall outside these dates. Change their dates first.', v_outside
      using errcode = 'PT409';
  end if;
  update public.trips
     set name = v_name, description = private.clean_text(p_description),
         start_date = p_start_date, end_date = p_end_date, updated_at = now()
   where id = p_trip_id;
  perform private.log_activity(p_trip_id, 'trip_updated', v_name);
end;
$$;

create function public.delete_trip(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_trip_member(p_trip_id);
  if not exists (select 1 from public.trip_access a
                  where a.trip_id = p_trip_id and a.user_id = (select auth.uid()) and a.role = 'owner') then
    raise exception 'Only the person who created this trip can delete it.' using errcode = 'PT403';
  end if;
  delete from public.trips where id = p_trip_id;
end;
$$;

create function public.add_member(p_trip_id uuid, p_name text, p_email text, p_claim boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text := private.clean_text(p_name);
  v_email text := lower(private.clean_text(p_email));
  v_position integer;
  v_member_id uuid;
begin
  perform private.require_trip_member(p_trip_id);
  if v_name is null or char_length(v_name) > 40 then
    raise exception 'Name must be 1–40 characters.' using errcode = 'PT400';
  end if;
  if (select count(*) from public.trip_members m where m.trip_id = p_trip_id) >= 100 then
    raise exception 'A trip can have at most 100 people.' using errcode = 'PT400';
  end if;
  if exists (select 1 from public.trip_members m
              where m.trip_id = p_trip_id and lower(m.display_name) = lower(v_name)) then
    raise exception '% is already on this trip. Use a different name (for example add an initial).', v_name
      using errcode = 'PT409';
  end if;
  if p_claim and exists (select 1 from public.trip_members m where m.trip_id = p_trip_id and m.user_id = v_uid) then
    raise exception 'You are already linked to someone on this trip.' using errcode = 'PT409';
  end if;

  -- Serialise position allocation per trip.
  perform 1 from public.trips t where t.id = p_trip_id for update;
  v_position := private.next_member_position(p_trip_id);
  insert into public.trip_members (trip_id, user_id, display_name, email, color, position)
  values (p_trip_id, case when p_claim then v_uid end, v_name, v_email, private.member_color(v_position), v_position)
  returning id into v_member_id;

  perform private.log_activity(p_trip_id, 'member_added', v_name);
  return v_member_id;
end;
$$;

create function public.update_member(p_member_id uuid, p_name text, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip_id uuid;
  v_name text := private.clean_text(p_name);
  v_email text := lower(private.clean_text(p_email));
begin
  select m.trip_id into v_trip_id from public.trip_members m where m.id = p_member_id;
  if v_trip_id is null then
    raise exception 'That person no longer exists.' using errcode = 'PT404';
  end if;
  perform private.require_trip_member(v_trip_id);
  if v_name is null or char_length(v_name) > 40 then
    raise exception 'Name must be 1–40 characters.' using errcode = 'PT400';
  end if;
  if exists (select 1 from public.trip_members m
              where m.trip_id = v_trip_id and m.id <> p_member_id and lower(m.display_name) = lower(v_name)) then
    raise exception '% is already on this trip.', v_name using errcode = 'PT409';
  end if;
  update public.trip_members set display_name = v_name, email = v_email where id = p_member_id;
  perform private.log_activity(v_trip_id, 'member_updated', v_name);
end;
$$;

-- Remove a person. Refused if any expense references them: history is never rewritten silently.
create function public.remove_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip_id uuid;
  v_name text;
  v_paid integer;
  v_joined integer;
begin
  select m.trip_id, m.display_name into v_trip_id, v_name from public.trip_members m where m.id = p_member_id;
  if v_trip_id is null then
    raise exception 'That person no longer exists.' using errcode = 'PT404';
  end if;
  perform private.require_trip_member(v_trip_id);
  select count(*) into v_paid from public.expenses e where e.paid_by_member_id = p_member_id;
  select count(*) into v_joined from public.expense_participants p where p.member_id = p_member_id;
  if v_paid > 0 or v_joined > 0 then
    raise exception '% is part of % expense(s) (paid % · shared %). Edit or delete those expenses first.',
      v_name, greatest(v_paid, v_joined), v_paid, v_joined using errcode = 'PT409';
  end if;
  delete from public.trip_members where id = p_member_id;
  perform private.log_activity(v_trip_id, 'member_removed', v_name);
end;
$$;

-- Link (or unlink) the caller's account to a person on the trip ("This is me").
create function public.claim_member(p_member_id uuid, p_claim boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_trip_id uuid;
  v_owner uuid;
  v_name text;
begin
  select m.trip_id, m.user_id, m.display_name into v_trip_id, v_owner, v_name
    from public.trip_members m where m.id = p_member_id;
  if v_trip_id is null then
    raise exception 'That person no longer exists.' using errcode = 'PT404';
  end if;
  perform private.require_trip_member(v_trip_id);
  if not p_claim then
    update public.trip_members set user_id = null where id = p_member_id and user_id = v_uid;
    return;
  end if;
  if v_owner is not null and v_owner <> v_uid then
    raise exception '% is already linked to another account.', v_name using errcode = 'PT409';
  end if;
  update public.trip_members set user_id = null where trip_id = v_trip_id and user_id = v_uid and id <> p_member_id;
  update public.trip_members set user_id = v_uid where id = p_member_id;
  if v_owner is null then
    perform private.log_activity(v_trip_id, 'member_claimed', v_name);
  end if;
end;
$$;

-- Create (p_expense_id null) or update an expense together with all its shares, atomically.
-- p_shares: [{"member_id": uuid, "share_paise": integer}, ...]
create function public.save_expense(
  p_trip_id uuid,
  p_expense_id uuid,
  p_description text,
  p_amount_paise bigint,
  p_paid_by_member_id uuid,
  p_category text,
  p_split_method text,
  p_expense_date date,
  p_notes text,
  p_shares jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_trip public.trips%rowtype;
  v_description text := private.clean_text(p_description);
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_expense_id uuid;
  v_previous_amount bigint;
  v_count integer;
  v_distinct integer;
  v_sum bigint;
  v_min bigint;
  v_max bigint;
  v_invalid integer;
begin
  perform private.require_trip_member(p_trip_id);
  select * into v_trip from public.trips where id = p_trip_id;

  if v_description is null or char_length(v_description) > 80 then
    raise exception 'Description must be 1–80 characters.' using errcode = 'PT400';
  end if;
  if p_amount_paise is null or p_amount_paise <= 0 then
    raise exception 'Amount must be greater than zero.' using errcode = 'PT400';
  end if;
  if p_amount_paise > 1000000000 then
    raise exception 'Amount is too large (maximum ₹1,00,00,000).' using errcode = 'PT400';
  end if;
  if p_category not in ('transport', 'food', 'stay', 'tickets', 'fuel', 'parking', 'shopping', 'entertainment', 'other') then
    raise exception 'Unknown category.' using errcode = 'PT400';
  end if;
  if p_split_method not in ('equal', 'custom') then
    raise exception 'Unknown split method.' using errcode = 'PT400';
  end if;
  if p_expense_date is null or p_expense_date < v_trip.start_date or p_expense_date > v_trip.end_date then
    raise exception 'The expense date must be within the trip dates.' using errcode = 'PT400';
  end if;
  if v_notes is not null and char_length(v_notes) > 500 then
    raise exception 'Notes must be at most 500 characters.' using errcode = 'PT400';
  end if;
  if not exists (select 1 from public.trip_members m where m.id = p_paid_by_member_id and m.trip_id = p_trip_id) then
    raise exception 'The person who paid is not on this trip.' using errcode = 'PT400';
  end if;
  if p_shares is null or jsonb_typeof(p_shares) <> 'array' or jsonb_array_length(p_shares) = 0 then
    raise exception 'Select at least one participant.' using errcode = 'PT400';
  end if;

  -- Validate the shares as a set.
  begin
    select count(*), count(distinct (s->>'member_id')::uuid), sum((s->>'share_paise')::bigint),
           min((s->>'share_paise')::bigint), max((s->>'share_paise')::bigint)
      into v_count, v_distinct, v_sum, v_min, v_max
      from jsonb_array_elements(p_shares) s;
  exception when others then
    raise exception 'Invalid participant data.' using errcode = 'PT400';
  end;
  if v_count <> v_distinct then
    raise exception 'A participant was selected twice.' using errcode = 'PT400';
  end if;
  if v_min is null or v_min < 0 then
    raise exception 'Shares cannot be negative.' using errcode = 'PT400';
  end if;
  if v_sum <> p_amount_paise then
    raise exception 'The participant shares must add up to the expense amount.' using errcode = 'PT400';
  end if;
  if p_split_method = 'equal' and v_max - v_min > 1 then
    raise exception 'Equal split shares may differ by at most one paisa.' using errcode = 'PT400';
  end if;
  select count(*) into v_invalid
    from jsonb_array_elements(p_shares) s
   where not exists (select 1 from public.trip_members m
                      where m.id = (s->>'member_id')::uuid and m.trip_id = p_trip_id);
  if v_invalid > 0 then
    raise exception 'A selected participant is not on this trip.' using errcode = 'PT400';
  end if;

  if p_expense_id is null then
    if (select count(*) from public.expenses e where e.trip_id = p_trip_id) >= 5000 then
      raise exception 'A trip can have at most 5,000 expenses.' using errcode = 'PT400';
    end if;
    insert into public.expenses (trip_id, description, amount_paise, paid_by_member_id, category,
                                 split_method, expense_date, notes, created_by, updated_by)
    values (p_trip_id, v_description, p_amount_paise, p_paid_by_member_id, p_category,
            p_split_method, p_expense_date, v_notes, v_uid, v_uid)
    returning id into v_expense_id;
  else
    select e.amount_paise into v_previous_amount
      from public.expenses e where e.id = p_expense_id and e.trip_id = p_trip_id
       for update;
    if not found then
      raise exception 'This expense no longer exists.' using errcode = 'PT404';
    end if;
    update public.expenses
       set description = v_description, amount_paise = p_amount_paise,
           paid_by_member_id = p_paid_by_member_id, category = p_category,
           split_method = p_split_method, expense_date = p_expense_date, notes = v_notes,
           updated_by = v_uid, updated_at = now()
     where id = p_expense_id;
    delete from public.expense_participants where expense_id = p_expense_id;
    v_expense_id := p_expense_id;
  end if;

  insert into public.expense_participants (expense_id, trip_id, member_id, share_paise)
  select v_expense_id, p_trip_id, (s->>'member_id')::uuid, (s->>'share_paise')::bigint
    from jsonb_array_elements(p_shares) s;

  update public.trips set updated_at = now() where id = p_trip_id;

  if p_expense_id is null then
    perform private.log_activity(p_trip_id, 'expense_added', v_description, p_amount_paise);
  else
    perform private.log_activity(p_trip_id, 'expense_updated', v_description, p_amount_paise,
      case when v_previous_amount <> p_amount_paise then v_previous_amount end);
  end if;
  return v_expense_id;
end;
$$;

create function public.delete_expense(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip_id uuid;
  v_description text;
  v_amount bigint;
begin
  select e.trip_id, e.description, e.amount_paise into v_trip_id, v_description, v_amount
    from public.expenses e where e.id = p_expense_id;
  if v_trip_id is null then
    raise exception 'This expense no longer exists.' using errcode = 'PT404';
  end if;
  perform private.require_trip_member(v_trip_id);
  delete from public.expenses where id = p_expense_id;
  update public.trips set updated_at = now() where id = v_trip_id;
  perform private.log_activity(v_trip_id, 'expense_deleted', v_description, v_amount);
end;
$$;

create function public.set_display_name(p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text := private.clean_text(p_name);
begin
  if v_uid is null then
    raise exception 'Please sign in to continue.' using errcode = 'PT401';
  end if;
  if v_name is not null and char_length(v_name) > 40 then
    raise exception 'Name must be at most 40 characters.' using errcode = 'PT400';
  end if;
  insert into public.profiles (id, display_name) values (v_uid, v_name)
  on conflict (id) do update set display_name = excluded.display_name, updated_at = now();
end;
$$;

-- Recent trips with headline numbers for the home page, computed in one query.
create function public.list_my_trips(p_limit integer default 20)
returns table (
  public_code text, name text, start_date date, end_date date, role text,
  member_count integer, expense_count integer, total_paise bigint,
  updated_at timestamptz, last_accessed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.public_code, t.name, t.start_date, t.end_date, a.role,
         (select count(*)::integer from public.trip_members m where m.trip_id = t.id),
         (select count(*)::integer from public.expenses e where e.trip_id = t.id),
         (select coalesce(sum(e.amount_paise), 0)::bigint from public.expenses e where e.trip_id = t.id),
         t.updated_at, a.last_accessed_at
    from public.trip_access a
    join public.trips t on t.id = a.trip_id
   where a.user_id = (select auth.uid())
   order by a.last_accessed_at desc
   limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

-- -----------------------------------------------------------------------------
-- Function privileges: nothing callable by default; grant explicitly.
-- -----------------------------------------------------------------------------

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_trip_member(uuid) to authenticated;

revoke execute on function
  public.create_trip(text, text, date, date, text),
  public.get_trip_preview(text),
  public.join_trip(text),
  public.touch_trip(uuid),
  public.update_trip(uuid, text, text, date, date),
  public.delete_trip(uuid),
  public.add_member(uuid, text, text, boolean),
  public.update_member(uuid, text, text),
  public.remove_member(uuid),
  public.claim_member(uuid, boolean),
  public.save_expense(uuid, uuid, text, bigint, uuid, text, text, date, text, jsonb),
  public.delete_expense(uuid),
  public.set_display_name(text),
  public.list_my_trips(integer)
  from public, anon;

grant execute on function
  public.create_trip(text, text, date, date, text),
  public.get_trip_preview(text),
  public.join_trip(text),
  public.touch_trip(uuid),
  public.update_trip(uuid, text, text, date, date),
  public.delete_trip(uuid),
  public.add_member(uuid, text, text, boolean),
  public.update_member(uuid, text, text),
  public.remove_member(uuid),
  public.claim_member(uuid, boolean),
  public.save_expense(uuid, uuid, text, bigint, uuid, text, text, date, text, jsonb),
  public.delete_expense(uuid),
  public.set_display_name(text),
  public.list_my_trips(integer)
  to authenticated;

-- The join screen preview is visible to anyone holding the code (signed in or not).
grant execute on function public.get_trip_preview(text) to anon;
