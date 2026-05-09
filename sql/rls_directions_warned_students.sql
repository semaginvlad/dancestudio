-- RLS draft for directions and attendance_warned_students.
-- Documentation/draft only. Do not apply from this PR.
-- Review and apply manually in Supabase when ready for Phase 1 RLS.
--
-- Scope:
-- - public.directions: authenticated users can read names/colors for trainer UI;
--   only admin can mutate rows.
-- - public.attendance_warned_students: admin can access all rows; trainers can
--   access only rows for groups they own via public.groups.trainer_id = auth.uid().

begin;

-- Idempotency for policies created by this draft.
drop policy if exists directions_authenticated_select on public.directions;
drop policy if exists directions_admin_all on public.directions;
drop policy if exists attendance_warned_students_admin_all on public.attendance_warned_students;
drop policy if exists attendance_warned_students_trainer_select_own_groups on public.attendance_warned_students;
drop policy if exists attendance_warned_students_trainer_insert_own_groups on public.attendance_warned_students;
drop policy if exists attendance_warned_students_trainer_update_own_groups on public.attendance_warned_students;
drop policy if exists attendance_warned_students_trainer_delete_own_groups on public.attendance_warned_students;

-- Helper predicates used by this draft. These mirror the Phase 1 RLS helpers and
-- are idempotent so this draft can be reviewed/applied independently.
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

revoke execute on function public.rls_is_admin() from public, anon;
revoke execute on function public.rls_owns_group(text) from public, anon;
grant execute on function public.rls_is_admin() to authenticated;
grant execute on function public.rls_owns_group(text) to authenticated;

-- public.directions: trainer UI needs read access to direction names/colors,
-- but only admin can create, edit, or delete directions.
alter table public.directions enable row level security;

create policy directions_authenticated_select
on public.directions
for select
to authenticated
using (true);

create policy directions_admin_all
on public.directions
for all
to authenticated
using (public.rls_is_admin())
with check (public.rls_is_admin());

-- public.attendance_warned_students: scoped by owned group_id for trainers.
alter table public.attendance_warned_students enable row level security;

create policy attendance_warned_students_admin_all
on public.attendance_warned_students
for all
to authenticated
using (public.rls_is_admin())
with check (public.rls_is_admin());

create policy attendance_warned_students_trainer_select_own_groups
on public.attendance_warned_students
for select
to authenticated
using (group_id is not null and public.rls_owns_group(group_id));

create policy attendance_warned_students_trainer_insert_own_groups
on public.attendance_warned_students
for insert
to authenticated
with check (group_id is not null and public.rls_owns_group(group_id));

create policy attendance_warned_students_trainer_update_own_groups
on public.attendance_warned_students
for update
to authenticated
using (group_id is not null and public.rls_owns_group(group_id))
with check (group_id is not null and public.rls_owns_group(group_id));

create policy attendance_warned_students_trainer_delete_own_groups
on public.attendance_warned_students
for delete
to authenticated
using (group_id is not null and public.rls_owns_group(group_id));

commit;
