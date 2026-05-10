-- Safe restore-candidate RPC for AttendanceTab.
-- Apply manually in Supabase SQL Editor.

create or replace function public.crm_fetch_restore_candidates_for_group(p_group_id text)
returns table (
  student_id uuid,
  name text,
  first_name text,
  last_name text,
  has_history boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with allowed_group as (
    select g.id
    from public.groups g
    where g.id = p_group_id
      and (
        public.rls_is_admin()
        or g.trainer_id::text = auth.uid()::text
      )
  ),
  history_students as (
    select s.student_id
    from public.subscriptions s
    join allowed_group ag on ag.id = s.group_id
    where s.student_id is not null

    union

    select a.student_id
    from public.attendance a
    join allowed_group ag on ag.id = a.group_id
    where a.student_id is not null
  ),
  current_links as (
    select sg.student_id
    from public.student_groups sg
    join allowed_group ag on ag.id = sg.group_id
  )
  select
    st.id as student_id,
    st.name,
    st.first_name,
    st.last_name,
    true as has_history
  from history_students hs
  join public.students st on st.id = hs.student_id
  where not exists (
    select 1
    from current_links cl
    where cl.student_id = hs.student_id
  )
  order by lower(coalesce(nullif(st.name, ''), concat_ws(' ', st.first_name, st.last_name), st.id::text));
$$;

revoke execute on function public.crm_fetch_restore_candidates_for_group(text) from public, anon;
grant execute on function public.crm_fetch_restore_candidates_for_group(text) to authenticated;

create or replace function public.crm_restore_student_to_group(
  p_group_id text,
  p_student_id uuid
)
returns table (
  id uuid,
  student_id uuid,
  group_id text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.student_groups%rowtype;
  v_inserted public.student_groups%rowtype;
  v_allowed boolean;
  v_has_history boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_group_id is null or btrim(p_group_id) = '' then
    raise exception 'group_id is required' using errcode = '22023';
  end if;

  if p_student_id is null then
    raise exception 'student_id is required' using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.groups g
    where g.id = p_group_id
      and (
        public.rls_is_admin()
        or g.trainer_id::text = auth.uid()::text
      )
  ) into v_allowed;

  if not v_allowed then
    raise exception 'Not allowed to restore student to group %', p_group_id using errcode = '42501';
  end if;

  select *
  into v_existing
  from public.student_groups sg
  where sg.group_id = p_group_id
    and sg.student_id = p_student_id
  limit 1;

  if found then
    id := v_existing.id;
    student_id := v_existing.student_id;
    group_id := v_existing.group_id;
    return next;
    return;
  end if;

  select exists (
    select 1
    from public.subscriptions s
    where s.group_id = p_group_id
      and s.student_id = p_student_id

    union all

    select 1
    from public.attendance a
    where a.group_id = p_group_id
      and a.student_id = p_student_id
  ) into v_has_history;

  if not v_has_history then
    raise exception 'Student % has no restore history in group %', p_student_id, p_group_id using errcode = '42501';
  end if;

  insert into public.student_groups (student_id, group_id)
  values (p_student_id, p_group_id)
  returning * into v_inserted;

  id := v_inserted.id;
  student_id := v_inserted.student_id;
  group_id := v_inserted.group_id;
  return next;
end;
$$;

revoke execute on function public.crm_restore_student_to_group(text, uuid) from public, anon;
grant execute on function public.crm_restore_student_to_group(text, uuid) to authenticated;
