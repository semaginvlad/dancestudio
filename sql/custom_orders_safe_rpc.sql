-- Documentation/draft only. Do not apply from this PR.
-- The production Supabase project already has this RPC applied manually:
-- public.crm_fetch_my_custom_orders()
--
-- Purpose:
-- - Let the admin email semagin.vlad@gmail.com fetch all custom_orders rows.
-- - Let trainer/non-admin users fetch only custom_orders rows for groups assigned
--   to their auth user through public.groups.trainer_id = auth.uid().
-- - Avoid direct frontend reads from public.custom_orders for trainer/non-admin
--   users.
-- - Do not expose all custom_orders to the client and then rely on client-side
--   filtering as a security boundary.

create or replace function public.crm_fetch_my_custom_orders()
returns table (
  group_id text,
  student_ids jsonb
)
language sql
security definer
set search_path = public
as $$
  with current_actor as (
    select
      auth.uid()::text as user_id,
      coalesce(auth.jwt() ->> 'email', '') as email
  )
  select
    co.group_id::text as group_id,
    coalesce(to_jsonb(co.student_ids), '[]'::jsonb) as student_ids
  from public.custom_orders co
  left join public.groups g on g.id::text = co.group_id::text
  cross join current_actor
  where current_actor.email = 'semagin.vlad@gmail.com'
    or g.trainer_id::text = current_actor.user_id
  order by co.group_id::text asc;
$$;

revoke execute on function public.crm_fetch_my_custom_orders() from public, anon;
grant execute on function public.crm_fetch_my_custom_orders() to authenticated;
