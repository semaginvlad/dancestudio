-- Safe subscription usage sync RPC draft for public.subscriptions.
-- Documentation/draft only. Do not apply automatically from this PR.
-- Apply manually in Supabase before previewing the Phase 2 subscriptions
-- security change.
--
-- Purpose:
-- - Move syncSubUsedTrainings(subId) off direct trainer/non-admin reads and
--   updates of public.subscriptions.
-- - Let admin sync any subscription.
-- - Let trainer/non-admin users sync only subscriptions whose group belongs to
--   their auth user through public.groups.trainer_id = auth.uid().
-- - Recalculate used_trainings from public.attendance rows for the subscription.
-- - Update only operational subscription fields:
--   used_trainings, activation_date, end_date, original_end_date.
-- - Do not update financial/admin fields:
--   amount, base_price, discount_pct, discount_source, paid, pay_method, notes.
-- - Return only attendance-safe subscription fields.
--
-- This draft does not change RLS policies, insert/update/delete subscription
-- flows, one-off trial/single logic, cancellation logic, fetch subscriptions
-- reads, Schedule, salary/revenue, Telegram, or Instagram.

create or replace function public.crm_sync_subscription_usage(p_sub_id uuid)
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
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.subscriptions%rowtype;
  v_updated public.subscriptions%rowtype;
  v_is_admin boolean;
  v_has_group_access boolean;
  v_used_trainings integer := 0;
  v_first_date date;
  v_last_date date;
  v_activation_date date;
  v_end_date date;
  v_original_end_date date;
  v_plan_type text;
  v_is_pack boolean;
  v_is_fully_used boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_sub_id is null then
    raise exception 'p_sub_id is required' using errcode = '22023';
  end if;

  select *
  into v_sub
  from public.subscriptions s
  where s.id = p_sub_id;

  if not found then
    raise exception 'Subscription % not found', p_sub_id using errcode = 'P0002';
  end if;

  v_is_admin := lower(coalesce(auth.jwt() ->> 'email', '')) = lower('semagin.vlad@gmail.com');

  select exists (
    select 1
    from public.groups g
    where g.id = v_sub.group_id
      and g.trainer_id::text = auth.uid()::text
  ) into v_has_group_access;

  if not (v_is_admin or v_has_group_access) then
    raise exception 'Not allowed to sync subscription %', p_sub_id using errcode = '42501';
  end if;

  select
    coalesce(sum(coalesce(a.quantity, 1)), 0)::integer,
    min(a.date),
    max(a.date)
  into v_used_trainings, v_first_date, v_last_date
  from public.attendance a
  where a.sub_id = p_sub_id;

  v_activation_date := v_sub.activation_date;
  v_end_date := v_sub.end_date;
  v_original_end_date := v_sub.original_end_date;

  if v_original_end_date is null and v_sub.end_date is not null then
    v_original_end_date := v_sub.end_date;
  end if;

  if v_first_date is not null then
    if v_activation_date is null or v_activation_date <> v_first_date then
      v_activation_date := v_first_date;
      v_end_date := (
        date_trunc('month', v_first_date)::date
        + interval '1 month'
        + ((extract(day from v_first_date)::integer - 1) * interval '1 day')
      )::date;
    end if;

    v_plan_type := lower(coalesce(v_sub.plan_type, ''));
    v_is_pack := v_plan_type in ('4pack', '8pack', '12pack');
    v_is_fully_used := coalesce(v_sub.total_trainings, 0) > 0
      and v_used_trainings >= coalesce(v_sub.total_trainings, 0);

    if v_is_pack then
      if v_is_fully_used
        and v_last_date is not null
        and v_sub.end_date is not null
        and v_last_date < v_sub.end_date
      then
        v_end_date := v_last_date;
      elsif not v_is_fully_used
        and coalesce(v_sub.original_end_date, v_sub.end_date) is not null
        and v_sub.end_date is not null
        and v_sub.end_date < coalesce(v_sub.original_end_date, v_sub.end_date)
      then
        v_end_date := coalesce(v_sub.original_end_date, v_sub.end_date);
      end if;
    end if;
  else
    if v_activation_date is not null then
      v_activation_date := null;
      if v_sub.start_date is not null then
        v_end_date := (
          date_trunc('month', v_sub.start_date)::date
          + interval '1 month'
          + ((extract(day from v_sub.start_date)::integer - 1) * interval '1 day')
        )::date;
      end if;
    end if;
  end if;

  update public.subscriptions s
  set
    used_trainings = v_used_trainings,
    activation_date = v_activation_date,
    end_date = v_end_date,
    original_end_date = v_original_end_date
  where s.id = p_sub_id
  returning * into v_updated;

  return query
  select
    v_updated.id,
    v_updated.student_id,
    v_updated.group_id,
    v_updated.plan_type,
    v_updated.start_date,
    v_updated.end_date,
    v_updated.total_trainings,
    v_updated.used_trainings,
    v_updated.notification_sent,
    v_updated.created_at,
    v_updated.activation_date,
    v_updated.original_end_date;
end;
$$;

revoke execute on function public.crm_sync_subscription_usage(uuid) from public, anon;
grant execute on function public.crm_sync_subscription_usage(uuid) to authenticated;
