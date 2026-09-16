-- Read-only regression checks for the final Attendance authorization helpers.
-- Run after all migrations; these checks inspect the effective definitions,
-- which also catches a later migration replacing a helper with legacy logic.

do $$
declare
  owns_group_def text := pg_get_functiondef('public.rls_owns_group(text)'::regprocedure);
  student_def text := pg_get_functiondef('public.rls_can_access_student(uuid)'::regprocedure);
  record_def text := pg_get_functiondef('public.rls_can_record_attendance(uuid,text)'::regprocedure);
  subscription_def text := pg_get_functiondef('public.rls_can_access_subscription(uuid,uuid,text)'::regprocedure);
  insert_check text;
  update_check text;
begin
  -- Active trainer + trainer_groups is the sole group ownership path; inactive,
  -- archived, and access-disabled profiles therefore fail every trainer check.
  if owns_group_def not like '%public.trainer_groups%'
     or owns_group_def not like '%t.auth_user_id = auth.uid()%'
     or owns_group_def not like '%t.is_active is true%'
     or owns_group_def not like '%t.archived_at is null%'
     or owns_group_def not like '%t.access_disabled_at is null%'
     or owns_group_def like '%g.trainer_id%' then
    raise exception 'rls_owns_group is not based exclusively on an enabled trainer_groups assignment';
  end if;

  -- A visible student must share a trainer_groups/student_groups group.
  if student_def not like '%public.trainer_groups%'
     or student_def not like '%public.student_groups%'
     or student_def like '%g.trainer_id%' then
    raise exception 'rls_can_access_student does not use the canonical shared-group relationship';
  end if;

  -- The row-level predicate binds the student to the exact attendance group.
  if record_def not like '%sg.student_id = p_student_id%'
     or record_def not like '%tg.group_id = p_group_id%'
     or record_def not like '%t.auth_user_id = auth.uid()%'
     or record_def not like '%t.is_active is true%'
     or record_def not like '%t.archived_at is null%'
     or record_def not like '%t.access_disabled_at is null%' then
    raise exception 'attendance student/group predicate is incomplete';
  end if;

  -- A supplied subscription must match all three IDs; NULL subscriptions are
  -- handled by the policies and remain valid for an assigned student.
  if subscription_def not like '%s.id = p_sub_id%'
     or subscription_def not like '%s.student_id = p_student_id%'
     or subscription_def not like '%s.group_id = p_group_id%'
     or subscription_def not like '%rls_can_record_attendance(p_student_id, p_group_id)%' then
    raise exception 'subscription authorization is not bound to subscription, student, and group';
  end if;

  select lower(pg_get_expr(polwithcheck, polrelid)) into insert_check
  from pg_policy
  where polrelid = 'public.attendance'::regclass
    and polname = 'attendance_trainer_insert_own_groups';

  select lower(pg_get_expr(polqual, polrelid)) || ' '
         || lower(pg_get_expr(polwithcheck, polrelid)) into update_check
  from pg_policy
  where polrelid = 'public.attendance'::regclass
    and polname = 'attendance_trainer_update_own_groups';

  if insert_check is null
     or insert_check not like '%rls_owns_group(group_id)%'
     or insert_check not like '%rls_can_record_attendance(student_id, group_id)%'
     or insert_check not like '%rls_can_access_subscription(sub_id, student_id, group_id)%'
     or insert_check not like '%sub_id is null%'
     or insert_check not like '%student_id is null%sub_id is null%' then
    raise exception 'trainer INSERT policy does not cover owned guests, no-subscription students, and validated subscriptions';
  end if;

  if update_check is null
     or update_check not like '%rls_owns_group(group_id)%'
     or update_check not like '%rls_can_record_attendance(student_id, group_id)%'
     or update_check not like '%rls_can_access_subscription(sub_id, student_id, group_id)%'
     or update_check not like '%student_id is null%sub_id is null%' then
    raise exception 'trainer UPDATE policy is not equivalently constrained';
  end if;

  -- The independent administrator ALL policy must still be present.
  if not exists (
    select 1 from pg_policy
    where polrelid = 'public.attendance'::regclass
      and polname = 'attendance_admin_all'
      and polcmd = '*'
  ) then
    raise exception 'attendance administrator access policy is missing';
  end if;
end
$$;
