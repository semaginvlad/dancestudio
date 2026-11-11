begin;
alter table public.financial_operations add column admin_voided boolean not null default false,
  add column admin_unconfirmed boolean not null default false;
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
    if exists (select 1 from public.financial_operations operation
      where operation.room_booking_series_id = v_booking.financial_series_id
        and operation.occurrence_date = v_date and operation.admin_voided) then
      continue;
    end if;
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
      where operation.id = v_existing_id and operation.status = 'pending' and not operation.admin_unconfirmed;
    end if;
  end loop;
end $$;
revoke execute on function public.crm_reconcile_individual_training_income(uuid,date) from public, anon, authenticated;


drop function public.crm_fetch_pending_individual_income();
create or replace function public.crm_fetch_pending_individual_income()
returns table(
  id uuid, title text, trainer_name text, occurrence_date date,
  start_time text, end_time text, room_name text, people_count integer,
  amount_uah numeric, category_code text, payment_method_code text, operation_date date
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
    operation.people_count_snapshot, operation.amount_uah, operation.category_code,
    operation.payment_method_code, operation.operation_date
  from public.financial_operations operation
  where operation.category_code in ('room_rental', 'individual_training') and operation.status = 'pending'
    and operation.room_booking_series_id is not null
  order by operation.occurrence_date, operation.event_start_time_snapshot, operation.created_at;
end $$;
revoke execute on function public.crm_fetch_pending_individual_income() from public, anon;
grant execute on function public.crm_fetch_pending_individual_income() to authenticated;


create or replace function public.crm_admin_fetch_manual_financial_operations()
returns setof public.financial_operations
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.crm_is_admin_session() then
    raise exception 'Only an administrator may read manual financial operations' using errcode = '42501';
  end if;
  return query
  select operation.*
  from public.financial_operations operation
  where operation.attendance_id is null
    and operation.room_booking_id is null
    and operation.room_booking_series_id is null
    and operation.category_code in ('room_rental', 'manual_income', 'manual_expense')
  order by operation.operation_date desc, operation.created_at desc;
end $$;
revoke all on function public.crm_admin_fetch_manual_financial_operations() from public, anon;
grant execute on function public.crm_admin_fetch_manual_financial_operations() to authenticated;


create function public.crm_admin_change_financial_operation_status(p_operation_id uuid, p_action text)
returns public.financial_operations language plpgsql security definer set search_path = public as $$
declare v_row public.financial_operations;
begin
  if not public.crm_is_admin_session() then
    raise exception 'Only an administrator may change financial operation status' using errcode = '42501';
  end if;
  update public.financial_operations operation
  set status = case when p_action = 'unconfirm' then 'pending' else 'voided' end,
      admin_voided = (p_action = 'void' and operation.room_booking_series_id is not null),
      admin_unconfirmed = (p_action = 'unconfirm')
  where operation.id = p_operation_id and (
    (p_action = 'unconfirm' and operation.status = 'posted' and operation.category_code = 'room_rental'
      and operation.room_booking_series_id is not null and operation.room_booking_id is not null)
    or (p_action = 'void' and (
      (operation.status = 'pending' and operation.category_code = 'room_rental'
        and operation.room_booking_series_id is not null and operation.room_booking_id is not null)
      or (operation.status in ('pending', 'posted') and operation.attendance_id is null
        and operation.room_booking_id is null and operation.room_booking_series_id is null
        and operation.category_code in ('room_rental', 'manual_income', 'manual_expense'))
    ))
  ) returning operation.* into v_row;
  if not found then raise exception 'Financial operation or transition not found' using errcode = 'P0002'; end if;
  return v_row;
end $$;
revoke all on function public.crm_admin_change_financial_operation_status(uuid,text) from public, anon;
grant execute on function public.crm_admin_change_financial_operation_status(uuid,text) to authenticated;

create function public.crm_admin_fetch_posted_room_rentals()
returns setof public.financial_operations language plpgsql stable security definer set search_path = public as $$
begin
  if not public.crm_is_admin_session() then
    raise exception 'Only an administrator may read room rentals' using errcode = '42501';
  end if;
  return query select operation.* from public.financial_operations operation
    where operation.category_code = 'room_rental' and operation.status = 'posted'
      and operation.room_booking_id is not null and operation.room_booking_series_id is not null
    order by operation.operation_date desc, operation.created_at desc;
end $$;
revoke all on function public.crm_admin_fetch_posted_room_rentals() from public, anon;
grant execute on function public.crm_admin_fetch_posted_room_rentals() to authenticated;
commit;
