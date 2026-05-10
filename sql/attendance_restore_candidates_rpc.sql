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
