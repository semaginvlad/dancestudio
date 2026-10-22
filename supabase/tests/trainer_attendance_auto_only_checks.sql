-- Read-only checks for the effective trainer Attendance write boundary.

do $$
declare
  auto_def text := lower(pg_get_functiondef(
    'public.rls_is_auto_attendance_entry(uuid,text,date,uuid,text)'::regprocedure
  ));
  guard_def text := lower(pg_get_functiondef(
    'public.crm_guard_trainer_attendance_financial_fields()'::regprocedure
  ));
  insert_check text;
begin
  if auto_def not like '%rls_can_record_attendance(p_student_id, p_group_id)%'
     or auto_def not like '%plan_type%4pack%8pack%12pack%'
     or auto_def not like '%p_entry_type%subscription%'
     or auto_def not like '%p_entry_type%debt%' then
    raise exception 'trainer automatic Attendance classification is incomplete';
  end if;

  if guard_def not like '%rls_is_admin()%'
     or guard_def not like '%new.date is distinct from old.date%'
     or guard_def not like '%new.sub_id is distinct from old.sub_id%'
     or guard_def not like '%new.entry_type is distinct from old.entry_type%'
     or guard_def not like '%new.guest_type is distinct from old.guest_type%' then
    raise exception 'trainer financial-field update guard is incomplete';
  end if;

  select lower(pg_get_expr(polwithcheck, polrelid)) into insert_check
  from pg_policy
  where polrelid = 'public.attendance'::regclass
    and polname = 'attendance_trainer_insert_own_groups';

  if insert_check is null
     or insert_check not like '%rls_is_auto_attendance_entry(student_id, group_id, date, sub_id, entry_type)%' then
    raise exception 'trainer INSERT does not enforce automatic classification';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.attendance'::regclass
      and tgname = 'attendance_guard_trainer_financial_fields'
      and not tgisinternal
  ) then
    raise exception 'trainer Attendance financial-field guard trigger is missing';
  end if;

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
