-- =============================================================================
-- Fix: deleting a trip that has expenses failed.
--
-- `delete from trips` cascades to trip_members and to expenses (and from there
-- to expense_participants). The composite foreign keys that point at
-- trip_members were NOT DEFERRABLE, so PostgreSQL checked them part-way through
-- the cascade, while some expense_participants / expenses rows still existed,
-- and the whole delete was rejected (23503).
--
-- Making them DEFERRABLE INITIALLY DEFERRED moves the check to commit time,
-- after every cascade has finished. They still protect integrity exactly as
-- before: a transaction that leaves a dangling payer/participant cannot commit.
-- =============================================================================

alter table public.expense_participants
  alter constraint expense_participants_member_fkey deferrable initially deferred;

alter table public.expenses
  alter constraint expenses_payer_fkey deferrable initially deferred;
