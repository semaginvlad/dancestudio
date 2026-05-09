-- Core Attendance RLS draft for public.groups, public.students,
-- public.student_groups, and public.attendance.
-- Documentation/draft only. Do not apply from this PR.
-- Review and apply manually in Supabase when ready for the core Attendance
-- RLS safety step.
--
-- Context:
-- - Wider Schedule reads use safe RPCs, so base-table trainer reads can stay
--   narrow/scoped:
--   - public.crm_fetch_schedule_groups()
--   - public.crm_fetch_schedule_room_bookings()
--   - public.crm_fetch_schedule_cancelled_trainings()
-- - Trainer profile, custom orders, and Attendance student creation have their
--   own safe RPC paths:
--   - public.crm_get_my_trainer_profile()
--   - public.crm_fetch_my_custom_orders()
--   - public.crm_create_student_for_group()
-- - This draft does not change subscriptions RLS, cancelled_trainings RLS,
--   room_bookings/trainers/custom_orders/waitlist RLS, salary/revenue, or
--   Telegram/Instagram tables.

begin;

-- Drop the old permissive policies before enabling trusted scoped policies.
drop policy if exists "Allow all on groups" on public.groups;
drop policy if exists "Allow all on students" on public.students;
drop policy if exists "Allow all on student_groups" on public.student_groups;
drop policy if exists "Allow all on attendance" on public.attendance;

-- Idempotency for policies created by this draft.
drop policy if exists groups_admin_all on public.groups;
drop policy if exists groups_trainer_select_own on public.groups;
drop policy if exists students_admin_all on public.students;
drop policy if exists students_trainer_select_linked on public.students;
drop policy if exists students_trainer_update_linked on public.students;
drop policy if exists student_groups_admin_all on public.student_groups;
drop policy if exists student_groups_trainer_select_own_groups on public.student_groups;
drop policy if exists student_groups_trainer_delete_own_groups on public.student_groups;
drop policy if exists attendance_admin_all on public.attendance;
drop policy if exists attendance_trainer_select_own_groups on public.attendance;
drop policy if exists attendance_trainer_insert_own_groups on public.attendance;
drop policy if exists attendance_trainer_update_own_groups on public.attendance;
drop policy if exists attendance_trainer_delete_own_groups on public.attendance;

-- Helper predicates used by this draft. They are idempotent so this file can be
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
  p_sub_id uuid,
  p_student_id uuid,
  p_group_id text
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
    where s.id = p_sub_id
      and (p_student_id is null or s.student_id = p_student_id)
      and s.group_id = p_group_id
      and p_group_id is not null
      and public.rls_owns_group(p_group_id)
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

-- public.groups: admin can manage all groups; trainers can only read their own
-- groups. Trainers intentionally do not get INSERT/UPDATE/DELETE on groups.
alter table public.groups enable row level security;

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

-- public.students: admin can manage all students. Trainers can read and update
-- only students linked through student_groups to groups they own. Trainers do
-- not get direct INSERT/DELETE; creation should use
-- public.crm_create_student_for_group().
alter table public.students enable row level security;

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

create policy students_trainer_update_linked
on public.students
for update
to authenticated
using (public.rls_can_access_student(id))
with check (public.rls_can_access_student(id));

-- public.student_groups: admin can manage all links. Trainers can read links
-- for their own groups and delete own-group links because the current Attendance
-- UI removes a student from a group via public.student_groups. Trainers do not
-- get direct INSERT; new student + group links should use
-- public.crm_create_student_for_group(), and linking existing students should be
-- handled by a future audited safe RPC.
alter table public.student_groups enable row level security;

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
using (group_id is not null and public.rls_owns_group(group_id));

create policy student_groups_trainer_delete_own_groups
on public.student_groups
for delete
to authenticated
using (group_id is not null and public.rls_owns_group(group_id));

-- public.attendance: admin can manage all attendance. Trainers can select and
-- mutate attendance only for groups they own. Guest attendance rows are allowed
-- when student_id is null and the group is owned. Student/subscription rows must
-- point to a student/subscription accessible through an owned group.
alter table public.attendance enable row level security;

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

commit;
