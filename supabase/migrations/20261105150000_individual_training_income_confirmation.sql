begin;

-- Commercial individual trainings become studio income only after an admin
-- confirms the server-created pending operation. Existing finance scenarios are
-- deliberately untouched.
alter table public.room_bookings
  add column financial_series_id uuid;

update public.room_bookings set financial_series_id = id where financial_series_id is null;
alter table public.room_bookings alter column financial_series_id set default gen_random_uuid();
alter table public.room_bookings alter column financial_series_id set not null;

drop index if exists public.financial_operations_active_room_booking_uidx;

alter table public.financial_operations
  add column room_booking_series_id uuid,
  add column occurrence_date date,
  add column event_title_snapshot text,
  add column trainer_id_snapshot text,
  add column trainer_name_snapshot text,
  add column event_start_time_snapshot text,
  add column event_end_time_snapshot text,
  add column room_name_snapshot text,
  add column people_count_snapshot integer;

create unique index financial_operations_active_booking_occurrence_uidx
  on public.financial_operations(room_booking_series_id, occurrence_date)
  where room_booking_series_id is not null
    and occurrence_date is not null
    and status in ('pending', 'posted');

create index financial_operations_pending_individual_idx
  on public.financial_operations(status, category_code, occurrence_date, event_start_time_snapshot)
  where status = 'pending' and category_code = 'individual_training';

create or replace function public.crm_individual_training_occurrence_dates(
  p_start date, p_recurrence text, p_until date
)
returns setof date language plpgsql stable security definer set search_path = public as $$
declare
  v_date date := p_start;
  v_limit date := coalesce(p_until, p_start);
  v_count integer := 0;
begin
  if p_start is null then return; end if;
  loop
    return next v_date;
    exit when v_date >= v_limit or lower(coalesce(p_recurrence, 'none')) = 'none';
    v_date := public.crm_schedule_booking_step_date(v_date, p_recurrence, 1);
    v_count := v_count + 1;
    if v_date is null or v_count > 730 then
      raise exception 'Individual training recurrence is too large' using errcode = '22023';
    end if;
  end loop;
end $$;
revoke execute on function public.crm_individual_training_occurrence_dates(date,text,date) from public, anon, authenticated;

create or replace function public.crm_individual_income_trainer_enabled(p_trainer_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.trainers trainer
    join public.trainer_financial_settings settings on settings.trainer_id = trainer.id
    where settings.individual_income_enabled is true
      and trainer.is_active is true
      and trainer.archived_at is null
      and trainer.access_disabled_at is null
      and p_trainer_id in (trainer.id::text, trainer.auth_user_id::text)
  );
$$;
revoke execute on function public.crm_individual_income_trainer_enabled(text) from public, anon, authenticated;

