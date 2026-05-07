-- RLS Phase 1 migration draft based on Supabase policy audit.
-- DO NOT APPLY AS-IS WITHOUT REVIEW.
-- This file is a draft only. It has not been executed against Supabase.
--
-- Audit input:
-- - RLS already enabled on: attendance, cancelled_trainings, custom_orders,
--   groups, mod_log, student_groups, students, subscriptions,
--   telegram_chat_meta, waitlist.
-- - RLS currently disabled on important tables including: room_bookings,
--   trainers, trainer_groups, trainer_dispatch_history,
--   trainer_notification_state, crm_contacts, crm_contact_events,
--   crm_contact_channels, crm_conversation_threads, crm_waitlist_entries,
--   instagram_* tables, and facebook_* tables.
-- - Existing dangerous policies are roles={public}, cmd=ALL, qual=true,
--   with_check=true and must be removed before trusted policies are used.
--
-- Phase 1 rules covered in this draft:
-- - Admin email semagin.vlad@gmail.com can access covered tables.
-- - Trainers can SELECT only their own groups via groups.trainer_id = auth.uid().
-- - Trainers can SELECT linked students only through student_groups in own groups.
-- - Trainers cannot directly INSERT/UPDATE/DELETE students.
-- - Trainers can SELECT student_groups for own groups and DELETE own group links;
--   trainers cannot directly INSERT student_groups links.
-- - Trainers can access attendance only for own group_id; guest attendance is allowed
--   with student_id null, while student attendance requires access to that student.
-- - Trainers can access subscriptions only when subscriptions.group_id is owned by them.
-- - Trainers can access only their own room_bookings.
-- - The trainers base table is admin-only in Phase 1 to avoid exposing salary/admin data.

begin;

-- -----------------------------------------------------------------------------
-- 1) Drop audited public allow-all policies only on tables covered below.
-- -----------------------------------------------------------------------------

drop policy if exists "Allow all on attendance" on public.attendance;
drop policy if exists "Allow all on groups" on public.groups;
drop policy if exists "Allow all on student_groups" on public.student_groups;
drop policy if exists "Allow all on students" on public.students;
drop policy if exists "Allow all on subscriptions" on public.subscriptions;

-- Idempotency for policies created by this draft.
drop policy if exists groups_admin_all on public.groups;
drop policy if exists groups_trainer_select_own on public.groups;
drop policy if exists students_admin_all on public.students;
drop policy if exists students_trainer_select_linked on public.students;
drop policy if exists student_groups_admin_all on public.student_groups;
drop policy if exists student_groups_trainer_select_own_groups on public.student_groups;
drop policy if exists student_groups_trainer_delete_own_groups on public.student_groups;
drop policy if exists attendance_admin_all on public.attendance;
drop policy if exists attendance_trainer_select_own_groups on public.attendance;
drop policy if exists attendance_trainer_insert_own_groups on public.attendance;
drop policy if exists attendance_trainer_update_own_groups on public.attendance;
drop policy if exists attendance_trainer_delete_own_groups on public.attendance;
drop policy if exists subscriptions_admin_all on public.subscriptions;
drop policy if exists subscriptions_trainer_select_own_group on public.subscriptions;
drop policy if exists subscriptions_trainer_insert_own_group on public.subscriptions;
drop policy if exists subscriptions_trainer_update_own_group on public.subscriptions;
drop policy if exists subscriptions_trainer_delete_own_group on public.subscriptions;
drop policy if exists room_bookings_admin_all on public.room_bookings;
drop policy if exists room_bookings_trainer_select_own on public.room_bookings;
drop policy if exists room_bookings_trainer_insert_own on public.room_bookings;
drop policy if exists room_bookings_trainer_update_own on public.room_bookings;
drop policy if exists room_bookings_trainer_delete_own on public.room_bookings;
drop policy if exists trainers_admin_all on public.trainers;

-- -----------------------------------------------------------------------------
-- 2) Enable RLS for Phase 1 tables where audit says rowsecurity=false.
-- -----------------------------------------------------------------------------

alter table public.room_bookings enable row level security;
alter table public.trainers enable row level security;

-- -----------------------------------------------------------------------------
-- 3) Helper predicates.
-- -----------------------------------------------------------------------------

create or replace function public.rls_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'semagin.vlad@gmail.com';
$$;

create or replace function public.rls_owns_group(p_group_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.groups g
    where g.id = p_group_id
      and g.trainer_id::text = auth.uid()::text
  );
