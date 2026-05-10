-- Safe cancellation RPC draft for public.subscriptions and public.cancelled_trainings.
-- Documentation/draft only. Do not apply automatically from this PR.
-- Apply manually in Supabase before previewing the Phase 2 subscriptions
-- cancellation security change.
--
-- Purpose:
-- - Move Attendance cancellation/restore subscription end_date changes off
--   direct trainer/non-admin updates to public.subscriptions.
-- - Let admin cancel/restore trainings for any group.
-- - Let trainer/non-admin users cancel/restore only trainings for groups that
--   belong to their auth user through public.groups.trainer_id = auth.uid().
-- - Update only operational subscription fields: end_date and original_end_date
--   when it is missing.
-- - Do not update financial/admin fields:
--   amount, base_price, discount_pct, discount_source, paid, pay_method, notes.
-- - Store cancelled_trainings.reason as the existing originalEnds JSON array.
-- - Return affected safe subscription rows and the cancelled_trainings row.
--
-- This draft does not change RLS policies, fetch subscriptions reads,
-- syncSubUsedTrainings, trial/single one-off logic, insert/update/delete
-- subscription admin forms, Schedule, salary/revenue, Telegram, or Instagram.

create or replace function public.crm_cancel_training_for_group(
  p_group_id text,
  p_date date
)
returns table (
  cancelled_training jsonb,
  subscriptions jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.groups%rowtype;
  v_cancelled public.cancelled_trainings%rowtype;
  v_is_admin boolean;
  v_has_group_access boolean;
  v_original_ends jsonb := '[]'::jsonb;
  v_sub record;
  v_new_end date;
  v_schedule jsonb;
  v_target_days integer[];
  v_cursor date;
  v_updated_ids uuid[] := array[]::uuid[];
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_group_id is null or btrim(p_group_id) = '' then
    raise exception 'p_group_id is required' using errcode = '22023';
  end if;

  if p_date is null then
    raise exception 'p_date is required' using errcode = '22023';
  end if;

  select * into v_group from public.groups g where g.id = p_group_id;
  if not found then
    raise exception 'Group % not found', p_group_id using errcode = 'P0002';
  end if;

  v_is_admin := lower(coalesce(auth.jwt() ->> 'email', '')) = lower('semagin.vlad@gmail.com');
  v_has_group_access := v_group.trainer_id::text = auth.uid()::text;

  if not (v_is_admin or v_has_group_access) then
    raise exception 'Not allowed to cancel training for group %', p_group_id using errcode = '42501';
  end if;

  v_schedule := coalesce(to_jsonb(v_group.schedule), '[]'::jsonb);
  select coalesce(array_agg((item ->> 'day')::integer), array[]::integer[])
  into v_target_days
  from jsonb_array_elements(v_schedule) item
  where item ? 'day'
    and (item ->> 'day') ~ '^[0-6]$';

  for v_sub in
    select s.*
    from public.subscriptions s
    where s.group_id = p_group_id
      and lower(coalesce(s.plan_type, '')) in ('4pack', '8pack', '12pack')
      and coalesce(s.start_date, date '0001-01-01') <= p_date
      and coalesce(s.end_date, date '2099-12-31') >= p_date
    order by s.created_at asc
  loop
    if array_length(v_target_days, 1) is null or v_sub.end_date is null then
      v_new_end := coalesce(v_sub.end_date, p_date) + 7;
    else
      v_new_end := v_sub.end_date;
      v_cursor := v_sub.end_date;
      for i in 1..14 loop
        v_cursor := v_cursor + 1;
        if extract(dow from v_cursor)::integer = any(v_target_days) then
          v_new_end := v_cursor;
          exit;
        end if;
      end loop;
    end if;

    update public.subscriptions s
    set
      end_date = v_new_end,
      original_end_date = coalesce(s.original_end_date, v_sub.end_date)
    where s.id = v_sub.id;

    v_updated_ids := array_append(v_updated_ids, v_sub.id);
    v_original_ends := v_original_ends || jsonb_build_array(jsonb_build_object(
      'subId', v_sub.id,
      'oldEndDate', v_sub.end_date,
      'newEndDate', v_new_end
    ));
  end loop;

  select *
  into v_cancelled
  from public.cancelled_trainings c
  where c.group_id = p_group_id
    and c.date = p_date
  order by c.created_at asc
  limit 1;

  if found then
    update public.cancelled_trainings c
    set reason = v_original_ends::text
    where c.id = v_cancelled.id
    returning * into v_cancelled;
  else
    insert into public.cancelled_trainings (group_id, date, reason)
    values (p_group_id, p_date, v_original_ends::text)
    returning * into v_cancelled;
  end if;

  return query
  select
    to_jsonb(v_cancelled) as cancelled_training,
    coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id,
      'student_id', s.student_id,
      'group_id', s.group_id,
      'plan_type', s.plan_type,
      'start_date', s.start_date,
      'end_date', s.end_date,
      'total_trainings', s.total_trainings,
      'used_trainings', s.used_trainings,
      'notification_sent', s.notification_sent,
      'created_at', s.created_at,
      'activation_date', s.activation_date,
      'original_end_date', s.original_end_date
    )) filter (where s.id is not null), '[]'::jsonb) as subscriptions
  from public.subscriptions s
  where s.id = any(v_updated_ids);
