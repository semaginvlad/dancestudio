-- Make Attendance authorization use the CRM's canonical many-to-many trainer
-- assignment. This migration deliberately does not backfill groups.trainer_id.

begin;

create or replace function public.rls_owns_group(p_group_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trainers as t
    join public.trainer_groups as tg on tg.trainer_id = t.id
    where t.auth_user_id = auth.uid()
      and t.is_active is true
      and t.archived_at is null
      and t.access_disabled_at is null
      and tg.group_id = p_group_id
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
    from public.trainers as t
    join public.trainer_groups as tg on tg.trainer_id = t.id
    join public.student_groups as sg on sg.group_id = tg.group_id
    where t.auth_user_id = auth.uid()
      and t.is_active is true
      and t.archived_at is null
      and t.access_disabled_at is null
      and sg.student_id = p_student_id
  );
$$;

-- Attendance needs a stricter predicate than general roster visibility: the
-- student must belong to the group written on this particular attendance row.
create or replace function public.rls_can_record_attendance(
  p_student_id uuid,
  p_group_id text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_student_id is not null
    and p_group_id is not null
    and exists (
      select 1
      from public.trainers as t
      join public.trainer_groups as tg on tg.trainer_id = t.id
      join public.student_groups as sg
        on sg.group_id = tg.group_id
       and sg.student_id = p_student_id
      where t.auth_user_id = auth.uid()
        and t.is_active is true
        and t.archived_at is null
        and t.access_disabled_at is null
        and tg.group_id = p_group_id
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
  select p_sub_id is not null
    and p_student_id is not null
    and p_group_id is not null
    and public.rls_can_record_attendance(p_student_id, p_group_id)
    and exists (
      select 1
      from public.subscriptions as s
      where s.id = p_sub_id
        and s.student_id = p_student_id
        and s.group_id = p_group_id
    );
$$;

revoke execute on function public.rls_owns_group(text) from public, anon;
revoke execute on function public.rls_can_access_student(uuid) from public, anon;
revoke execute on function public.rls_can_record_attendance(uuid, text) from public, anon;
revoke execute on function public.rls_can_access_subscription(uuid, uuid, text) from public, anon;
grant execute on function public.rls_owns_group(text) to authenticated;
grant execute on function public.rls_can_access_student(uuid) to authenticated;
grant execute on function public.rls_can_record_attendance(uuid, text) to authenticated;
grant execute on function public.rls_can_access_subscription(uuid, uuid, text) to authenticated;

-- Keep the administrator policy untouched. Rebuild only trainer write policies
-- so repeated migration execution has the same result.
drop policy if exists attendance_trainer_insert_own_groups on public.attendance;
create policy attendance_trainer_insert_own_groups
on public.attendance
for insert
to authenticated
with check (
  group_id is not null
  and public.rls_owns_group(group_id)
  and (
    (student_id is null and sub_id is null)
    or (
      public.rls_can_record_attendance(student_id, group_id)
      and (
        sub_id is null
        or public.rls_can_access_subscription(sub_id, student_id, group_id)
      )
    )
  )
);

drop policy if exists attendance_trainer_update_own_groups on public.attendance;
create policy attendance_trainer_update_own_groups
on public.attendance
for update
to authenticated
using (group_id is not null and public.rls_owns_group(group_id))
with check (
  group_id is not null
  and public.rls_owns_group(group_id)
  and (
    (student_id is null and sub_id is null)
    or (
      public.rls_can_record_attendance(student_id, group_id)
      and (
        sub_id is null
        or public.rls_can_access_subscription(sub_id, student_id, group_id)
      )
    )
  )
);

commit;
