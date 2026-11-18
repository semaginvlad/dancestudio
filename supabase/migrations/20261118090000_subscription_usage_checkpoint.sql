-- Existing subscriptions have no trustworthy record of a pre-exhaustion date.
alter table public.subscriptions
  add column usage_expiry_checkpoint date,
  add column usage_expiry_state text not null default 'legacy_unknown';
alter table public.subscriptions alter column usage_expiry_state set default 'ready';
alter table public.subscriptions add constraint subscriptions_usage_expiry_checkpoint_check
  check ((usage_expiry_state in ('legacy_unknown', 'ready') and usage_expiry_checkpoint is null)
      or (usage_expiry_state = 'captured' and usage_expiry_checkpoint is not null));

-- Caller must be authorized before invoking this private helper. The row lock
-- serializes reconciliation of the same subscription in the current transaction.
create or replace function public.crm_reconcile_subscription_usage(p_sub_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_sub public.subscriptions%rowtype;
  v_used integer;
  v_last date;
  v_end date;
  v_checkpoint date;
  v_state text;
begin
  select * into v_sub from public.subscriptions where id = p_sub_id for update;
  if not found then raise exception 'Subscription not found' using errcode = 'P0002'; end if;
  select coalesce(sum(coalesce(a.quantity, 1)), 0)::integer, max(a.date)
    into v_used, v_last from public.attendance a where a.sub_id = p_sub_id;
  v_end := v_sub.end_date;
  v_checkpoint := v_sub.usage_expiry_checkpoint;
  v_state := v_sub.usage_expiry_state;
  if v_state = 'captured' then
    if coalesce(v_sub.total_trainings, 0) <= 0 or v_used < v_sub.total_trainings or v_last is null then
      v_end := v_checkpoint;
      v_checkpoint := null;
      v_state := 'ready';
    else
      v_end := least(v_checkpoint, v_last);
    end if;
  elsif v_state = 'ready' and coalesce(v_sub.total_trainings, 0) > 0
      and v_used >= v_sub.total_trainings and v_last is not null
      and v_end is not null and v_last < v_end then
    v_checkpoint := v_end;
    v_end := v_last;
    v_state := 'captured';
  end if;
  update public.subscriptions set used_trainings = v_used, end_date = v_end,
    usage_expiry_checkpoint = v_checkpoint, usage_expiry_state = v_state
    where id = p_sub_id;
end $$;
revoke all on function public.crm_reconcile_subscription_usage(uuid) from public, anon, authenticated;

-- Direct authorized attendance mutations and legacy clients must reconcile in
-- the same transaction. Lock subscriptions in a deterministic order on relink.
create or replace function public.crm_reconcile_attendance_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_old_sub public.subscriptions%rowtype;
  v_remaining integer;
begin
  -- A legacy expiry equal to the removed final attendance may already have
  -- been shortened by the old implementation. Its previous base is unknown.
  if tg_op <> 'INSERT' and old.sub_id is not null
      and (tg_op = 'DELETE' or new.sub_id is distinct from old.sub_id
           or coalesce(new.quantity, 1) < coalesce(old.quantity, 1)) then
    select * into v_old_sub from public.subscriptions where id = old.sub_id for update;
    if found and v_old_sub.usage_expiry_state = 'legacy_unknown'
        and v_old_sub.end_date = old.date
        and coalesce(v_old_sub.total_trainings, 0) > 0
        and coalesce(v_old_sub.used_trainings, 0) >= v_old_sub.total_trainings then
      select coalesce(sum(coalesce(a.quantity, 1)), 0)::integer into v_remaining
        from public.attendance a where a.sub_id = old.sub_id;
      if v_remaining < v_old_sub.total_trainings then
        if public.crm_is_admin_session() then
          raise exception 'Для цього старого абонемента потрібно вручну перевірити дату завершення' using errcode = 'P0001';
        else
          raise exception 'Для перевірки дати завершення зверніться до адміністратора' using errcode = 'P0001';
        end if;
      end if;
    end if;
  end if;
  for v_id in
    select distinct id from unnest(array[
      case when tg_op <> 'INSERT' then old.sub_id end,
      case when tg_op <> 'DELETE' then new.sub_id end
    ]) id where id is not null order by id
  loop
    perform public.crm_reconcile_subscription_usage(v_id);
  end loop;
  return null;
end $$;
revoke all on function public.crm_reconcile_attendance_change() from public, anon, authenticated;
create trigger attendance_reconcile_subscription_usage
  after insert or delete or update of sub_id, quantity, date on public.attendance
  for each row execute function public.crm_reconcile_attendance_change();

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
  v_next_end_date date;
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

  select min(a.date) into v_first_date from public.attendance a where a.sub_id = p_sub_id;
  update public.subscriptions s set activation_date = v_first_date where s.id = p_sub_id;
  perform public.crm_reconcile_subscription_usage(p_sub_id);
  select * into v_updated from public.subscriptions s where s.id = p_sub_id;

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

-- Preserve atomic desired-count semantics while storing repeated units in one row.
create or replace function public.crm_set_auto_attendance(
  p_student_id uuid, p_group_id text, p_date date, p_quantity integer
) returns void language plpgsql security definer set search_path = public as $$
declare
  decision record;
  current_count integer;
  item public.attendance%rowtype;
  affected uuid[] := '{}'::uuid[];
  affected_id uuid;
begin
  if auth.uid() is null then raise exception 'Потрібна авторизація' using errcode = '28000'; end if;
  if p_student_id is null or p_group_id is null or p_date is null or p_quantity is null or p_quantity not between 0 and 2 then
    raise exception 'Некоректна учениця, група, дата або кількість' using errcode = '22023';
  end if;
  if not (public.crm_is_admin_session() or public.rls_can_record_attendance(p_student_id, p_group_id)) then
    raise exception 'Немає доступу до учениці в цій групі' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text || ':' || p_group_id, 0));
  -- Historical or financial rows are not reinterpreted or changed by this flow.
  if exists (select 1 from public.attendance a
    where a.student_id = p_student_id and a.group_id = p_group_id and a.date = p_date
      and (a.queue_auto_order is null or a.guest_name is not null or a.guest_type is not null
        or a.price_snapshot_uah is not null or a.entry_type not in ('subscription', 'debt')
        or a.entry_type is null or coalesce(a.quantity, 0) not between 1 and 2
        or (a.entry_type = 'debt' and a.sub_id is not null)
        or (a.entry_type = 'subscription' and a.sub_id is null)
        or exists (select 1 from public.financial_operations f where f.attendance_id = a.id or f.attendance_source_id = a.id))) then
    raise exception 'Історичну або фінансову відмітку може змінити лише адміністратор.' using errcode = 'P0001';
  end if;
  select coalesce(sum(a.quantity), 0)::integer into current_count from public.attendance a
    where a.student_id = p_student_id and a.group_id = p_group_id and a.date = p_date;
  if current_count > 2 then raise exception 'Некоректна кількість Auto-відміток. Зверніться до адміністратора.'; end if;
  while current_count < p_quantity loop
    select * into decision from public.crm_record_subscription_queue_activation(p_student_id, p_group_id, p_date);
    if decision.result = 'ambiguity' then
      raise exception 'Черга абонементів неоднозначна або пошкоджена. Зверніться до адміністратора.' using errcode = 'P0001';
    end if;
    if decision.result not in ('subscription', 'debt') then raise exception 'Невідомий результат перевірки абонемента'; end if;
    -- Reuse the existing row for the same subscription (or debt). The unique
    -- attendance key forbids another row for the same student/date/subscription.
    select a.* into item from public.attendance a
      where a.student_id = p_student_id and a.group_id = p_group_id and a.date = p_date
        and a.entry_type = decision.result and a.sub_id is not distinct from decision.subscription_id
      order by a.queue_auto_order desc limit 1 for update;
    if found then
      update public.attendance set quantity = quantity + 1 where id = item.id;
    else
      insert into public.attendance (student_id, group_id, date, sub_id, entry_type, quantity, queue_auto_order)
        values (p_student_id, p_group_id, p_date, decision.subscription_id, decision.result, 1, nextval('public.crm_auto_attendance_order_seq'));
    end if;
    if decision.subscription_id is not null then
      -- The next loop iteration must resolve against the freshly updated usage.
      perform public.crm_reconcile_subscription_usage(decision.subscription_id);
    end if;
    current_count := current_count + 1;
  end loop;
  while current_count > p_quantity loop
    select a.* into item from public.attendance a
      where a.student_id = p_student_id and a.group_id = p_group_id and a.date = p_date
      order by a.queue_auto_order desc limit 1 for update;
    if item.quantity > 1 then
      update public.attendance set quantity = quantity - 1 where id = item.id;
    else
      delete from public.attendance where id = item.id;
    end if;
    if item.sub_id is not null then affected := array_append(affected, item.sub_id); end if;
    current_count := current_count - 1;
  end loop;
  foreach affected_id in array affected loop
    perform public.crm_reconcile_subscription_usage(affected_id);
  end loop;
