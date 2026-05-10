-- Safe one-off subscription RPC draft for public.subscriptions.
-- Documentation/draft only. Do not apply automatically from this PR.
-- Apply manually in Supabase before previewing the Phase 2 subscriptions
-- security change.
--
-- Purpose:
-- - Move Attendance trial/single one-off subscription creation/deletion off
--   direct trainer/non-admin writes to public.subscriptions.
-- - Let admin manage one-off rows for any attendance row.
-- - Let trainer/non-admin users manage one-off rows only for attendance rows
--   whose group belongs to their auth user through public.groups.trainer_id =
--   auth.uid().
-- - Work only for entry_type/guest_type trial and single.
-- - Do not accept amount, base_price, discount_pct, discount_source, paid,
--   pay_method, or notes from the client.
-- - Set one-off financial values server-side:
--   trial = 150, single = 300, paid = true, pay_method = 'card'.
-- - Return only attendance-safe subscription fields from the ensure RPC.
--
-- This draft does not change RLS policies, fetch subscriptions reads,
-- syncSubUsedTrainings, insert/update/delete subscription forms, cancellation
-- logic, Schedule, salary/revenue, Telegram, or Instagram.

create or replace function public.crm_ensure_one_off_payment_for_attendance(
  p_attendance_id uuid
)
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
  v_att public.attendance%rowtype;
  v_sub public.subscriptions%rowtype;
  v_is_admin boolean;
  v_has_group_access boolean;
  v_entry_type text;
  v_amount integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_attendance_id is null then
    raise exception 'p_attendance_id is required' using errcode = '22023';
  end if;

  select *
  into v_att
  from public.attendance a
  where a.id = p_attendance_id;

  if not found then
    raise exception 'Attendance % not found', p_attendance_id using errcode = 'P0002';
  end if;

  v_is_admin := lower(coalesce(auth.jwt() ->> 'email', '')) = lower('semagin.vlad@gmail.com');

  select exists (
    select 1
    from public.groups g
    where g.id = v_att.group_id
      and g.trainer_id::text = auth.uid()::text
  ) into v_has_group_access;

  if not (v_is_admin or v_has_group_access) then
    raise exception 'Not allowed to manage one-off payment for attendance %', p_attendance_id using errcode = '42501';
  end if;

  v_entry_type := lower(nullif(btrim(coalesce(v_att.entry_type, v_att.guest_type, '')), ''));
  if v_entry_type not in ('trial', 'single') then
    return;
  end if;

  if v_att.student_id is null or v_att.group_id is null or v_att.date is null then
    return;
  end if;

  v_amount := case v_entry_type
    when 'trial' then 150
    when 'single' then 300
  end;

  select *
  into v_sub
  from public.subscriptions s
  where s.student_id = v_att.student_id
    and s.group_id = v_att.group_id
    and s.plan_type = v_entry_type
    and s.activation_date = v_att.date
    and s.start_date = v_att.date
    and s.end_date = v_att.date
    and s.paid = true
  order by s.created_at asc
  limit 1;

  if not found then
    insert into public.subscriptions (
      student_id,
      group_id,
      plan_type,
      start_date,
      end_date,
      activation_date,
      original_end_date,
      total_trainings,
      used_trainings,
      amount,
      base_price,
      discount_pct,
      discount_source,
      paid,
      pay_method,
      notification_sent,
      notes
    ) values (
      v_att.student_id,
      v_att.group_id,
      v_entry_type,
      v_att.date,
      v_att.date,
      v_att.date,
      v_att.date,
      1,
      1,
      v_amount,
      v_amount,
      0,
      'studio',
      true,
      'card',
      false,
      'auto_one_off_from_attendance:' || p_attendance_id::text
    )
    returning * into v_sub;
  end if;

  return query
  select
    v_sub.id,
    v_sub.student_id,
    v_sub.group_id,
    v_sub.plan_type,
    v_sub.start_date,
    v_sub.end_date,
    v_sub.total_trainings,
    v_sub.used_trainings,
    v_sub.notification_sent,
    v_sub.created_at,
    v_sub.activation_date,
    v_sub.original_end_date;
end;
$$;

revoke execute on function public.crm_ensure_one_off_payment_for_attendance(uuid) from public, anon;
grant execute on function public.crm_ensure_one_off_payment_for_attendance(uuid) to authenticated;

create or replace function public.crm_remove_one_off_payment_if_orphan(
  p_attendance_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_att public.attendance%rowtype;
  v_is_admin boolean;
  v_has_group_access boolean;
  v_entry_type text;
  v_has_other_attendance boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_attendance_id is null then
    raise exception 'p_attendance_id is required' using errcode = '22023';
  end if;

  select *
  into v_att
  from public.attendance a
  where a.id = p_attendance_id;

  if not found then
    return;
  end if;

  v_is_admin := lower(coalesce(auth.jwt() ->> 'email', '')) = lower('semagin.vlad@gmail.com');

  select exists (
    select 1
    from public.groups g
    where g.id = v_att.group_id
      and g.trainer_id::text = auth.uid()::text
  ) into v_has_group_access;

  if not (v_is_admin or v_has_group_access) then
    raise exception 'Not allowed to remove one-off payment for attendance %', p_attendance_id using errcode = '42501';
  end if;

  v_entry_type := lower(nullif(btrim(coalesce(v_att.entry_type, v_att.guest_type, '')), ''));
  if v_entry_type not in ('trial', 'single') then
    return;
  end if;

  if v_att.student_id is null or v_att.group_id is null or v_att.date is null then
    return;
  end if;

  select exists (
    select 1
    from public.attendance a
    where a.id <> p_attendance_id
      and a.student_id = v_att.student_id
      and a.group_id = v_att.group_id
      and a.date = v_att.date
      and lower(coalesce(a.entry_type, a.guest_type, '')) = v_entry_type
  ) into v_has_other_attendance;

  if v_has_other_attendance then
    return;
  end if;

  delete from public.subscriptions s
  where s.student_id = v_att.student_id
    and s.group_id = v_att.group_id
    and s.plan_type = v_entry_type
    and s.activation_date = v_att.date
    and s.start_date = v_att.date
    and s.end_date = v_att.date
    and s.total_trainings = 1
    and s.used_trainings = 1;
end;
$$;

revoke execute on function public.crm_remove_one_off_payment_if_orphan(uuid) from public, anon;
grant execute on function public.crm_remove_one_off_payment_if_orphan(uuid) to authenticated;
