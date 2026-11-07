begin;

-- New paid trial/single attendance is recorded atomically in the financial
-- journal. Legacy one-day subscriptions remain untouched historical data.

alter table public.financial_operations
  add column if not exists attendance_source_id uuid;

-- PostgreSQL will not change the column type while production RLS policies
-- depend on it. Remove only those dependent policies and recreate their
-- existing restricted trainer access immediately after the type change.
drop policy if exists attendance_trainer_update_own_groups on public.attendance;
drop policy if exists attendance_trainer_delete_own_groups on public.attendance;
drop policy if exists attendance_trainer_select_own_groups on public.attendance;
drop trigger if exists attendance_protect_price_snapshot on public.attendance;

alter table public.attendance
  alter column price_snapshot_uah type numeric(12,2)
  using price_snapshot_uah::numeric;

-- Restore the canonical immutable historical snapshot guard. Server-side flows
-- may update other attendance fields, but no ordinary UPDATE may replace a
-- captured price (including an administrator or trainer update).
create or replace function public.crm_protect_attendance_price_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.price_snapshot_uah is not distinct from old.price_snapshot_uah then
    return new;
  end if;
  raise exception 'attendance.price_snapshot_uah is immutable' using errcode = '23514';
end;
$$;

create trigger attendance_protect_price_snapshot
before update of price_snapshot_uah on public.attendance
for each row execute function public.crm_protect_attendance_price_snapshot();

create policy attendance_trainer_update_own_groups
on public.attendance
for update
to authenticated
using (
  group_id is not null
  and public.rls_owns_group(group_id)
  and student_id is not null
  and guest_name is null
  and guest_type is null
  and price_snapshot_uah is null
  and lower(coalesce(entry_type, '')) not in ('trial', 'single')
)
with check (
  group_id is not null
  and public.rls_owns_group(group_id)
  and student_id is not null
  and guest_name is null
  and guest_type is null
  and price_snapshot_uah is null
  and lower(coalesce(entry_type, '')) not in ('trial', 'single')
  and public.rls_can_record_attendance(student_id, group_id)
  and (
    sub_id is null
    or public.rls_can_access_subscription(sub_id, student_id, group_id)
  )
);

create policy attendance_trainer_delete_own_groups
on public.attendance
for delete
to authenticated
using (
  group_id is not null
  and public.rls_owns_group(group_id)
  and student_id is not null
  and guest_name is null
  and guest_type is null
  and price_snapshot_uah is null
  and lower(coalesce(entry_type, '')) not in ('trial', 'single')
);

-- Trainers may keep viewing ordinary attendance in owned groups, but paid
-- one-off rows (including their amount snapshot) stay administrator-only.
create policy attendance_trainer_select_own_groups
on public.attendance for select to authenticated
using (
  group_id is not null
  and public.rls_owns_group(group_id)
  and student_id is not null
  and guest_name is null
  and guest_type is null
  and price_snapshot_uah is null
  and lower(coalesce(entry_type, '')) not in ('trial', 'single')
);

update public.financial_operations
set attendance_source_id = attendance_id
where attendance_id is not null and attendance_source_id is null;

alter table public.financial_operations
  drop constraint if exists financial_operations_attendance_id_fkey;
alter table public.financial_operations
  add constraint financial_operations_attendance_id_fkey
  foreign key (attendance_id) references public.attendance(id) on delete set null;

create index if not exists financial_operations_attendance_source_idx
  on public.financial_operations(attendance_source_id)
  where attendance_source_id is not null;

-- One-off attendance must go through the atomic RPC. Ordinary subscription and
-- debt attendance keeps its existing path and behavior.
create or replace function public.crm_guard_paid_one_off_attendance_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_entry_type text := lower(nullif(btrim(coalesce(new.entry_type, '')), ''));
  v_guest_type text := lower(nullif(btrim(coalesce(new.guest_type, '')), ''));
  v_is_financial boolean;
