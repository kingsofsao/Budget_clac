-- Database security & integrity tests. Run against the LOCAL Supabase database:
--   npm run test:db
-- Everything runs inside a transaction that is rolled back at the end.
\set ON_ERROR_STOP on
begin;

-- Two users: Alice owns a trip, Mallory is a stranger.
insert into auth.users (id, aud, role, email, instance_id)
values ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'alice@test.local', '00000000-0000-0000-0000-000000000000'),
       ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'mallory@test.local', '00000000-0000-0000-0000-000000000000');

create temporary table t_ctx (key text primary key, value text);
grant all on t_ctx to authenticated;

-- ---------------------------------------------------------------- Alice
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

do $$
declare
  v_trip uuid; v_code text; v_alice uuid; v_bob uuid; v_cara uuid; v_expense uuid;
begin
  select trip_id, public_code into v_trip, v_code
    from public.create_trip('Test Trip', null, '2026-10-01', '2026-10-03', 'Alice');
  assert v_code ~ '^[A-HJ-NP-Z2-9]{8}$', 'trip code format';
  select id into v_alice from public.trip_members where trip_id = v_trip and user_id = auth.uid();
  assert v_alice is not null, 'creator becomes first member';
  v_bob := public.add_member(v_trip, 'Bob', null);
  v_cara := public.add_member(v_trip, 'Cara', 'cara@example.com');

  -- Equal split ₹100 between 3: 3334 + 3333 + 3333.
  v_expense := public.save_expense(v_trip, null, 'Snacks', 10000, v_alice, 'food', 'equal', '2026-10-01', null,
    jsonb_build_array(
      jsonb_build_object('member_id', v_alice, 'share_paise', 3334),
      jsonb_build_object('member_id', v_bob, 'share_paise', 3333),
      jsonb_build_object('member_id', v_cara, 'share_paise', 3333)));
  assert (select sum(share_paise) from public.expense_participants where expense_id = v_expense) = 10000, 'shares saved';

  -- Shares that do not sum to the amount are rejected.
  begin
    perform public.save_expense(v_trip, null, 'Bad', 10000, v_alice, 'food', 'custom', '2026-10-01', null,
      jsonb_build_array(jsonb_build_object('member_id', v_bob, 'share_paise', 9999)));
    raise exception 'FAIL: unbalanced custom split accepted';
  exception when sqlstate 'PT400' then null;
  end;

  -- No participants rejected.
  begin
    perform public.save_expense(v_trip, null, 'Bad', 10000, v_alice, 'food', 'equal', '2026-10-01', null, '[]'::jsonb);
    raise exception 'FAIL: expense without participants accepted';
  exception when sqlstate 'PT400' then null;
  end;

  -- "Equal" split that is not equal is rejected.
  begin
    perform public.save_expense(v_trip, null, 'Bad', 10000, v_alice, 'food', 'equal', '2026-10-01', null,
      jsonb_build_array(jsonb_build_object('member_id', v_alice, 'share_paise', 9000),
                        jsonb_build_object('member_id', v_bob, 'share_paise', 1000)));
    raise exception 'FAIL: unequal equal-split accepted';
  exception when sqlstate 'PT400' then null;
  end;

  -- Date outside trip rejected.
  begin
    perform public.save_expense(v_trip, null, 'Bad', 100, v_alice, 'food', 'equal', '2026-11-01', null,
      jsonb_build_array(jsonb_build_object('member_id', v_alice, 'share_paise', 100)));
    raise exception 'FAIL: out-of-range date accepted';
  exception when sqlstate 'PT400' then null;
  end;

  -- Zero / negative amount rejected.
  begin
    perform public.save_expense(v_trip, null, 'Bad', 0, v_alice, 'food', 'equal', '2026-10-01', null,
      jsonb_build_array(jsonb_build_object('member_id', v_alice, 'share_paise', 0)));
    raise exception 'FAIL: zero amount accepted';
  exception when sqlstate 'PT400' then null;
  end;

  -- Removing someone who appears in an expense is refused.
  begin
    perform public.remove_member(v_bob);
    raise exception 'FAIL: removed member with expenses';
  exception when sqlstate 'PT409' then null;
  end;

  -- Duplicate names refused.
  begin
    perform public.add_member(v_trip, ' bob ', null);
    raise exception 'FAIL: duplicate member name accepted';
  exception when sqlstate 'PT409' then null;
  end;

  -- Shrinking trip dates that would orphan expenses is refused.
  begin
    perform public.update_trip(v_trip, 'Test Trip', null, '2026-10-02', '2026-10-03');
    raise exception 'FAIL: date range excluding expenses accepted';
  exception when sqlstate 'PT409' then null;
  end;

  -- Direct table writes are not permitted for API roles.
  begin
    insert into public.expenses (trip_id, description, amount_paise, paid_by_member_id, category, split_method, expense_date)
    values (v_trip, 'Direct', 100, v_alice, 'food', 'equal', '2026-10-01');
    raise exception 'FAIL: direct insert allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.expense_participants set share_paise = 0 where expense_id = v_expense;
    raise exception 'FAIL: direct update allowed';
  exception when insufficient_privilege then null;
  end;

  -- Activity was logged.
  assert (select count(*) from public.trip_activity where trip_id = v_trip and action = 'expense_added') = 1, 'activity logged';

  insert into t_ctx values ('trip', v_trip::text), ('code', v_code), ('expense', v_expense::text), ('bob', v_bob::text);
