-- Documentation/draft only. Do not apply from this PR.
-- Review and apply manually in Supabase before relying on this RPC in preview.
--
-- Purpose:
-- - Return persisted Attendance student ordering without exposing all
--   public.custom_orders rows to trainer/non-admin clients.
-- - Admin email semagin.vlad@gmail.com can read all custom_orders rows.
-- - Trainer/non-admin users can read only rows for groups they own via
--   public.groups.trainer_id = auth.uid().

create or replace function public.crm_fetch_my_custom_orders()
returns table (
  group_id text,
  student_ids jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    co.group_id::text as group_id,
    to_jsonb(co.student_ids) as student_ids
  from public.custom_orders co
  where coalesce(auth.jwt() ->> 'email', '') = 'semagin.vlad@gmail.com'
     or exists (
       select 1
       from public.groups g
       where g.id::text = co.group_id::text
         and g.trainer_id::text = auth.uid()::text
     )
  order by co.group_id::text asc;
$$;

revoke execute on function public.crm_fetch_my_custom_orders() from public, anon;
grant execute on function public.crm_fetch_my_custom_orders() to authenticated;
