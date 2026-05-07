-- Draft only. Do NOT run automatically from the app.
-- Pre-RLS helper for creating a student from Attendance and linking her to a group atomically.
-- Confirm production students columns before applying: name, first_name, last_name, phone,
-- telegram, notes, message_template. The current frontend/db layer already reads/writes them.

create or replace function public.crm_create_student_for_group(
  p_group_id text,
  p_name text,
  p_first_name text default null,
  p_last_name text default null,
  p_phone text default null,
  p_telegram text default null,
  p_notes text default null,
  p_message_template text default null
)
returns public.students
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_is_admin boolean;
  v_has_group_access boolean;
  v_full_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_group_id is null or btrim(p_group_id) = '' then
    raise exception 'group_id is required' using errcode = '22023';
  end if;

  v_is_admin := lower(coalesce(auth.jwt() ->> 'email', '')) = lower('semagin.vlad@gmail.com');

  select exists (
    select 1
    from public.groups g
    where g.id = p_group_id
      and g.trainer_id = auth.uid()
  ) into v_has_group_access;

  if not (v_is_admin or v_has_group_access) then
    raise exception 'Not allowed to create student for group %', p_group_id using errcode = '42501';
  end if;

  v_full_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_full_name is null then
    v_full_name := nullif(btrim(concat_ws(' ', nullif(p_last_name, ''), nullif(p_first_name, ''))), '');
  end if;

  if v_full_name is null then
    raise exception 'student name is required' using errcode = '22023';
  end if;

  insert into public.students (
    name,
    first_name,
    last_name,
    phone,
    telegram,
    notes,
    message_template
  ) values (
    v_full_name,
    nullif(p_first_name, ''),
    nullif(p_last_name, ''),
    nullif(p_phone, ''),
    nullif(p_telegram, ''),
    nullif(p_notes, ''),
    nullif(p_message_template, '')
  )
  returning * into v_student;

  insert into public.student_groups (student_id, group_id)
  values (v_student.id, p_group_id)
  on conflict (student_id, group_id) do nothing;

  return v_student;
end;
$$;

revoke all on function public.crm_create_student_for_group(
  text, text, text, text, text, text, text, text
) from public;

grant execute on function public.crm_create_student_for_group(
  text, text, text, text, text, text, text, text
) to authenticated;
