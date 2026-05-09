-- Documentation/draft only. Do not apply from this PR.
-- The production Supabase project already has this RPC applied manually:
-- public.crm_fetch_schedule_groups()
--
-- Purpose:
-- - Return the wider group schedule for trainer/non-admin users.
-- - Keep Attendance scoped to own groups by leaving normal group reads unchanged.
-- - The frontend should call this RPC for non-admin schedule reads instead of
--   falling back to groups.select('*').

create or replace function public.crm_fetch_schedule_groups()
returns table (
  id text,
  name text,
  direction_id text,
  schedule jsonb,
  trainer_id text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    g.id,
    g.name,
    g.direction_id,
    g.schedule,
    g.trainer_id::text as trainer_id,
    g.created_at
  from public.groups g
  order by g.name asc;
$$;

revoke execute on function public.crm_fetch_schedule_groups() from public, anon;
grant execute on function public.crm_fetch_schedule_groups() to authenticated;
