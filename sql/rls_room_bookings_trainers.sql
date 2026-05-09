-- RLS draft for public.room_bookings and public.trainers.
-- Documentation/draft only. Do not apply from this PR.
-- Review and apply manually in Supabase when ready for this RLS safety step.
--
-- Context:
-- - public.crm_fetch_schedule_room_bookings() is already applied manually and is
--   the wider Schedule read path for trainer/non-admin users.
-- - public.crm_get_my_trainer_profile() is already applied manually and is the
--   safe trainer profile read path for trainer/non-admin users.
-- - Admin users continue to read the base tables directly.

begin;

-- Idempotency for policies created by this draft.
drop policy if exists room_bookings_admin_all on public.room_bookings;
drop policy if exists room_bookings_trainer_select_own on public.room_bookings;
drop policy if exists room_bookings_trainer_insert_own_allowed_events on public.room_bookings;
drop policy if exists room_bookings_trainer_update_own_allowed_events on public.room_bookings;
drop policy if exists room_bookings_trainer_delete_own on public.room_bookings;
drop policy if exists trainers_admin_all on public.trainers;

-- Helper predicate used by this draft. It is idempotent so this draft can be
-- reviewed/applied independently of other RLS drafts.
create or replace function public.rls_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'semagin.vlad@gmail.com';
$$;

revoke execute on function public.rls_is_admin() from public, anon;
grant execute on function public.rls_is_admin() to authenticated;

-- public.room_bookings:
-- - Admin has full base-table access.
-- - Trainers can mutate only their own room_booking/individual_training rows.
-- - Trainers can SELECT only their own rows from the base table.
-- - Wider trainer Schedule reads must continue to use
--   public.crm_fetch_schedule_room_bookings(), not a broad base-table policy.
alter table public.room_bookings enable row level security;

create policy room_bookings_admin_all
on public.room_bookings
for all
to authenticated
using (public.rls_is_admin())
with check (public.rls_is_admin());

create policy room_bookings_trainer_select_own
on public.room_bookings
for select
to authenticated
using (trainer_id::text = auth.uid()::text);

create policy room_bookings_trainer_insert_own_allowed_events
on public.room_bookings
for insert
to authenticated
with check (
  trainer_id::text = auth.uid()::text
  and event_type in ('room_booking', 'individual_training')
);

create policy room_bookings_trainer_update_own_allowed_events
on public.room_bookings
for update
to authenticated
using (trainer_id::text = auth.uid()::text)
with check (
  trainer_id::text = auth.uid()::text
  and event_type in ('room_booking', 'individual_training')
);

create policy room_bookings_trainer_delete_own
on public.room_bookings
for delete
to authenticated
using (trainer_id::text = auth.uid()::text);

-- public.trainers:
-- - Admin has full base-table access.
-- - Trainers/non-admins intentionally get no direct SELECT policy on the base
--   table because it can contain private/admin/salary fields.
-- - Trainer safe self-profile reads must continue to use
--   public.crm_get_my_trainer_profile().
alter table public.trainers enable row level security;

create policy trainers_admin_all
on public.trainers
for all
to authenticated
using (public.rls_is_admin())
with check (public.rls_is_admin());

commit;