end;
$$;

revoke execute on function public.crm_cancel_training_for_group(text, date) from public, anon;
grant execute on function public.crm_cancel_training_for_group(text, date) to authenticated;

create or replace function public.crm_restore_cancelled_training(
  p_cancelled_id uuid
)
returns table (
  cancelled_training jsonb,
  subscriptions jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cancelled public.cancelled_trainings%rowtype;
  v_group public.groups%rowtype;
  v_is_admin boolean;
  v_has_group_access boolean;
  v_original_ends jsonb;
  v_item jsonb;
  v_sub_id uuid;
  v_old_end date;
  v_updated_ids uuid[] := array[]::uuid[];
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_cancelled_id is null then
    raise exception 'p_cancelled_id is required' using errcode = '22023';
  end if;

  select *
  into v_cancelled
  from public.cancelled_trainings c
  where c.id = p_cancelled_id;

  if not found then
    raise exception 'Cancelled training % not found', p_cancelled_id using errcode = 'P0002';
  end if;

  select * into v_group from public.groups g where g.id = v_cancelled.group_id;
  if not found then
    raise exception 'Group % not found', v_cancelled.group_id using errcode = 'P0002';
  end if;

  v_is_admin := lower(coalesce(auth.jwt() ->> 'email', '')) = lower('semagin.vlad@gmail.com');
  v_has_group_access := v_group.trainer_id::text = auth.uid()::text;

  if not (v_is_admin or v_has_group_access) then
    raise exception 'Not allowed to restore cancelled training %', p_cancelled_id using errcode = '42501';
  end if;

  begin
    v_original_ends := coalesce(v_cancelled.reason::jsonb, '[]'::jsonb);
  exception when others then
    v_original_ends := '[]'::jsonb;
  end;

  if jsonb_typeof(v_original_ends) = 'array' then
    for v_item in select value from jsonb_array_elements(v_original_ends) loop
      v_sub_id := nullif(v_item ->> 'subId', '')::uuid;
      v_old_end := nullif(v_item ->> 'oldEndDate', '')::date;
      if v_sub_id is null then
        continue;
      end if;

      update public.subscriptions s
      set
        end_date = v_old_end,
        original_end_date = coalesce(v_old_end, s.original_end_date)
      where s.id = v_sub_id
        and s.group_id = v_cancelled.group_id
        and lower(coalesce(s.plan_type, '')) in ('4pack', '8pack', '12pack');

      if found then
        v_updated_ids := array_append(v_updated_ids, v_sub_id);
      end if;
    end loop;
  elsif jsonb_typeof(v_original_ends) = 'object' then
    for v_item in select jsonb_build_object('subId', key, 'oldEndDate', value) from jsonb_each_text(v_original_ends) loop
      v_sub_id := nullif(v_item ->> 'subId', '')::uuid;
      v_old_end := nullif(v_item ->> 'oldEndDate', '')::date;
      if v_sub_id is null then
        continue;
      end if;

      update public.subscriptions s
      set
        end_date = v_old_end,
        original_end_date = coalesce(v_old_end, s.original_end_date)
      where s.id = v_sub_id
        and s.group_id = v_cancelled.group_id
        and lower(coalesce(s.plan_type, '')) in ('4pack', '8pack', '12pack');

      if found then
        v_updated_ids := array_append(v_updated_ids, v_sub_id);
      end if;
    end loop;
  end if;

  delete from public.cancelled_trainings c
  where c.id = p_cancelled_id;

  return query
  select
    to_jsonb(v_cancelled) as cancelled_training,
    coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id,
      'student_id', s.student_id,
      'group_id', s.group_id,
      'plan_type', s.plan_type,
      'start_date', s.start_date,
      'end_date', s.end_date,
      'total_trainings', s.total_trainings,
      'used_trainings', s.used_trainings,
      'notification_sent', s.notification_sent,
      'created_at', s.created_at,
      'activation_date', s.activation_date,
      'original_end_date', s.original_end_date
    )) filter (where s.id is not null), '[]'::jsonb) as subscriptions
  from public.subscriptions s
  where s.id = any(v_updated_ids);
end;
$$;

revoke execute on function public.crm_restore_cancelled_training(uuid) from public, anon;
grant execute on function public.crm_restore_cancelled_training(uuid) to authenticated;
