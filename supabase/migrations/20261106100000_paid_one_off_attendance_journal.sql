begin;

-- New paid trial/single attendance is recorded atomically in the financial
-- journal. Legacy one-day subscriptions remain untouched historical data.

alter table public.financial_operations
  add column if not exists attendance_source_id uuid;

alter table public.attendance
  alter column price_snapshot_uah type numeric(12,2)
  using price_snapshot_uah::numeric;

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
declare v_type text := lower(nullif(btrim(coalesce(new.entry_type, new.guest_type, '')), ''));
begin
  if v_type in ('trial', 'single') then
    if not public.crm_is_admin_session() then
      raise exception 'Trial and single attendance is administrator-only' using errcode = '42501';
    end if;
    if current_setting('crm.atomic_one_off_attendance', true) <> 'on' then
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
  delete from public.attendance
  where id = p_attendance_id
    and lower(coalesce(entry_type, guest_type, '')) in ('trial', 'single');
  get diagnostics v_count = row_count;
  return v_count > 0;
end $$;

revoke all on function public.crm_admin_delete_paid_one_off_attendance(uuid) from public, anon;
grant execute on function public.crm_admin_delete_paid_one_off_attendance(uuid) to authenticated;

-- Trainers may keep working with ordinary attendance in owned groups, but paid
-- one-off rows (including their amount snapshot) are not visible to them.
drop policy if exists attendance_trainer_select_own_groups on public.attendance;
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

commit;