end $$;
revoke all on function public.crm_set_auto_attendance(uuid, text, date, integer) from public, anon;
grant execute on function public.crm_set_auto_attendance(uuid, text, date, integer) to authenticated;

-- Delete only ordinary Queue-Auto marks visible in a trainer's assigned group.
-- No direct attendance policy is relaxed and no financial fields are exposed.
create or replace function public.crm_remove_my_auto_attendance(
  p_student_id uuid, p_group_id text, p_date date
) returns void language plpgsql security definer set search_path = public as $$
declare
  item public.attendance%rowtype;
  affected uuid[] := '{}'::uuid[];
  affected_id uuid;
begin
  if auth.uid() is null then raise exception 'Потрібна авторизація' using errcode = '28000'; end if;
  if p_student_id is null or p_group_id is null or p_date is null then
    raise exception 'Некоректна учениця, група або дата' using errcode = '22023';
  end if;
  if not public.rls_owns_group(p_group_id) then
    raise exception 'Немає доступу до цієї групи' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text || ':' || p_group_id, 0));
  perform 1 from public.attendance a
    where a.student_id = p_student_id and a.group_id = p_group_id and a.date = p_date
    for update;
  if exists (select 1 from public.attendance a
    where a.student_id = p_student_id and a.group_id = p_group_id and a.date = p_date
      and (a.queue_auto_order is null or a.guest_name is not null or a.guest_type is not null
        or a.price_snapshot_uah is not null or a.entry_type is null
        or a.entry_type not in ('subscription', 'debt') or coalesce(a.quantity, 0) not between 1 and 2
        or (a.entry_type = 'debt' and a.sub_id is not null)
        or (a.entry_type = 'subscription' and a.sub_id is null)
        or exists (select 1 from public.financial_operations f
          where f.attendance_id = a.id or f.attendance_source_id = a.id))) then
    raise exception 'Цю відмітку може скасувати адміністратор.' using errcode = 'P0001';
  end if;
  for item in select a.* from public.attendance a
    where a.student_id = p_student_id and a.group_id = p_group_id and a.date = p_date
    for update
  loop
    delete from public.attendance where id = item.id;
    if item.sub_id is not null then affected := array_append(affected, item.sub_id); end if;
  end loop;
  foreach affected_id in array affected loop
    perform public.crm_reconcile_subscription_usage(affected_id);
  end loop;
