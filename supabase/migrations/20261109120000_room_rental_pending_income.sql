begin;

-- Only rows inserted after this migration enter the room-rental journal.
-- Existing bookings remain false and are deliberately not reconciled/backfilled.
alter table public.room_bookings
  add column if not exists room_rental_finance_enabled boolean not null default false;

create or replace function public.crm_mark_new_room_rental_booking()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.event_type = 'individual_training'
     and current_setting('crm.occurrence_removal_continuation', true) is distinct from 'on'
  then
    new.room_rental_finance_enabled := true;
  end if;
  return new;
end $$;

drop trigger if exists room_bookings_mark_new_room_rental on public.room_bookings;
create trigger room_bookings_mark_new_room_rental
before insert on public.room_bookings
for each row execute function public.crm_mark_new_room_rental_booking();

create index if not exists financial_operations_pending_room_rental_idx
  on public.financial_operations(status, category_code, occurrence_date, event_start_time_snapshot)
  where status = 'pending' and category_code = 'room_rental';

-- Keep the pre-existing Kostia/individual-income workflow intact, but only for
-- a series that already has an individual_training operation. This guard is
-- what prevents this compatibility path from becoming a historical backfill.
create or replace function public.crm_reconcile_tracked_legacy_individual_income(
  p_booking_id uuid, p_as_of date default current_date
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_booking public.room_bookings%rowtype;
  v_date date;
  v_enabled boolean;
  v_existing_id uuid;
begin
  select * into v_booking from public.room_bookings where id = p_booking_id;
  if v_booking.id is null or not exists (
    select 1 from public.financial_operations operation
    where operation.room_booking_series_id = v_booking.financial_series_id
      and operation.category_code = 'individual_training'
  ) then return; end if;

  v_enabled := public.crm_individual_income_trainer_enabled(v_booking.trainer_id::text);
  update public.financial_operations operation set status = 'voided'
  where operation.room_booking_series_id = v_booking.financial_series_id
    and operation.category_code = 'individual_training' and operation.status = 'pending'
    and not exists (
      select 1 from public.room_bookings segment
      where segment.financial_series_id = v_booking.financial_series_id
        and not segment.room_rental_finance_enabled
        and segment.event_type = 'individual_training'
        and segment.status is distinct from 'cancelled'
        and operation.occurrence_date >= segment.date
        and (segment.recurrence_until is null or operation.occurrence_date <= segment.recurrence_until)
        and public.crm_schedule_booking_occurs_on(segment.date, operation.occurrence_date, segment.recurrence)
    );
  if v_booking.event_type is distinct from 'individual_training' or v_booking.status = 'cancelled'
     or v_booking.price is null or v_booking.price < 0 then return; end if;

  for v_date in select day from public.crm_individual_training_occurrence_dates(
    v_booking.date, v_booking.recurrence, v_booking.recurrence_until, p_as_of
  ) occurrence(day)
  loop
    select operation.id into v_existing_id from public.financial_operations operation
    where operation.room_booking_series_id = v_booking.financial_series_id
      and operation.occurrence_date = v_date and operation.status in ('pending', 'posted') for update;
    if v_existing_id is null then
      if not v_enabled then continue; end if;
      insert into public.financial_operations(
        category_code,direction,amount_uah,operation_date,status,payment_method_code,
        created_by,room_booking_id,trainer_share_uah,room_booking_series_id,occurrence_date,
        event_title_snapshot,trainer_id_snapshot,trainer_name_snapshot,event_start_time_snapshot,
        event_end_time_snapshot,room_name_snapshot,people_count_snapshot
      ) values (
        'individual_training','income',v_booking.price,v_date,'pending',null,
        coalesce(auth.uid(),v_booking.trainer_id::uuid),v_booking.id,0,v_booking.financial_series_id,v_date,
        v_booking.title,v_booking.trainer_id::text,v_booking.trainer_name,v_booking.start_time,
        v_booking.end_time,v_booking.room_name,v_booking.people_count
      );
    else
      update public.financial_operations operation set
        amount_uah=v_booking.price,operation_date=v_date,room_booking_id=v_booking.id,trainer_share_uah=0,
        event_title_snapshot=v_booking.title,trainer_id_snapshot=v_booking.trainer_id::text,
        trainer_name_snapshot=v_booking.trainer_name,event_start_time_snapshot=v_booking.start_time,
        event_end_time_snapshot=v_booking.end_time,room_name_snapshot=v_booking.room_name,
        people_count_snapshot=v_booking.people_count
      where operation.id=v_existing_id and operation.status='pending';
    end if;
  end loop;
end $$;
revoke execute on function public.crm_reconcile_tracked_legacy_individual_income(uuid,date) from public, anon, authenticated;

create or replace function public.crm_reconcile_individual_training_income(
  p_booking_id uuid, p_as_of date default current_date
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_booking public.room_bookings%rowtype;
  v_date date;
  v_existing_id uuid;
begin
  select * into v_booking from public.room_bookings where id = p_booking_id;
  if v_booking.id is null then return; end if;
  if not v_booking.room_rental_finance_enabled then
    perform public.crm_reconcile_tracked_legacy_individual_income(p_booking_id, p_as_of);
    return;
  end if;

  update public.financial_operations operation
  set status = 'voided'
  where operation.room_booking_series_id = v_booking.financial_series_id
    and operation.category_code = 'room_rental'
    and operation.status = 'pending'
    and not exists (
      select 1 from public.room_bookings segment
      where segment.financial_series_id = v_booking.financial_series_id
        and segment.room_rental_finance_enabled
        and segment.event_type = 'individual_training'
        and segment.status is distinct from 'cancelled'
        and operation.occurrence_date >= segment.date
        and (segment.recurrence_until is null or operation.occurrence_date <= segment.recurrence_until)
        and public.crm_schedule_booking_occurs_on(segment.date, operation.occurrence_date, segment.recurrence)
    );

  if v_booking.event_type is distinct from 'individual_training'
     or v_booking.status = 'cancelled'
     or v_booking.price is null
     or v_booking.price < 0
  then return; end if;

  for v_date in
    select day from public.crm_individual_training_occurrence_dates(
      v_booking.date, v_booking.recurrence, v_booking.recurrence_until, p_as_of
    ) occurrence(day)
  loop
    select operation.id into v_existing_id
    from public.financial_operations operation
    where operation.room_booking_series_id = v_booking.financial_series_id
      and operation.occurrence_date = v_date
      and operation.status in ('pending', 'posted')
    for update;

    if v_existing_id is null then
      insert into public.financial_operations(
        category_code, direction, amount_uah, operation_date, status,
        payment_method_code, created_by, room_booking_id, trainer_share_uah,
        room_booking_series_id, occurrence_date, event_title_snapshot,
        trainer_id_snapshot, trainer_name_snapshot, event_start_time_snapshot,
        event_end_time_snapshot, room_name_snapshot, people_count_snapshot
      ) values (
        'room_rental', 'income', v_booking.price, v_date, 'pending',
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
revoke execute on function public.crm_reconcile_individual_training_income(uuid,date) from public, anon, authenticated;

create or replace function public.crm_sync_individual_training_income()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    update public.financial_operations
    set status = 'voided'
    where room_booking_series_id = old.financial_series_id
      and category_code = 'room_rental' and status = 'pending'
      and not exists (
        select 1 from public.room_bookings segment
        where segment.financial_series_id = old.financial_series_id
          and segment.id <> old.id
          and segment.room_rental_finance_enabled
          and segment.event_type = 'individual_training'
          and segment.status is distinct from 'cancelled'
          and financial_operations.occurrence_date >= segment.date
          and (segment.recurrence_until is null or financial_operations.occurrence_date <= segment.recurrence_until)
          and public.crm_schedule_booking_occurs_on(segment.date, financial_operations.occurrence_date, segment.recurrence)
      );
    return old;
  end if;
  perform public.crm_reconcile_individual_training_income(new.id);
  return new;
end $$;

create or replace function public.crm_fetch_pending_individual_income()
returns table(
  id uuid, title text, trainer_name text, occurrence_date date,
  start_time text, end_time text, room_name text, people_count integer,
  amount_uah numeric
)
language plpgsql volatile security definer set search_path = public as $$
declare v_booking_id uuid;
begin
  if not public.crm_is_admin_session() then
    raise exception 'Only an administrator may view pending room-rental income' using errcode = '42501';
  end if;
  for v_booking_id in
    select booking.id from public.room_bookings booking
    where booking.room_rental_finance_enabled
      and booking.event_type = 'individual_training'
      and booking.status is distinct from 'cancelled'
  loop
    perform public.crm_reconcile_individual_training_income(v_booking_id, current_date);
  end loop;
  for v_booking_id in
    select distinct booking.id
    from public.room_bookings booking
    join public.financial_operations operation
      on operation.room_booking_series_id = booking.financial_series_id
     and operation.category_code = 'individual_training'
    where not booking.room_rental_finance_enabled
      and booking.event_type = 'individual_training'
      and booking.status is distinct from 'cancelled'
  loop
    perform public.crm_reconcile_tracked_legacy_individual_income(v_booking_id, current_date);
  end loop;
  return query
  select operation.id, operation.event_title_snapshot, operation.trainer_name_snapshot,
    operation.occurrence_date, operation.event_start_time_snapshot,
    operation.event_end_time_snapshot, operation.room_name_snapshot,
    operation.people_count_snapshot, operation.amount_uah
  from public.financial_operations operation
  where operation.category_code in ('room_rental', 'individual_training') and operation.status = 'pending'
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
    raise exception 'Only an administrator may confirm room-rental income' using errcode = '42501';
  end if;
  if p_amount_uah is null or p_amount_uah < 0 then raise exception 'Amount must be non-negative' using errcode = '22023'; end if;
  if p_payment_method_code not in ('cash', 'card') then raise exception 'Payment method must be cash or card' using errcode = '22023'; end if;
  if p_operation_date is null then raise exception 'Payment date is required' using errcode = '22023'; end if;
  update public.financial_operations operation
  set amount_uah = p_amount_uah, payment_method_code = p_payment_method_code,
      operation_date = p_operation_date, status = 'posted', trainer_share_uah = 0
  where operation.id = p_operation_id
    and operation.category_code in ('room_rental', 'individual_training')
    and operation.status = 'pending'
  returning operation.* into v_row;
  if v_row.id is null then raise exception 'Pending room-rental operation not found' using errcode = 'P0002'; end if;
  return v_row;
end $$;
revoke execute on function public.crm_admin_confirm_individual_income(uuid,numeric,text,date) from public, anon;
grant execute on function public.crm_admin_confirm_individual_income(uuid,numeric,text,date) to authenticated;

-- Add posted room rental to the existing admin-only journal feed. Attendance
-- joins remain optional so trial/single semantics are unchanged.
create or replace function public.crm_admin_fetch_posted_one_off_income()
returns table(
  id uuid, category_code text, direction text, amount_uah numeric,
  operation_date date, status text, payment_method_code text,
  attendance_id uuid, attendance_source_id uuid, student_id uuid, group_id text,
  guest_name text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.crm_is_admin_session() then
    raise exception 'Only an administrator may read posted income' using errcode = '42501';
  end if;
  return query
  select operation.id, operation.category_code, operation.direction,
    operation.amount_uah, operation.operation_date, operation.status,
    operation.payment_method_code, operation.attendance_id,
    operation.attendance_source_id, attendance.student_id, attendance.group_id,
    attendance.guest_name
  from public.financial_operations operation
  left join public.attendance attendance on attendance.id = operation.attendance_id
  where operation.status = 'posted'
    and operation.direction = 'income'
    and operation.category_code in ('trial', 'single', 'room_rental');
end $$;
revoke all on function public.crm_admin_fetch_posted_one_off_income() from public, anon;
grant execute on function public.crm_admin_fetch_posted_one_off_income() to authenticated;

-- Preserve the finance marker when a new recurring series is split around one
-- cancelled occurrence. This is not a new sale; it is the same series.
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
      insert into public.room_bookings(date,start_time,end_time,trainer_id,trainer_name,title,type,booking_type,people_count,price,payment_method,event_type,note,color,recurrence,recurrence_until,description,status,room_name,financial_series_id,room_rental_finance_enabled)
      values(v_next,v_old.start_time,v_old.end_time,v_old.trainer_id,v_old.trainer_name,v_old.title,v_old.type,v_old.booking_type,v_old.people_count,v_old.price,v_old.payment_method,v_old.event_type,v_old.note,v_old.color,v_old.recurrence,v_old.recurrence_until,v_old.description,v_old.status,v_old.room_name,v_old.financial_series_id,v_old.room_rental_finance_enabled);
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

commit;