end $$;

-- ---------------------------------------------------------------- Mallory (no access)
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);

do $$
declare
  v_trip uuid := (select value::uuid from t_ctx where key = 'trip');
  v_code text := (select value from t_ctx where key = 'code');
  v_expense uuid := (select value::uuid from t_ctx where key = 'expense');
  v_bob uuid := (select value::uuid from t_ctx where key = 'bob');
begin
  assert (select count(*) from public.trips where id = v_trip) = 0, 'stranger cannot read trip';
  assert (select count(*) from public.expenses where trip_id = v_trip) = 0, 'stranger cannot read expenses';
  assert (select count(*) from public.trip_members where trip_id = v_trip) = 0, 'stranger cannot read members';
  assert (select count(*) from public.expense_participants where trip_id = v_trip) = 0, 'stranger cannot read shares';
  assert (select count(*) from public.trip_activity where trip_id = v_trip) = 0, 'stranger cannot read activity';

  begin
    perform public.delete_expense(v_expense);
    raise exception 'FAIL: stranger deleted expense';
  exception when sqlstate 'PT403' then null;
  end;
  begin
    perform public.save_expense(v_trip, v_expense, 'Hacked', 100, v_bob, 'food', 'equal', '2026-10-01', null,
      jsonb_build_array(jsonb_build_object('member_id', v_bob, 'share_paise', 100)));
    raise exception 'FAIL: stranger edited expense';
  exception when sqlstate 'PT403' then null;
  end;
  begin
    perform public.add_member(v_trip, 'Mallory', null);
    raise exception 'FAIL: stranger added member';
  exception when sqlstate 'PT403' then null;
  end;
  begin
    perform public.delete_trip(v_trip);
    raise exception 'FAIL: stranger deleted trip';
  exception when sqlstate 'PT403' then null;
  end;

  -- Preview with the code is allowed and reveals only headline info.
  assert (select is_member from public.get_trip_preview(v_code)) = false, 'preview works for non-member';

  -- Joining with the code grants read access.
  perform public.join_trip(v_code);
  assert (select count(*) from public.expenses where trip_id = v_trip) = 1, 'member can read after joining';

  -- A non-owner member still cannot delete the trip.
  begin
    perform public.delete_trip(v_trip);
    raise exception 'FAIL: non-owner deleted trip';
  exception when sqlstate 'PT403' then null;
  end;
end $$;

-- ---------------------------------------------------------------- Anonymous (no JWT)
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  begin
    perform count(*) from public.trips;
    raise exception 'FAIL: anon can select trips';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_trip('x', null, '2026-10-01', '2026-10-01', 'x');
    raise exception 'FAIL: anon can call create_trip';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------------- Deferred integrity trigger
reset role;
savepoint integrity;
do $$
declare v_trip uuid := (select value::uuid from t_ctx where key = 'trip');
        v_member uuid;
begin
  select id into v_member from public.trip_members where trip_id = v_trip limit 1;
  insert into public.expenses (trip_id, description, amount_paise, paid_by_member_id, category, split_method, expense_date)
  values (v_trip, 'Orphan', 100, v_member, 'food', 'equal', '2026-10-01');