create or replace function public.crm_reconcile_individual_training_income(p_booking_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_booking public.room_bookings%rowtype;
  v_date date;
  v_enabled boolean;
  v_existing_id uuid;
begin
  select * into v_booking from public.room_bookings where id = p_booking_id;
  if v_booking.id is null then return; end if;

  v_enabled := public.crm_individual_income_trainer_enabled(v_booking.trainer_id::text);

  -- Pending rows outside the currently active occurrence set are voided. Posted
  -- rows are immutable history and are never cancelled by an event mutation.
  update public.financial_operations operation
  set status = 'voided'
  where operation.room_booking_series_id = v_booking.financial_series_id
    and operation.category_code = 'individual_training'
    and operation.status = 'pending'
    and not exists (
      select 1
      from public.room_bookings segment
      cross join lateral public.crm_individual_training_occurrence_dates(
        segment.date, segment.recurrence, segment.recurrence_until
      ) occurrence(day)
      where segment.financial_series_id = v_booking.financial_series_id
        and segment.event_type = 'individual_training'
        and segment.status is distinct from 'cancelled'
        and occurrence.day = operation.occurrence_date
    );

  if v_booking.event_type is distinct from 'individual_training'
     or v_booking.status = 'cancelled'
     or v_booking.price is null
     or v_booking.price < 0
  then return; end if;

  -- A disabled trainer does not create new finance rows. Existing rows continue
  -- to reconcile so toggling the setting cannot orphan or expose stale pending data.
  if not v_enabled and not exists (
    select 1 from public.financial_operations operation
    where operation.room_booking_series_id = v_booking.financial_series_id
      and operation.category_code = 'individual_training'
  ) then return; end if;

  for v_date in
    select day from public.crm_individual_training_occurrence_dates(
      v_booking.date, v_booking.recurrence, v_booking.recurrence_until
    ) occurrence(day)
  loop
    select operation.id into v_existing_id
    from public.financial_operations operation
    where operation.room_booking_series_id = v_booking.financial_series_id
      and operation.occurrence_date = v_date
      and operation.status in ('pending', 'posted')
    for update;

    if v_existing_id is null then
      if not v_enabled then continue; end if;
      insert into public.financial_operations(
        category_code, direction, amount_uah, operation_date, status,
        payment_method_code, created_by, room_booking_id, trainer_share_uah,
        room_booking_series_id, occurrence_date, event_title_snapshot,
        trainer_id_snapshot, trainer_name_snapshot, event_start_time_snapshot,
        event_end_time_snapshot, room_name_snapshot, people_count_snapshot
      ) values (
        'individual_training', 'income', v_booking.price, v_date, 'pending',
        null, coalesce(auth.uid(), v_booking.trainer_id::uuid), v_booking.id, 0,
        v_booking.financial_series_id, v_date, v_booking.title,
        v_booking.trainer_id::text, v_booking.trainer_name, v_booking.start_time,
        v_booking.end_time, v_booking.room_name, v_booking.people_count
      );
    else
      update public.financial_operations operation
      set amount_uah = v_booking.price,
          operation_date = v_date,
          room_booking_id = v_booking.id,
          trainer_share_uah = 0,
          event_title_snapshot = v_booking.title,
          trainer_id_snapshot = v_booking.trainer_id::text,
          trainer_name_snapshot = v_booking.trainer_name,
          event_start_time_snapshot = v_booking.start_time,
          event_end_time_snapshot = v_booking.end_time,
          room_name_snapshot = v_booking.room_name,
          people_count_snapshot = v_booking.people_count
      where operation.id = v_existing_id and operation.status = 'pending';
    end if;
  end loop;
end $$;
revoke execute on function public.crm_reconcile_individual_training_income(uuid) from public, anon, authenticated;

create or replace function public.crm_sync_individual_training_income()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    update public.financial_operations
    set status = 'voided'
    where room_booking_series_id = old.financial_series_id
      and category_code = 'individual_training' and status = 'pending'
      and not exists (
        select 1
        from public.room_bookings segment
        cross join lateral public.crm_individual_training_occurrence_dates(
          segment.date, segment.recurrence, segment.recurrence_until
        ) occurrence(day)
        where segment.financial_series_id = old.financial_series_id
          and segment.id <> old.id
          and segment.event_type = 'individual_training'
          and segment.status is distinct from 'cancelled'
          and occurrence.day = financial_operations.occurrence_date
      );
    return old;
  end if;
  perform public.crm_reconcile_individual_training_income(new.id);
  return new;
end $$;

create trigger room_bookings_sync_individual_income
after insert or update of date,start_time,end_time,trainer_id,trainer_name,title,
  booking_type,people_count,price,event_type,recurrence,recurrence_until,status,room_name
on public.room_bookings for each row execute function public.crm_sync_individual_training_income();

do $reconcile_existing$
declare v_booking_id uuid;
begin
  for v_booking_id in
    select booking.id from public.room_bookings booking
    where booking.event_type = 'individual_training'
      and booking.status is distinct from 'cancelled'
  loop
    perform public.crm_reconcile_individual_training_income(v_booking_id);
  end loop;
end $reconcile_existing$;

-- Preserve one stable series identity when the existing occurrence-removal RPC
-- splits a recurring row around a single cancelled occurrence.
create or replace function public.crm_remove_room_booking_occurrence(p_id uuid,p_occurrence_date date)
returns boolean language plpgsql security definer set search_path=public as $$
declare
  v_old public.room_bookings;
  v_next date;
  v_prev date;
  v_previous_context text:=current_setting('crm.occurrence_removal_continuation',true);
  v_previous_signature text:=current_setting('crm.occurrence_removal_signature',true);
begin
  select * into v_old from public.room_bookings where id=p_id for update;
  if v_old.id is null then raise exception 'Бронювання не знайдено'; end if;
  if not public.crm_is_admin_session() then
    if not public.crm_is_active_trainer_session() or not exists(
      select 1 from public.trainers t where t.auth_user_id=auth.uid() and t.is_active is true
        and t.archived_at is null and t.access_disabled_at is null
        and (v_old.trainer_id::text=auth.uid()::text or v_old.trainer_id::text=t.id::text)
    ) then raise exception 'Немає права змінювати це бронювання' using errcode='42501'; end if;
  end if;
  if lower(coalesce(v_old.recurrence,'none')) not in ('daily','weekly','monthly')
     or not public.crm_schedule_booking_occurs_on(v_old.date,p_occurrence_date,v_old.recurrence)
     or p_occurrence_date<v_old.date
     or (v_old.recurrence_until is not null and p_occurrence_date>v_old.recurrence_until)
  then raise exception 'Occurrence не належить серії' using errcode='22023'; end if;
  v_next:=public.crm_schedule_booking_step_date(p_occurrence_date,v_old.recurrence,1);
  v_prev:=public.crm_schedule_booking_step_date(p_occurrence_date,v_old.recurrence,-1);
  if p_occurrence_date=v_old.date then
    if v_old.recurrence_until is not null and v_next>v_old.recurrence_until then delete from public.room_bookings where id=p_id;
    else update public.room_bookings set date=v_next where id=p_id; end if;
  elsif v_old.recurrence_until is not null and (v_next is null or v_next>v_old.recurrence_until) then
    update public.room_bookings set recurrence_until=v_prev where id=p_id;
  else
    update public.room_bookings set recurrence_until=v_prev where id=p_id;
    perform set_config('crm.occurrence_removal_continuation','on',true);
    perform set_config('crm.occurrence_removal_signature',public.crm_occurrence_removal_signature(v_next,v_old.start_time,v_old.end_time,v_old.room_name,v_old.recurrence,v_old.recurrence_until,v_old.status,v_old.trainer_id::text),true);
    begin
      insert into public.room_bookings(date,start_time,end_time,trainer_id,trainer_name,title,type,booking_type,people_count,price,payment_method,event_type,note,color,recurrence,recurrence_until,description,status,room_name,financial_series_id)
      values(v_next,v_old.start_time,v_old.end_time,v_old.trainer_id,v_old.trainer_name,v_old.title,v_old.type,v_old.booking_type,v_old.people_count,v_old.price,v_old.payment_method,v_old.event_type,v_old.note,v_old.color,v_old.recurrence,v_old.recurrence_until,v_old.description,v_old.status,v_old.room_name,v_old.financial_series_id);
    exception when others then
      perform set_config('crm.occurrence_removal_continuation',coalesce(v_previous_context,''),true);
      perform set_config('crm.occurrence_removal_signature',coalesce(v_previous_signature,''),true);
      raise;
    end;
    perform set_config('crm.occurrence_removal_continuation',coalesce(v_previous_context,''),true);
    perform set_config('crm.occurrence_removal_signature',coalesce(v_previous_signature,''),true);
  end if;
  return true;
end $$;

create or replace function public.crm_fetch_pending_individual_income()
returns table(
  id uuid, title text, trainer_name text, occurrence_date date,
  start_time text, end_time text, room_name text, people_count integer,
  amount_uah numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.crm_is_admin_session() then
    raise exception 'Only an administrator may view pending income' using errcode = '42501';
  end if;
  return query
  select operation.id, operation.event_title_snapshot, operation.trainer_name_snapshot,
    operation.occurrence_date, operation.event_start_time_snapshot,
    operation.event_end_time_snapshot, operation.room_name_snapshot,
    operation.people_count_snapshot, operation.amount_uah
  from public.financial_operations operation
  where operation.category_code = 'individual_training' and operation.status = 'pending'
  order by operation.occurrence_date, operation.event_start_time_snapshot, operation.created_at;
end $$;
revoke execute on function public.crm_fetch_pending_individual_income() from public, anon;
grant execute on function public.crm_fetch_pending_individual_income() to authenticated;

create or replace function public.crm_admin_confirm_individual_income(
  p_operation_id uuid, p_amount_uah numeric, p_payment_method_code text,
  p_operation_date date default current_date
)
returns public.financial_operations
language plpgsql security definer set search_path = public as $$
declare v_row public.financial_operations;
begin
  if not public.crm_is_admin_session() then
    raise exception 'Only an administrator may confirm income' using errcode = '42501';
  end if;
  if p_amount_uah is null or p_amount_uah < 0 then
    raise exception 'Amount must be non-negative' using errcode = '22023';
  end if;
  if p_payment_method_code not in ('cash', 'card') then
    raise exception 'Payment method must be cash or card' using errcode = '22023';
  end if;
  if p_operation_date is null then
    raise exception 'Payment date is required' using errcode = '22023';
  end if;
  update public.financial_operations operation
  set amount_uah = p_amount_uah, payment_method_code = p_payment_method_code,
      operation_date = p_operation_date, status = 'posted', trainer_share_uah = 0
  where operation.id = p_operation_id
    and operation.category_code = 'individual_training'
    and operation.status = 'pending'
  returning operation.* into v_row;
  if v_row.id is null then
    raise exception 'Pending individual income operation not found' using errcode = 'P0002';
  end if;
  return v_row;
end $$;
revoke execute on function public.crm_admin_confirm_individual_income(uuid,numeric,text,date) from public, anon;
grant execute on function public.crm_admin_confirm_individual_income(uuid,numeric,text,date) to authenticated;

commit;
