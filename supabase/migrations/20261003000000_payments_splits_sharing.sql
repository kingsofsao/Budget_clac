-- =============================================================================
-- Trip Split — upgrade 2
--   1. Split by shares (weights) and by percentage.
--   2. Recorded settlement payments ("Gokul paid Surya ₹700"). Informational
--      only: the app never moves or verifies money; members record it by hand.
--   3. Owner can regenerate the share code (revokes old links); members can leave.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Split methods
-- -----------------------------------------------------------------------------

alter table public.expenses drop constraint expenses_split_method_check;
alter table public.expenses add constraint expenses_split_method_check
  check (split_method in ('equal', 'custom', 'shares', 'percentage'));

-- The user's input for weighted splits: number of shares (shares) or basis
-- points, i.e. hundredths of a percent (percentage). Null for equal/custom.
-- share_paise remains the source of truth for every calculation.
alter table public.expense_participants
  add column split_value integer check (split_value is null or split_value > 0);

comment on column public.expense_participants.split_value is
  'Shares (split_method=shares) or basis points, 1/100 of a percent (split_method=percentage). Null otherwise.';

-- -----------------------------------------------------------------------------
-- 2. Recorded payments
-- -----------------------------------------------------------------------------

create table public.settlement_payments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  from_member_id uuid not null,
  to_member_id uuid not null,
  amount_paise bigint not null check (amount_paise > 0 and amount_paise <= 1000000000),
  paid_on date not null,
  note text check (note is null or char_length(note) <= 200),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint settlement_payments_distinct check (from_member_id <> to_member_id),
  -- Deferred so deleting a whole trip can cascade (see 20261002000000_fix_trip_delete_cascade).
  constraint settlement_payments_from_fkey foreign key (trip_id, from_member_id)
    references public.trip_members (trip_id, id) deferrable initially deferred,
  constraint settlement_payments_to_fkey foreign key (trip_id, to_member_id)
    references public.trip_members (trip_id, id) deferrable initially deferred
);
create index settlement_payments_trip_idx on public.settlement_payments (trip_id, paid_on, created_at);
comment on table public.settlement_payments is
  'Payments members say happened between them, recorded by hand. Never verified, never processed by the app.';

alter table public.settlement_payments enable row level security;
create policy "settlement_payments: members read" on public.settlement_payments
  for select to authenticated using (private.is_trip_member(trip_id));
revoke insert, update, delete, truncate on public.settlement_payments from anon, authenticated;
revoke all on public.settlement_payments from anon;

alter table public.trip_activity drop constraint trip_activity_action_check;
alter table public.trip_activity add constraint trip_activity_action_check check (action in (
  'trip_created', 'trip_updated', 'member_added', 'member_updated', 'member_removed',
  'member_claimed', 'member_left', 'expense_added', 'expense_updated', 'expense_deleted',
  'payment_recorded', 'payment_deleted', 'code_regenerated'));

-- -----------------------------------------------------------------------------
-- save_expense: adds shares / percentage validation and stores split_value
-- -----------------------------------------------------------------------------

