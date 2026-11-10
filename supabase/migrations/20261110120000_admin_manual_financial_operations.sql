begin;

create or replace function public.crm_admin_create_manual_financial_operation(
  p_direction text,
  p_category_code text,
  p_amount_uah numeric,
  p_operation_date date,
  p_payment_method_code text,
  p_status text,
  p_note text default null
)
returns public.financial_operations
language plpgsql security definer set search_path = public as $$
declare v_row public.financial_operations;
begin
  if not public.crm_is_admin_session() then
    raise exception 'Only an administrator may create manual financial operations' using errcode = '42501';
  end if;
  if p_amount_uah is null or p_amount_uah <= 0 then
    raise exception 'Amount must be greater than zero' using errcode = '23514';
  end if;
  if p_operation_date is null then
    raise exception 'Operation date is required' using errcode = '23502';
  end if;
  if p_payment_method_code not in ('cash', 'card') then
    raise exception 'Unsupported payment method' using errcode = '23514';
  end if;
  if p_status not in ('pending', 'posted') then
    raise exception 'Unsupported operation status' using errcode = '23514';
  end if;
  if not (
    (p_direction = 'income' and p_category_code in ('room_rental', 'manual_income'))
    or (p_direction = 'expense' and p_category_code = 'manual_expense')
  ) then
    raise exception 'Unsupported manual financial category' using errcode = '23514';
  end if;

  insert into public.financial_operations(
    category_code, direction, amount_uah, operation_date, status,
    payment_method_code, note
  ) values (
    p_category_code, p_direction, p_amount_uah, p_operation_date, p_status,
    p_payment_method_code, nullif(btrim(p_note), '')
  ) returning * into v_row;
  return v_row;
end $$;
revoke all on function public.crm_admin_create_manual_financial_operation(text,text,numeric,date,text,text,text) from public, anon;
grant execute on function public.crm_admin_create_manual_financial_operation(text,text,numeric,date,text,text,text) to authenticated;

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
    and operation.status in ('pending', 'posted')
  order by operation.operation_date desc, operation.created_at desc;
end $$;
revoke all on function public.crm_admin_fetch_manual_financial_operations() from public, anon;
grant execute on function public.crm_admin_fetch_manual_financial_operations() to authenticated;

commit;
