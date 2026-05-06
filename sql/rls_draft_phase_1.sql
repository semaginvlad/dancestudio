-- RLS draft, phase 1 only.
-- DO NOT APPLY AS-IS WITHOUT REVIEW.
-- This file intentionally does NOT enable RLS and does NOT execute any data changes.
-- It is a draft for future Supabase/Postgres policies after schema review.
--
-- Schema references checked in repo before drafting:
-- - src/db.js uses groups.trainer_id, students, student_groups, attendance.group_id,
--   attendance.student_id, subscriptions.student_id/group_id, room_bookings.trainer_id,
--   trainers, and trainer_groups.
-- - schema.sql still contains old permissive public policies and enables RLS for some
--   core tables; this draft does not alter those existing statements.
-- - sql/room_bookings.sql defines room_bookings.trainer_id as text null.
--
-- Primary rules represented here:
-- - Admin email semagin.vlad@gmail.com can see and edit everything.
-- - Trainers can access only groups where groups.trainer_id = auth.uid().
-- - Trainers can access students only through student_groups in their groups.
-- - Trainers can access attendance only for their group_id.
-- - Trainers can access subscriptions only when subscriptions.group_id is their group.
-- - Trainers can see/edit only their own room_bookings.
-- - Trainers must not get direct access to salary/revenue/admin data.
-- - Trainers table stays admin-only in Phase 1 because it may contain salary/admin data.

-- -----------------------------------------------------------------------------
-- Helper predicates for policy readability.
-- SECURITY DEFINER is intentional for policy predicates so ownership checks do not
-- recurse through the same RLS policies once they are enabled in a later phase.
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
    join public.student_groups sg on sg.student_id = s.student_id
    join public.groups g on g.id = sg.group_id
    where (p_subscription_id is null or s.id = p_subscription_id)
      and (p_student_id is null or s.student_id = p_student_id)
      and (p_group_id is null or s.group_id = p_group_id)
      and g.trainer_id::text = auth.uid()::text
  );
$$;