begin
  v_is_financial := v_entry_type in ('trial', 'single') or v_guest_type in ('trial', 'single');

  if not public.crm_is_admin_session() then
    if v_is_financial
       or new.student_id is null
       or new.guest_name is not null
       or new.guest_type is not null
       or new.price_snapshot_uah is not null
       or (v_entry_type = 'subscription' and new.sub_id is null) then
      raise exception 'Guest, trial, single and financial attendance are administrator-only' using errcode = '42501';
    end if;
    return new;
  end if;

  if v_is_financial then
    if current_setting('crm.atomic_one_off_attendance', true) is distinct from 'on' then
      raise exception 'Paid trial/single attendance requires payment confirmation' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists attendance_snapshot_guest_price on public.attendance;
drop trigger if exists attendance_guard_paid_one_off_insert on public.attendance;
create trigger attendance_guard_paid_one_off_insert
before insert on public.attendance
for each row execute function public.crm_guard_paid_one_off_attendance_insert();

create or replace function public.crm_admin_create_paid_one_off_attendance(
  p_student_id uuid,
  p_date date,
  p_group_id text,
  p_entry_type text,
  p_amount_uah numeric,
  p_payment_method text,
  p_operation_date date,
  p_guest_name text default null,
  p_quantity integer default 1
)
returns public.attendance
language plpgsql security definer set search_path = public as $$
declare
  v_type text := lower(nullif(btrim(coalesce(p_entry_type, '')), ''));
  v_method text := lower(nullif(btrim(coalesce(p_payment_method, '')), ''));
  v_att public.attendance%rowtype;
begin
  if not public.crm_is_admin_session() then
    raise exception 'Only an administrator may create paid trial/single attendance' using errcode = '42501';
  end if;
  if v_type not in ('trial', 'single') then
    raise exception 'Entry type must be trial or single' using errcode = '22023';
  end if;
  if p_date is null or p_group_id is null then
    raise exception 'Attendance date and group are required' using errcode = '22023';
  end if;
  if p_student_id is null and nullif(btrim(coalesce(p_guest_name, '')), '') is null then
    raise exception 'Student or guest name is required' using errcode = '22023';
  end if;
  if p_amount_uah is null or p_amount_uah < 0 then
    raise exception 'Amount must be non-negative' using errcode = '22023';
  end if;
  if v_method not in ('cash', 'card') then
    raise exception 'Payment method must be cash or card' using errcode = '22023';
  end if;
  if p_operation_date is null then
    raise exception 'Payment date is required' using errcode = '22023';
  end if;
  if coalesce(p_quantity, 0) < 1 then
    raise exception 'Quantity must be positive' using errcode = '22023';
  end if;

  perform set_config('crm.atomic_one_off_attendance', 'on', true);
  insert into public.attendance(
    student_id, date, guest_name, guest_type, group_id, quantity, entry_type,
    sub_id, price_snapshot_uah
  ) values (
    p_student_id, p_date,
    case when p_student_id is null then btrim(p_guest_name) else null end,
    case when p_student_id is null then v_type else null end,
    p_group_id, p_quantity, v_type, null, p_amount_uah
  ) returning * into v_att;

  insert into public.financial_operations(
    category_code, direction, amount_uah, operation_date, status,
    payment_method_code, created_by, attendance_id, attendance_source_id
  ) values (
    v_type, 'income', p_amount_uah, p_operation_date, 'posted',
    v_method, auth.uid(), v_att.id, v_att.id
  );

  return v_att;
end $$;

revoke all on function public.crm_admin_create_paid_one_off_attendance(uuid,date,text,text,numeric,text,date,text,integer) from public, anon;
grant execute on function public.crm_admin_create_paid_one_off_attendance(uuid,date,text,text,numeric,text,date,text,integer) to authenticated;

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
    raise exception 'Only an administrator may read paid trial/single income' using errcode = '42501';
  end if;
  return query
  select operation.id, operation.category_code, operation.direction,
    operation.amount_uah, operation.operation_date, operation.status,
    operation.payment_method_code, operation.attendance_id,
    operation.attendance_source_id, attendance.student_id, attendance.group_id,
    attendance.guest_name
  from public.financial_operations operation
  join public.attendance attendance on attendance.id = operation.attendance_id
  where operation.status = 'posted'
    and operation.direction = 'income'
    and operation.category_code in ('trial', 'single');
