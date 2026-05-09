-- Documentation/draft only. Do not apply from this PR.
-- The production Supabase project already has this RPC applied manually:
-- public.crm_fetch_schedule_cancelled_trainings()
--
-- Purpose:
-- - Return the wider cancelled-training read model for trainer/non-admin Schedule.
-- - Admin can see cancellation reason/originalEnds for every row.
-- - The owner trainer can see cancellation reason/originalEnds for their groups.
-- - Other trainers can see that the training is cancelled, but reason is masked
--   to null server-side.
-- - Attendance must continue to use normal scoped cancelled_trainings reads.

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
  left join public.groups g on g.id = ct.group_id
  cross join current_actor
  order by ct.date asc, ct.group_id asc;
$$;

revoke execute on function public.crm_fetch_schedule_cancelled_trainings() from public, anon;
grant execute on function public.crm_fetch_schedule_cancelled_trainings() to authenticated;