end $$;
revoke all on function public.crm_remove_my_auto_attendance(uuid, text, date) from public, anon;
grant execute on function public.crm_remove_my_auto_attendance(uuid, text, date) to authenticated;

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
  v_base_end date;
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

  perform pg_advisory_xact_lock(hashtextextended('crm-cancellation:' || p_group_id, 0));
  if exists (select 1 from public.cancelled_trainings c where c.group_id = p_group_id and c.date = p_date) then
    raise exception 'Це заняття вже скасовано';
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
      and coalesce(case when s.usage_expiry_state = 'captured' then s.usage_expiry_checkpoint else s.end_date end, date '2099-12-31') >= p_date
    order by s.created_at asc for update
  loop
    v_base_end := case when v_sub.usage_expiry_state = 'captured' then v_sub.usage_expiry_checkpoint else v_sub.end_date end;
    if array_length(v_target_days, 1) is null or v_base_end is null then
      v_new_end := coalesce(v_base_end, p_date) + 7;
    else
      v_new_end := v_base_end;
      v_cursor := v_base_end;
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
      end_date = case when s.usage_expiry_state = 'captured' then s.end_date else v_new_end end,
      usage_expiry_checkpoint = case when s.usage_expiry_state = 'captured' then v_new_end else null end
    where s.id = v_sub.id;
    perform public.crm_reconcile_subscription_usage(v_sub.id);

    v_updated_ids := array_append(v_updated_ids, v_sub.id);
    v_original_ends := v_original_ends || jsonb_build_array(jsonb_build_object(
      'subId', v_sub.id,
      'checkpointVersion', 1,
      'oldEndDate', v_base_end,
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

  perform pg_advisory_xact_lock(hashtextextended('crm-cancellation:' || v_cancelled.group_id, 0));
  select * into v_cancelled from public.cancelled_trainings c where c.id = p_cancelled_id;
  if not found then raise exception 'Cancelled training not found' using errcode = 'P0002'; end if;
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

      perform 1 from public.subscriptions s where s.id = v_sub_id for update;
      if v_item ->> 'checkpointVersion' = '1' and exists (
        select 1 from public.subscriptions s where s.id = v_sub_id
          and (case when s.usage_expiry_state = 'captured' then s.usage_expiry_checkpoint else s.end_date end)
              is distinct from nullif(v_item ->> 'newEndDate', '')::date
      ) then
        raise exception 'Спочатку відновіть пізніші скасування або перевірте строк абонемента';
      end if;
      update public.subscriptions s
      set
        end_date = case when s.usage_expiry_state = 'captured' then s.end_date else v_old_end end,
        usage_expiry_checkpoint = case when s.usage_expiry_state = 'captured' then v_old_end else null end
      where s.id = v_sub_id
        and s.group_id = v_cancelled.group_id
        and lower(coalesce(s.plan_type, '')) in ('4pack', '8pack', '12pack');

      if found then
        perform public.crm_reconcile_subscription_usage(v_sub_id);
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
        end_date = case when s.usage_expiry_state = 'captured' then s.end_date else v_old_end end,
        usage_expiry_checkpoint = case when s.usage_expiry_state = 'captured' then v_old_end else null end
      where s.id = v_sub_id
        and s.group_id = v_cancelled.group_id
        and lower(coalesce(s.plan_type, '')) in ('4pack', '8pack', '12pack');

      if found then
        perform public.crm_reconcile_subscription_usage(v_sub_id);
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