end $$;
do $$
begin
  set constraints all immediate;
  raise exception 'FAIL: expense without shares passed the integrity trigger';
exception when check_violation then
  null;
end $$;
rollback to savepoint integrity;

-- ---------------------------------------------------------------- Upgrade 2: splits, payments, access
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

do $$
declare
  v_trip uuid := (select value::uuid from t_ctx where key = 'trip');
  v_bob uuid := (select value::uuid from t_ctx where key = 'bob');
  v_alice uuid;
  v_dan uuid;
  v_payment uuid;
begin
  select id into v_alice from public.trip_members where trip_id = v_trip and user_id = auth.uid();

  -- Shares split 2:1 of ₹3,000 is accepted and the split values are stored.
  perform public.save_expense(v_trip, null, 'Hotel', 300000, v_alice, 'stay', 'shares', '2026-10-01', null,
    jsonb_build_array(
      jsonb_build_object('member_id', v_alice, 'share_paise', 200000, 'split_value', 2),
      jsonb_build_object('member_id', v_bob, 'share_paise', 100000, 'split_value', 1)));
  assert (select split_value from public.expense_participants p join public.expenses e on e.id = p.expense_id
           where e.description = 'Hotel' and p.member_id = v_alice) = 2, 'split_value stored';

  -- Shares that don't match the weights are rejected (even though they sum correctly).
  begin
    perform public.save_expense(v_trip, null, 'Bad', 300000, v_alice, 'stay', 'shares', '2026-10-01', null,
      jsonb_build_array(
        jsonb_build_object('member_id', v_alice, 'share_paise', 150000, 'split_value', 2),
        jsonb_build_object('member_id', v_bob, 'share_paise', 150000, 'split_value', 1)));
    raise exception 'FAIL: disproportionate shares split accepted';
  exception when sqlstate 'PT400' then null;
  end;

  -- Percentages must total 100%.
  begin
    perform public.save_expense(v_trip, null, 'Bad', 10000, v_alice, 'food', 'percentage', '2026-10-01', null,
      jsonb_build_array(
        jsonb_build_object('member_id', v_alice, 'share_paise', 5000, 'split_value', 5000),
        jsonb_build_object('member_id', v_bob, 'share_paise', 5000, 'split_value', 4000)));
    raise exception 'FAIL: percentages not totalling 100%% accepted';
  exception when sqlstate 'PT400' then null;
  end;
  perform public.save_expense(v_trip, null, 'Dinner', 10000, v_alice, 'food', 'percentage', '2026-10-01', null,
    jsonb_build_array(
      jsonb_build_object('member_id', v_alice, 'share_paise', 6000, 'split_value', 6000),
      jsonb_build_object('member_id', v_bob, 'share_paise', 4000, 'split_value', 4000)));

  -- Split values are not allowed on equal splits.
  begin
    perform public.save_expense(v_trip, null, 'Bad', 100, v_alice, 'food', 'equal', '2026-10-01', null,
      jsonb_build_array(jsonb_build_object('member_id', v_alice, 'share_paise', 100, 'split_value', 1)));
    raise exception 'FAIL: split value on equal split accepted';
  exception when sqlstate 'PT400' then null;
  end;

  -- Recording a payment works; invalid ones are rejected.
  v_payment := public.record_payment(v_trip, v_bob, v_alice, 70000, current_date, 'UPI');
  assert v_payment is not null, 'payment recorded';
  begin
    perform public.record_payment(v_trip, v_bob, v_bob, 100, current_date, null);
    raise exception 'FAIL: payment to self accepted';
  exception when sqlstate 'PT400' then null;
  end;
  begin
    perform public.record_payment(v_trip, v_bob, v_alice, 100, current_date + 30, null);
    raise exception 'FAIL: future-dated payment accepted';
  exception when sqlstate 'PT400' then null;
  end;
  begin
    perform public.record_payment(v_trip, v_bob, v_alice, 0, current_date, null);
    raise exception 'FAIL: zero payment accepted';
  exception when sqlstate 'PT400' then null;
  end;

  -- Direct writes to payments are blocked.
  begin
    insert into public.settlement_payments (trip_id, from_member_id, to_member_id, amount_paise, paid_on)
    values (v_trip, v_bob, v_alice, 1, current_date);
    raise exception 'FAIL: direct payment insert allowed';
  exception when insufficient_privilege then null;
  end;

  -- Someone who only appears in a payment still can't be removed.
  v_dan := public.add_member(v_trip, 'Dan', null);
  perform public.record_payment(v_trip, v_dan, v_alice, 500, current_date, null);
  begin
    perform public.remove_member(v_dan);
    raise exception 'FAIL: removed member with payments';
  exception when sqlstate 'PT409' then null;
  end;

  -- Deleting a payment works and is logged.
  perform public.delete_payment(v_payment);
  assert (select count(*) from public.trip_activity where trip_id = v_trip and action = 'payment_recorded') = 2, 'payment activity';
  assert (select count(*) from public.trip_activity where trip_id = v_trip and action = 'payment_deleted') = 1, 'payment delete activity';

  -- The owner cannot leave (they delete instead).
  begin
    perform public.leave_trip(v_trip);
    raise exception 'FAIL: owner left the trip';
  exception when sqlstate 'PT409' then null;
  end;
