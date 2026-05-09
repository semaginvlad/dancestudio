-- Safe read RPC draft for public.subscriptions used by trainer Attendance.
-- Documentation/draft only. Do not apply from this PR.
-- The RPC below has already been applied manually in Supabase:
--   public.crm_fetch_my_attendance_subscriptions()
--
-- Purpose:
-- - Let authenticated trainers read only subscriptions for groups they own.
-- - Return only attendance-safe subscription fields needed by the UI.
-- - Do not expose financial/admin fields to trainers:
--   amount, base_price, discount_pct, discount_source, paid, pay_method, notes.
--
-- This draft does not change RLS policies, insert/update/delete subscription
-- flows, syncSubUsedTrainings, one-off trial/single logic, cancellation logic,
-- Schedule, salary/revenue, Telegram, or Instagram.

create or replace function public.crm_fetch_my_attendance_subscriptions()
returns table (
  id uuid,
  student_id uuid,
  group_id text,
  plan_type text,
  start_date date,
  end_date date,
  total_trainings integer,
  used_trainings integer,
  notification_sent boolean,
  created_at timestamptz,
  activation_date date,
  original_end_date date
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.student_id,
    s.group_id,
    s.plan_type,
    s.start_date,
    s.end_date,
    s.total_trainings,
    s.used_trainings,
    s.notification_sent,
    s.created_at,
    s.activation_date,
    s.original_end_date
  from public.subscriptions s
  join public.groups g on g.id = s.group_id
  where g.trainer_id::text = auth.uid()::text
  order by s.created_at desc;
$$;

revoke execute on function public.crm_fetch_my_attendance_subscriptions() from public, anon;
grant execute on function public.crm_fetch_my_attendance_subscriptions() to authenticated;
