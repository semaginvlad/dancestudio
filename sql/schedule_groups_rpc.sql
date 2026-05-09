-- Documentation/draft only. Do not apply from this PR.
-- Apply manually in Supabase before enabling RLS that restricts public.groups
-- SELECT for trainer/non-admin users to own groups only.
--
-- Purpose:
-- - Let authenticated users fetch the wider groups read model needed by Schedule.
-- - Keep Attendance on the regular own-groups path while Schedule can still show
--   other group lessons after public.groups RLS becomes own-only for trainers.
-- - Return only schedule-safe group fields; do not expose trainer_pct or future
--   admin/financial fields.

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