end $$;

-- Mallory joined earlier as a plain member.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
do $$
declare
  v_trip uuid := (select value::uuid from t_ctx where key = 'trip');
begin
  assert (select count(*) from public.settlement_payments where trip_id = v_trip) = 1, 'member reads payments';
  begin
    perform public.regenerate_trip_code(v_trip);
    raise exception 'FAIL: non-owner regenerated the code';
  exception when sqlstate 'PT403' then null;
  end;
  perform public.leave_trip(v_trip);
  assert (select count(*) from public.trips where id = v_trip) = 0, 'left member loses access';
  assert (select count(*) from public.settlement_payments where trip_id = v_trip) = 0, 'left member cannot read payments';
  begin
    perform public.record_payment(v_trip, gen_random_uuid(), gen_random_uuid(), 100, current_date, null);
    raise exception 'FAIL: outsider recorded a payment';
  exception when sqlstate 'PT403' then null;
  end;
end $$;

-- Owner regenerates the code: the old one stops working.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
do $$
declare
  v_trip uuid := (select value::uuid from t_ctx where key = 'trip');
  v_old text := (select value from t_ctx where key = 'code');
  v_new text;
begin
  v_new := public.regenerate_trip_code(v_trip);
  assert v_new <> v_old and v_new ~ '^[A-HJ-NP-Z2-9]{8}$', 'new code issued';
  assert (select count(*) from public.get_trip_preview(v_old)) = 0, 'old code no longer resolves';
  assert (select count(*) from public.get_trip_preview(v_new)) = 1, 'new code resolves';
end $$;
reset role;


-- ---------------------------------------------------------------- Deleting a full trip
-- Regression: deleting a trip that has expenses and payments must cascade cleanly.
reset role;
savepoint delete_with_data;
do $$
declare
  v_member uuid;
begin
  -- The deferred member foreign keys still reject a dangling reference.
  select m.id into v_member from public.trip_members m
    join public.expense_participants p on p.member_id = m.id
   where m.trip_id = (select value::uuid from t_ctx where key = 'trip') limit 1;
  begin
    delete from public.trip_members where id = v_member;
    set constraints all immediate;
    raise exception 'FAIL: member referenced by expenses was deleted';
  exception when foreign_key_violation then null;
  end;
end $$;
rollback to savepoint delete_with_data;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
do $$
declare
  v_trip uuid := (select value::uuid from t_ctx where key = 'trip');
begin
  assert (select count(*) from public.expenses where trip_id = v_trip) > 0, 'trip has expenses';
  assert (select count(*) from public.settlement_payments where trip_id = v_trip) > 0, 'trip has payments';
  perform public.delete_trip(v_trip);
  set constraints all immediate;
end $$;
reset role;
do $$
declare
  v_trip uuid := (select value::uuid from t_ctx where key = 'trip');
begin
  assert (select count(*) from public.trips where id = v_trip) = 0, 'trip deleted';
  assert (select count(*) from public.expenses where trip_id = v_trip) = 0, 'expenses deleted';
  assert (select count(*) from public.expense_participants where trip_id = v_trip) = 0, 'shares deleted';
  assert (select count(*) from public.settlement_payments where trip_id = v_trip) = 0, 'payments deleted';
  assert (select count(*) from public.trip_members where trip_id = v_trip) = 0, 'members deleted';
end $$;

\echo 'ALL DATABASE SECURITY TESTS PASSED'
rollback;
