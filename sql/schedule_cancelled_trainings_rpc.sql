-- Documentation/draft only. Do not apply from this PR.
-- Review and apply manually in Supabase before enabling RLS on
-- public.cancelled_trainings.
--
-- RPC: public.crm_fetch_schedule_cancelled_trainings()
--
-- Purpose:
-- - Let Schedule show the wider cancellation calendar for trainer/non-admin users.
-- - Preserve full cancelled_trainings rows for the admin email and for the
--   trainer who owns the cancelled row's group.
-- - Mask service data stored in reason, including originalEnds, for other
--   trainers' groups.
-- - Trainer Attendance should continue using direct public.cancelled_trainings
--   reads scoped by RLS to own groups only.

create or replace function public.crm_fetch_schedule_cancelled_trainings()
returns table (
  id text,
  group_id text,
  date date,
  reason text
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
    ct.id::text as id,
    ct.group_id::text as group_id,
    ct.date,
    case
      when current_actor.email = 'semagin.vlad@gmail.com'
        or g.trainer_id::text = current_actor.user_id
      then ct.reason
      else null
    end as reason
  from public.cancelled_trainings ct
  left join public.groups g on g.id::text = ct.group_id::text
  cross join current_actor
  order by ct.date asc, ct.group_id::text asc;
$$;

revoke execute on function public.crm_fetch_schedule_cancelled_trainings() from public, anon;
grant execute on function public.crm_fetch_schedule_cancelled_trainings() to authenticated;