end $$;

revoke all on function public.crm_admin_fetch_posted_one_off_income() from public, anon;
grant execute on function public.crm_admin_fetch_posted_one_off_income() to authenticated;

create or replace function public.crm_void_one_off_finance_before_attendance_delete()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_type text := lower(nullif(btrim(coalesce(old.entry_type, old.guest_type, '')), ''));
begin
  if v_type in ('trial', 'single') then
    if not public.crm_is_admin_session() then
      raise exception 'Only an administrator may delete paid trial/single attendance' using errcode = '42501';
    end if;
    update public.financial_operations
    set status = 'voided'
    where attendance_id = old.id and status in ('pending', 'posted');
  end if;
  return old;
end $$;

drop trigger if exists attendance_void_one_off_finance_before_delete on public.attendance;
create trigger attendance_void_one_off_finance_before_delete
before delete on public.attendance
for each row execute function public.crm_void_one_off_finance_before_attendance_delete();

create or replace function public.crm_admin_delete_paid_one_off_attendance(p_attendance_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if not public.crm_is_admin_session() then
    raise exception 'Only an administrator may delete paid trial/single attendance' using errcode = '42501';
  end if;
  -- Preserve the pre-journal cleanup for historical one-day subscriptions.
  -- Journal-backed attendance must never touch that legacy representation.
  if not exists (
    select 1 from public.financial_operations operation
    where operation.attendance_id = p_attendance_id
       or operation.attendance_source_id = p_attendance_id
  ) then
    perform public.crm_remove_one_off_payment_if_orphan(p_attendance_id);
  end if;

  delete from public.attendance
  where id = p_attendance_id
    and lower(coalesce(entry_type, guest_type, '')) in ('trial', 'single');
  get diagnostics v_count = row_count;
  return v_count > 0;
end $$;

revoke all on function public.crm_admin_delete_paid_one_off_attendance(uuid) from public, anon;
grant execute on function public.crm_admin_delete_paid_one_off_attendance(uuid) to authenticated;

create or replace function public.crm_admin_relink_guest_one_off_attendance(
  p_group_id text,
  p_student_id uuid,
  p_attendance_ids uuid[]
)
returns setof public.attendance
language plpgsql security definer set search_path = public as $$
declare
  v_att public.attendance%rowtype;
begin
  if not public.crm_is_admin_session() then
    raise exception 'Only an administrator may convert guest attendance' using errcode = '42501';
  end if;
  if p_group_id is null or p_student_id is null or coalesce(cardinality(p_attendance_ids), 0) = 0 then
    return;
  end if;

  for v_att in
    update public.attendance
    set student_id = p_student_id,
        entry_type = lower(coalesce(nullif(btrim(entry_type), ''), nullif(btrim(guest_type), ''))),
        guest_name = null,
        guest_type = null,
        sub_id = null
    where group_id = p_group_id
      and student_id is null
      and id = any(p_attendance_ids)
      and lower(coalesce(entry_type, guest_type, '')) in ('trial', 'single')
    returning *
  loop
    -- Only genuinely legacy attendance gets a legacy one-day subscription.
    if not exists (
      select 1 from public.financial_operations operation
      where operation.attendance_id = v_att.id
         or operation.attendance_source_id = v_att.id
    ) then
      perform public.crm_ensure_one_off_payment_for_attendance(v_att.id);
    end if;
    return next v_att;
  end loop;
end $$;

revoke all on function public.crm_admin_relink_guest_one_off_attendance(text,uuid,uuid[]) from public, anon;
grant execute on function public.crm_admin_relink_guest_one_off_attendance(text,uuid,uuid[]) to authenticated;

commit;