-- TODO before applying: decide owner/grants for helper functions in Supabase.
-- grant execute on function public.rls_is_admin() to authenticated;
-- grant execute on function public.rls_owns_group(text) to authenticated;
-- grant execute on function public.rls_can_access_student(uuid) to authenticated;
-- grant execute on function public.rls_can_access_subscription(uuid, uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Policy reset draft. Keep commented until the migration is reviewed.
-- -----------------------------------------------------------------------------

-- drop policy if exists groups_admin_all on public.groups;
-- drop policy if exists groups_trainer_select_own on public.groups;
-- drop policy if exists students_admin_all on public.students;
-- drop policy if exists students_trainer_select_linked on public.students;
-- drop policy if exists student_groups_admin_all on public.student_groups;
-- drop policy if exists student_groups_trainer_select_own_groups on public.student_groups;
-- drop policy if exists student_groups_trainer_delete_own_groups on public.student_groups;
-- drop policy if exists attendance_admin_all on public.attendance;
-- drop policy if exists attendance_trainer_select_own_groups on public.attendance;
-- drop policy if exists attendance_trainer_insert_own_groups on public.attendance;
-- drop policy if exists attendance_trainer_update_own_groups on public.attendance;
-- drop policy if exists attendance_trainer_delete_own_groups on public.attendance;
-- drop policy if exists subscriptions_admin_all on public.subscriptions;
-- drop policy if exists subscriptions_trainer_select_own_group on public.subscriptions;
-- drop policy if exists subscriptions_trainer_insert_own_group on public.subscriptions;
-- drop policy if exists subscriptions_trainer_update_own_group on public.subscriptions;
-- drop policy if exists subscriptions_trainer_delete_own_group on public.subscriptions;
-- drop policy if exists room_bookings_admin_all on public.room_bookings;
-- drop policy if exists room_bookings_trainer_select_own on public.room_bookings;
-- drop policy if exists room_bookings_trainer_insert_own on public.room_bookings;
-- drop policy if exists room_bookings_trainer_update_own on public.room_bookings;
-- drop policy if exists room_bookings_trainer_delete_own on public.room_bookings;
-- drop policy if exists trainers_admin_all on public.trainers;

-- -----------------------------------------------------------------------------
-- groups
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

-- Trainers are intentionally SELECT-only for groups in Phase 1.
-- Group creation, schedule changes, trainer assignment, and deletes are admin-only
-- because groups are global studio configuration.

-- -----------------------------------------------------------------------------
-- students
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

-- No broad trainer INSERT policy for students in Phase 1.
-- Student creation should go through public.crm_create_student_for_group so the
-- student and student_groups link are created atomically for a trainer-owned group.
-- TODO: after reviewing the RPC signature/grants in production, add an RPC-specific
-- policy or SECURITY DEFINER flow instead of allowing direct trainer inserts.

-- No direct trainer UPDATE/DELETE policies for students in Phase 1.
-- A student can belong to multiple groups, so profile edits/deletes should go
-- through an audited safe RPC/view later if trainer self-service is needed.

-- -----------------------------------------------------------------------------
-- student_groups
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

-- No direct trainer INSERT policy for student_groups in Phase 1.
-- Otherwise a trainer who knows a student UUID could attach that student to one
-- of their own groups. New student + group links should be created through
-- public.crm_create_student_for_group, or a future audited safe RPC for linking
-- existing students after ownership/consent rules are defined.

create policy student_groups_trainer_delete_own_groups
on public.student_groups
for delete
to authenticated
using (public.rls_owns_group(group_id));

-- -----------------------------------------------------------------------------
-- attendance
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
-- subscriptions
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
-- room_bookings
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
-- trainers (used by src/db.js)
-- -----------------------------------------------------------------------------

create policy trainers_admin_all
on public.trainers
for all
to authenticated
using (public.rls_is_admin())
with check (public.rls_is_admin());

-- Trainers get no direct access to public.trainers in Phase 1.
-- TODO: expose a safe trainer profile view/RPC later if trainers need self-service
-- profile fields; do not expose salary/admin columns from the base table.

-- -----------------------------------------------------------------------------
-- TODO before any production migration
-- -----------------------------------------------------------------------------
-- 1. This draft does not enable RLS. The eventual migration must decide whether to
--    replace the old permissive policies in schema.sql before enabling/tightening RLS.
-- 2. Trainer access to subscriptions is scoped by subscriptions.group_id, not only student_id.
--    This prevents access to another group subscription for a student who is linked
--    to multiple groups.
-- 3. RLS cannot hide salary/revenue/admin columns on otherwise visible rows.
--    Before granting trainer access to any sensitive base table or view, create
--    least-privilege views/RPCs or revoke column privileges for sensitive columns
--    such as subscriptions.amount, subscriptions.base_price, room_bookings.price,
--    any trainer salary fields, and admin-only analytics data.
-- 4. Verify actual production column types for groups.trainer_id, room_bookings.trainer_id,
--    trainers.id, attendance.student_id, attendance.entry_type, attendance.quantity, and
--    all added room_bookings pricing fields. This draft uses ::text casts where trainer_id
--    may be text or uuid.
-- 5. Confirm whether trainer_groups needs separate policies. Current phase uses only
--    groups.trainer_id because that is the requested ownership rule, although src/db.js
--    also reads/writes trainer_groups.
-- 6. Keep direct trainer student and student_groups inserts disabled. Use/review
--    public.crm_create_student_for_group for atomic student + student_groups creation,
--    and design a separate safe RPC before allowing trainers to link existing students.
-- 7. Add indexes for policy predicates if missing: groups(trainer_id),
--    student_groups(group_id), student_groups(student_id), attendance(group_id),
--    subscriptions(student_id), subscriptions(group_id), room_bookings(trainer_id).
-- 8. Run the reviewed migration only in a controlled environment and test as admin,
--    each trainer, and anon. Do not run this draft directly.
