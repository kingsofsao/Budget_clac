-- =============================================================================
-- DEVELOPMENT SEED DATA — DO NOT RUN IN PRODUCTION
--
-- Loaded automatically only by `supabase db reset` / `supabase start` on a
-- LOCAL database. `supabase db push` (production) never runs this file unless
-- --include-seed is passed explicitly.
--
-- Creates a demo trip anyone can open locally at /trip/BGLDEMX2
-- ("Join this trip" on first visit). The trip name is clearly marked [DEMO].
-- =============================================================================

do $$
declare
  v_trip_id uuid := '00000000-0000-4000-8000-000000000001';
  v_names text[] := array['Surya', 'Nithish', 'Gokul', 'Vishal', 'Arun', 'Karthik', 'Priya',
                          'Divya', 'Rahul', 'Sneha', 'Ajay', 'Meera', 'Vikram'];
  v_member uuid[];
  v_expense_id uuid;
  r record;
begin
  if exists (select 1 from public.trips where id = v_trip_id) then
    return;
  end if;

  insert into public.trips (id, public_code, name, description, start_date, end_date)
  values (v_trip_id, 'BGLDEMX2', 'Bangalore Trip [DEMO]',
          'Development seed data: 13 friends, 3 days. Not real expenses.',
          '2026-10-01', '2026-10-03');

  for i in 1..array_length(v_names, 1) loop
    insert into public.trip_members (trip_id, display_name, color, position)
    values (v_trip_id, v_names[i], private.member_color(i), i)
    returning id into v_expense_id;
    v_member := v_member || v_expense_id;
  end loop;

  -- description, rupees, category, payer position, participant positions, date
  for r in
    select * from (values
      ('Airport Cab 1', 1800, 'transport', 1, array[1,2,3,4,5,6],                      '2026-10-01'::date),
      ('Airport Cab 2', 2100, 'transport', 7, array[7,8,9,10,11,12,13],                '2026-10-01'::date),
      ('Breakfast',     1300, 'food',      2, array[1,2,3,4,5,6,7,8,9,10,11,12,13],    '2026-10-01'::date),
      ('Lunch',         2600, 'food',      3, array[1,2,3,4,5,6,7,8,9,10,11,12,13],    '2026-10-01'::date),
      ('Hotel',        12000, 'stay',      1, array[1,2,3,4,5,6,7,8,9,10,11,12,13],    '2026-10-01'::date),
      ('Museum Tickets',1560, 'tickets',   4, array[1,2,3,4,5,6,7,8,9,10,11,12],       '2026-10-02'::date)
    ) as t(description, rupees, category, payer, participants, expense_date)
  loop
    insert into public.expenses (trip_id, description, amount_paise, paid_by_member_id, category,
                                 split_method, expense_date, notes)
    values (v_trip_id, r.description, r.rupees * 100, v_member[r.payer], r.category,
            'equal', r.expense_date, 'Demo data')
    returning id into v_expense_id;

    -- Equal split, identical rule to the app: floor(amount / n) each, and the
    -- remainder paise go one each to the first participants in member order.
    insert into public.expense_participants (expense_id, trip_id, member_id, share_paise)
    select v_expense_id, v_trip_id, v_member[p.pos],
           (r.rupees * 100) / cardinality(r.participants)
           + case when p.ord <= (r.rupees * 100) % cardinality(r.participants) then 1 else 0 end
      from unnest(r.participants) with ordinality as p(pos, ord);
  end loop;

  insert into public.trip_activity (trip_id, actor_name, action, subject)
  values (v_trip_id, 'Seed script', 'trip_created', 'Bangalore Trip [DEMO]');
end;
$$;
