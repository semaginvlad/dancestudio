-- Documentation/draft only. Do not apply from this PR automatically.
-- The recommended full trainer visibility patch is in:
--   sql/trainer_visibility_rpcs.sql
--
-- public.crm_fetch_schedule_groups()
-- Purpose:
-- - Return safe schedule metadata for ALL active/non-archived studio groups to
--   authenticated admin or active trainer sessions.
-- - Do not filter by current trainer, groups.trainer_id, or trainer_groups.
-- - Keep Attendance scoped separately via public.crm_fetch_my_attendance_groups().

create or replace function public.crm_fetch_schedule_groups()
returns table (
  id text,
  name text,
  direction_id text,
  schedule jsonb,
  trainer_id text,
  trainer_pct numeric,
  created_at timestamptz,
  archived_at timestamptz,
  is_active boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    g.name,
    g.direction_id,
    g.schedule,
    g.trainer_id::text as trainer_id,
    g.trainer_pct,
    g.created_at,
    g.archived_at,
    coalesce(g.is_active, true) as is_active
  from public.groups g
  where (public.crm_is_admin_session() or public.crm_is_active_trainer_session())
    and g.archived_at is null
    and coalesce(g.is_active, true) = true
  order by g.name asc;
$$;

revoke execute on function public.crm_fetch_schedule_groups() from public, anon;
grant execute on function public.crm_fetch_schedule_groups() to authenticated;