create or replace function public.save_expense(
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
  v_values integer;
  v_weight_sum bigint;
  v_off integer;
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
  if p_split_method not in ('equal', 'custom', 'shares', 'percentage') then
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

  begin
    select count(*), count(distinct (s->>'member_id')::uuid), sum((s->>'share_paise')::bigint),
           min((s->>'share_paise')::bigint), max((s->>'share_paise')::bigint),
           count(s->>'split_value'), sum((s->>'split_value')::integer)
      into v_count, v_distinct, v_sum, v_min, v_max, v_values, v_weight_sum
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

  if p_split_method in ('equal', 'custom') then
    if v_values > 0 then
      raise exception 'Unexpected split values.' using errcode = 'PT400';
    end if;
    if p_split_method = 'equal' and v_max - v_min > 1 then
      raise exception 'Equal split shares may differ by at most one paisa.' using errcode = 'PT400';
    end if;
  else
    if v_values <> v_count or exists (
      select 1 from jsonb_array_elements(p_shares) s where (s->>'split_value')::integer <= 0) then
      raise exception 'Every participant needs a positive split value.' using errcode = 'PT400';
    end if;
    if p_split_method = 'percentage' and v_weight_sum <> 10000 then
      raise exception 'Percentages must add up to exactly 100%%.' using errcode = 'PT400';
    end if;
    -- Each share must be the proportional amount, rounded to within one paisa:
    -- |share × total_weight − amount × weight| < total_weight.
    select count(*) into v_off
      from jsonb_array_elements(p_shares) s
     where abs((s->>'share_paise')::bigint * v_weight_sum
               - p_amount_paise * (s->>'split_value')::bigint) >= v_weight_sum;
    if v_off > 0 then
      raise exception 'Shares do not match the split values.' using errcode = 'PT400';
    end if;
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

  insert into public.expense_participants (expense_id, trip_id, member_id, share_paise, split_value)
  select v_expense_id, p_trip_id, (s->>'member_id')::uuid, (s->>'share_paise')::bigint,
         (s->>'split_value')::integer
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

-- -----------------------------------------------------------------------------
-- Payments API
-- -----------------------------------------------------------------------------

create function public.record_payment(
  p_trip_id uuid, p_from_member_id uuid, p_to_member_id uuid,
  p_amount_paise bigint, p_paid_on date, p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.trips%rowtype;
  v_from text;
  v_to text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id uuid;
begin
  perform private.require_trip_member(p_trip_id);
  select * into v_trip from public.trips where id = p_trip_id;
  select display_name into v_from from public.trip_members where id = p_from_member_id and trip_id = p_trip_id;
  select display_name into v_to from public.trip_members where id = p_to_member_id and trip_id = p_trip_id;
  if v_from is null or v_to is null then
    raise exception 'Both people must be on this trip.' using errcode = 'PT400';
  end if;
  if p_from_member_id = p_to_member_id then
    raise exception 'Choose two different people.' using errcode = 'PT400';
  end if;
  if p_amount_paise is null or p_amount_paise <= 0 or p_amount_paise > 1000000000 then
    raise exception 'Enter an amount between ₹0.01 and ₹1,00,00,000.' using errcode = 'PT400';
  end if;
  -- Allow advance payments (up to 90 days before the trip) but not future dates.
  -- (+1 day tolerates time-zone differences between the user and the server.)
  if p_paid_on is null or p_paid_on < v_trip.start_date - 90 or p_paid_on > current_date + 1 then
    raise exception 'Choose a payment date that isn''t in the future.' using errcode = 'PT400';
  end if;
  if v_note is not null and char_length(v_note) > 200 then
    raise exception 'Notes must be at most 200 characters.' using errcode = 'PT400';
  end if;
  if (select count(*) from public.settlement_payments where trip_id = p_trip_id) >= 2000 then
    raise exception 'Too many payments recorded for this trip.' using errcode = 'PT400';
  end if;

  insert into public.settlement_payments (trip_id, from_member_id, to_member_id, amount_paise, paid_on, note, created_by)
  values (p_trip_id, p_from_member_id, p_to_member_id, p_amount_paise, p_paid_on, v_note, (select auth.uid()))
  returning id into v_id;
  update public.trips set updated_at = now() where id = p_trip_id;
  perform private.log_activity(p_trip_id, 'payment_recorded', v_from || ' → ' || v_to, p_amount_paise);
  return v_id;
end;
$$;

create function public.delete_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip_id uuid;
  v_amount bigint;
  v_subject text;
begin
  select p.trip_id, p.amount_paise, f.display_name || ' → ' || t.display_name
    into v_trip_id, v_amount, v_subject
    from public.settlement_payments p
    join public.trip_members f on f.id = p.from_member_id
    join public.trip_members t on t.id = p.to_member_id
   where p.id = p_payment_id;
  if v_trip_id is null then
    raise exception 'This payment no longer exists.' using errcode = 'PT404';
  end if;
  perform private.require_trip_member(v_trip_id);
  delete from public.settlement_payments where id = p_payment_id;
  update public.trips set updated_at = now() where id = v_trip_id;
  perform private.log_activity(v_trip_id, 'payment_deleted', v_subject, v_amount);
end;
$$;

-- remove_member: also refuse when the person appears in recorded payments.
create or replace function public.remove_member(p_member_id uuid)
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
  v_payments integer;
begin
  select m.trip_id, m.display_name into v_trip_id, v_name from public.trip_members m where m.id = p_member_id;
  if v_trip_id is null then
    raise exception 'That person no longer exists.' using errcode = 'PT404';
  end if;
  perform private.require_trip_member(v_trip_id);
  select count(*) into v_paid from public.expenses e where e.paid_by_member_id = p_member_id;
  select count(*) into v_joined from public.expense_participants p where p.member_id = p_member_id;
  select count(*) into v_payments from public.settlement_payments p
   where p.from_member_id = p_member_id or p.to_member_id = p_member_id;
  if v_paid > 0 or v_joined > 0 then
    raise exception '% is part of % expense(s) (paid % · shared %). Edit or delete those expenses first.',
      v_name, greatest(v_paid, v_joined), v_paid, v_joined using errcode = 'PT409';
  end if;
  if v_payments > 0 then
    raise exception '% appears in % recorded payment(s). Delete those payments first.', v_name, v_payments
      using errcode = 'PT409';
  end if;
  delete from public.trip_members where id = p_member_id;
  perform private.log_activity(v_trip_id, 'member_removed', v_name);
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Share-code control
-- -----------------------------------------------------------------------------

-- Owner only. Old links stop working for new people; existing members keep access.
create function public.regenerate_trip_code(p_trip_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  perform private.require_trip_member(p_trip_id);
  if not exists (select 1 from public.trip_access a
                  where a.trip_id = p_trip_id and a.user_id = (select auth.uid()) and a.role = 'owner') then
    raise exception 'Only the person who created this trip can change its code.' using errcode = 'PT403';
  end if;
  loop
    v_code := private.generate_trip_code();
    begin
      update public.trips set public_code = v_code, updated_at = now() where id = p_trip_id;
      exit;
    exception when unique_violation then
    end;
  end loop;
  perform private.log_activity(p_trip_id, 'code_regenerated', null);
  return v_code;
end;
$$;

-- Leave a trip (members only; the owner deletes the trip instead).
create function public.leave_trip(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  perform private.require_trip_member(p_trip_id);
  if exists (select 1 from public.trip_access a
              where a.trip_id = p_trip_id and a.user_id = v_uid and a.role = 'owner') then
    raise exception 'You created this trip, so you can''t leave it. You can delete it instead.' using errcode = 'PT409';
  end if;
  perform private.log_activity(p_trip_id, 'member_left', null);
  update public.trip_members set user_id = null where trip_id = p_trip_id and user_id = v_uid;
  delete from public.trip_access where trip_id = p_trip_id and user_id = v_uid;
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------

revoke execute on function
  public.record_payment(uuid, uuid, uuid, bigint, date, text),
  public.delete_payment(uuid),
  public.regenerate_trip_code(uuid),
  public.leave_trip(uuid)
  from public, anon;

grant execute on function
  public.record_payment(uuid, uuid, uuid, bigint, date, text),
  public.delete_payment(uuid),
  public.regenerate_trip_code(uuid),
  public.leave_trip(uuid)
  to authenticated;