$$;

create or replace function public.rls_can_access_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.student_groups sg
    join public.groups g on g.id = sg.group_id
    where sg.student_id = p_student_id
      and g.trainer_id::text = auth.uid()::text
  );
$$;

create or replace function public.rls_can_access_subscription(
  p_subscription_id uuid,
  p_student_id uuid default null,
  p_group_id text default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.subscriptions s
    where (p_subscription_id is null or s.id = p_subscription_id)
      and (p_student_id is null or s.student_id = p_student_id)
      and (p_group_id is null or s.group_id = p_group_id)
      and s.group_id is not null
      and public.rls_owns_group(s.group_id)
  );
$$;

revoke execute on function public.rls_is_admin() from public, anon;
revoke execute on function public.rls_owns_group(text) from public, anon;
revoke execute on function public.rls_can_access_student(uuid) from public, anon;
revoke execute on function public.rls_can_access_subscription(uuid, uuid, text) from public, anon;
grant execute on function public.rls_is_admin() to authenticated;
grant execute on function public.rls_owns_group(text) to authenticated;
grant execute on function public.rls_can_access_student(uuid) to authenticated;
grant execute on function public.rls_can_access_subscription(uuid, uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 4) groups: admin all; trainer SELECT own groups only.
-- -----------------------------------------------------------------------------

create policy groups_admin_all
on public.groups
for all
to authenticated
using (public.rls_is_admin())
with check (public.rls_is_admin());

create policy groups_trainer_select_own
on public.groups
for select
to authenticated
using (trainer_id::text = auth.uid()::text);

-- No trainer INSERT/UPDATE/DELETE on groups in Phase 1. Groups are global studio
-- schedule/configuration records.

-- -----------------------------------------------------------------------------
-- 5) students: admin all; trainer SELECT linked students only.
-- -----------------------------------------------------------------------------

create policy students_admin_all
on public.students
for all
to authenticated
using (public.rls_is_admin())
with check (public.rls_is_admin());

create policy students_trainer_select_linked
on public.students
for select
to authenticated
using (public.rls_can_access_student(id));

-- No direct trainer INSERT/UPDATE/DELETE on students in Phase 1.
-- Creation should use public.crm_create_student_for_group. Profile edits/deletes
-- need a separately reviewed safe RPC/view because students can belong to
-- multiple groups.

-- -----------------------------------------------------------------------------
-- 6) student_groups: admin all; trainer SELECT own groups and DELETE own links.
-- -----------------------------------------------------------------------------

create policy student_groups_admin_all
on public.student_groups
for all
to authenticated
using (public.rls_is_admin())
with check (public.rls_is_admin());

create policy student_groups_trainer_select_own_groups
on public.student_groups
for select
to authenticated
using (public.rls_owns_group(group_id));

create policy student_groups_trainer_delete_own_groups
on public.student_groups
for delete
to authenticated
using (public.rls_owns_group(group_id));

-- No direct trainer INSERT on student_groups in Phase 1. Otherwise a trainer who
-- knows a student UUID could attach that student to an owned group. New student +
-- group links should use public.crm_create_student_for_group; linking existing
-- students needs a future audited RPC.

-- -----------------------------------------------------------------------------
-- 7) attendance: admin all; trainers scoped to own groups.
-- -----------------------------------------------------------------------------

create policy attendance_admin_all
on public.attendance
for all
to authenticated
using (public.rls_is_admin())
with check (public.rls_is_admin());

create policy attendance_trainer_select_own_groups
on public.attendance
for select
to authenticated
using (group_id is not null and public.rls_owns_group(group_id));

create policy attendance_trainer_insert_own_groups
on public.attendance
for insert
to authenticated
with check (
  group_id is not null
  and public.rls_owns_group(group_id)
  and (
    student_id is null
    or public.rls_can_access_student(student_id)
  )
  and (
    sub_id is null
    or public.rls_can_access_subscription(sub_id, student_id, group_id)
  )
);

create policy attendance_trainer_update_own_groups
on public.attendance
for update
to authenticated
using (group_id is not null and public.rls_owns_group(group_id))
with check (
  group_id is not null
  and public.rls_owns_group(group_id)
  and (
    student_id is null
    or public.rls_can_access_student(student_id)
  )
  and (
    sub_id is null
    or public.rls_can_access_subscription(sub_id, student_id, group_id)
  )
);

