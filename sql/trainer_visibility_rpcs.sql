-- Documentation/draft only. Do not apply from this PR automatically.
-- Apply manually in Supabase SQL Editor to make trainer schedule/attendance
-- visibility independent from base-table RLS policies.
--
-- Purpose:
-- - Schedule: active trainers can read safe metadata for ALL active studio groups.
-- - Attendance: active trainers can read safe metadata only for groups linked to
--   their trainer profile through public.trainer_groups.
-- - Do not expose students, subscriptions, attendance rows, payments, salary, or
--   private trainer notes/contacts from these RPCs.

begin;

create or replace function public.crm_is_active_trainer_session()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trainers t
    where t.auth_user_id = auth.uid()
      and coalesce(t.is_active, true) = true
      and t.archived_at is null
      and t.access_disabled_at is null
  );
$$;

create or replace function public.crm_is_admin_session()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
      or coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'admin';
$$;

-- Full safe schedule groups list. This intentionally does NOT join/filter by
-- trainer_groups and does NOT filter by groups.trainer_id/current trainer.
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

-- Attendance-safe group list for the current trainer. This intentionally uses
-- trainer_groups as the access source and does NOT require groups.trainer_id to
-- match the trainer, so one group can be shared by multiple trainers.
create or replace function public.crm_fetch_my_attendance_groups()
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
  select distinct
    g.id,
    g.name,
    g.direction_id,
    g.schedule,
    g.trainer_id::text as trainer_id,
    g.trainer_pct,
    g.created_at,
    g.archived_at,
    coalesce(g.is_active, true) as is_active
  from public.trainers t
  join public.trainer_groups tg on tg.trainer_id = t.id
  join public.groups g on g.id = tg.group_id
  where t.auth_user_id = auth.uid()
    and coalesce(t.is_active, true) = true
    and t.archived_at is null
    and t.access_disabled_at is null
    and g.archived_at is null
    and coalesce(g.is_active, true) = true
  order by g.name asc;
$$;


-- Compatibility predicate used by existing Attendance RLS drafts/policies. The
-- previous drafts checked groups.trainer_id, which breaks substitutions and
-- many-to-many trainer access. Keep the predicate narrow: it only returns true
-- when the current authenticated user has an active trainer profile linked to
-- p_group_id through trainer_groups.
create or replace function public.rls_owns_group(p_group_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trainers t
    join public.trainer_groups tg on tg.trainer_id = t.id
    where t.auth_user_id = auth.uid()
      and coalesce(t.is_active, true) = true
      and t.archived_at is null
      and t.access_disabled_at is null
      and tg.group_id = p_group_id
  );
$$;

-- Attendance-safe subscription read should use the same trainer_groups access
-- source. It intentionally keeps the previous safe column list and does not
-- return payment/salary/private subscription fields to trainers.
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
  from public.trainers t
  join public.trainer_groups tg on tg.trainer_id = t.id
  join public.subscriptions s on s.group_id = tg.group_id
  where t.auth_user_id = auth.uid()
    and coalesce(t.is_active, true) = true
    and t.archived_at is null
    and t.access_disabled_at is null
  order by s.created_at desc;
$$;

revoke execute on function public.crm_is_active_trainer_session() from public, anon;
revoke execute on function public.crm_is_admin_session() from public, anon;
revoke execute on function public.crm_fetch_schedule_groups() from public, anon;
revoke execute on function public.crm_fetch_my_attendance_groups() from public, anon;
revoke execute on function public.rls_owns_group(text) from public, anon;
revoke execute on function public.crm_fetch_my_attendance_subscriptions() from public, anon;

grant execute on function public.crm_is_active_trainer_session() to authenticated;
grant execute on function public.crm_is_admin_session() to authenticated;
grant execute on function public.crm_fetch_schedule_groups() to authenticated;
grant execute on function public.crm_fetch_my_attendance_groups() to authenticated;
grant execute on function public.rls_owns_group(text) to authenticated;
grant execute on function public.crm_fetch_my_attendance_subscriptions() to authenticated;

commit;