create policy attendance_trainer_delete_own_groups
on public.attendance
for delete
to authenticated
using (group_id is not null and public.rls_owns_group(group_id));

-- -----------------------------------------------------------------------------
-- 8) subscriptions: admin all; trainers scoped by subscriptions.group_id.
-- -----------------------------------------------------------------------------

create policy subscriptions_admin_all
on public.subscriptions
for all
to authenticated
using (public.rls_is_admin())
with check (public.rls_is_admin());

create policy subscriptions_trainer_select_own_group
on public.subscriptions
for select
to authenticated
using (group_id is not null and public.rls_owns_group(group_id));

create policy subscriptions_trainer_insert_own_group
on public.subscriptions
for insert
to authenticated
with check (
  group_id is not null
  and public.rls_owns_group(group_id)
  and public.rls_can_access_student(student_id)
);

create policy subscriptions_trainer_update_own_group
on public.subscriptions
for update
to authenticated
using (group_id is not null and public.rls_owns_group(group_id))
with check (
  group_id is not null
  and public.rls_owns_group(group_id)
  and public.rls_can_access_student(student_id)
);

create policy subscriptions_trainer_delete_own_group
on public.subscriptions
for delete
to authenticated
using (group_id is not null and public.rls_owns_group(group_id));

-- -----------------------------------------------------------------------------
-- 9) room_bookings: enable RLS above; admin all; trainer own bookings only.
-- -----------------------------------------------------------------------------

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

create policy room_bookings_trainer_insert_own
on public.room_bookings
for insert
to authenticated
with check (trainer_id::text = auth.uid()::text);

create policy room_bookings_trainer_update_own
on public.room_bookings
for update
to authenticated
using (trainer_id::text = auth.uid()::text)
with check (trainer_id::text = auth.uid()::text);

create policy room_bookings_trainer_delete_own
on public.room_bookings
for delete
to authenticated
using (trainer_id::text = auth.uid()::text);

-- -----------------------------------------------------------------------------
-- 10) trainers: enable RLS above; admin-only base table.
-- -----------------------------------------------------------------------------

create policy trainers_admin_all
on public.trainers
for all
to authenticated
using (public.rls_is_admin())
with check (public.rls_is_admin());

-- No trainer access to public.trainers in Phase 1. Use a safe view/RPC later if
-- trainers need profile self-service; do not expose salary/admin columns.

-- -----------------------------------------------------------------------------
-- 11) TODO / intentionally not covered in Phase 1.
-- -----------------------------------------------------------------------------
-- This draft intentionally drops permissive policies only for tables that receive
-- replacement Phase 1 policies above. The following audited tables keep their
-- current policies in Phase 1 until a dedicated replacement model is designed.
--
-- TODO: cancelled_trainings - do not drop existing policy in Phase 1; define
-- whether trainers can read own group cancellations and whether admin-only
-- mutation is required in a separate phase.
-- TODO: custom_orders - do not drop existing policies in Phase 1; this likely
-- contains operational/admin data and needs admin-only or safe scoped policies
-- after column review.
-- TODO: mod_log - do not drop existing policy in Phase 1; likely audit/admin
-- data, so design an admin/service-role or safe read model separately.
-- TODO: waitlist - do not drop existing policy in Phase 1; CRM/lead data needs
-- a separate ownership model.
-- TODO: telegram_chat_meta - messaging metadata needs a separate privacy review.
-- TODO: trainer_groups - audit relationship to groups.trainer_id before enabling
-- trainer access or mutation.
-- TODO: trainer_dispatch_history and trainer_notification_state - notification
-- internals; define admin/service or per-trainer read model separately.
-- TODO: crm_contacts, crm_contact_events, crm_contact_channels,
-- crm_conversation_threads, crm_waitlist_entries - CRM tables need a dedicated
-- CRM RLS phase; do not infer access here.
-- TODO: instagram_* and facebook_* tables - OAuth/social integration tables need
-- separate service-role/admin policies and secrets review.
-- TODO: salary/revenue/admin data - RLS is row-level and does not hide columns.
-- Use column privileges, safe views, or RPCs before exposing sensitive values such
-- as subscriptions.amount/base_price, room_bookings.price, salary fields, or admin
-- analytics data to trainers.
-- TODO: add/verify indexes for policy predicates: groups(trainer_id),
-- student_groups(group_id), student_groups(student_id), attendance(group_id),
-- attendance(student_id), subscriptions(group_id), subscriptions(student_id),
-- room_bookings(trainer_id).

commit;
