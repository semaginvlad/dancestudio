-- Global CRM price catalog. This migration only creates/seeds the catalog and
-- makes future one-off payments read it; it never updates historical payments.

begin;

create table if not exists public.service_prices (
  service_code text primary key check (service_code in ('trial', 'single', '4pack', '8pack', '12pack')),
  service_name text not null,
  price_uah integer not null check (price_uah >= 0),
  sort_order smallint not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.service_prices (service_code, service_name, price_uah, sort_order)
values
  ('trial', 'Пробне заняття', 200, 10),
  ('single', 'Разове заняття', 400, 20),
  ('4pack', 'Абонемент на 4 заняття', 1200, 30),
  ('8pack', 'Абонемент на 8 занять', 1800, 40),
  ('12pack', 'Абонемент на 12 занять', 2200, 50)
on conflict (service_code) do nothing;

alter table public.service_prices enable row level security;
revoke all on table public.service_prices from public, anon;
grant select, update on table public.service_prices to authenticated;

drop policy if exists service_prices_admin_select on public.service_prices;
create policy service_prices_admin_select
on public.service_prices for select to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) = lower('semagin.vlad@gmail.com')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
);

drop policy if exists service_prices_admin_update on public.service_prices;
create policy service_prices_admin_update
on public.service_prices for update to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) = lower('semagin.vlad@gmail.com')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
)
with check (
  lower(coalesce(auth.jwt() ->> 'email', '')) = lower('semagin.vlad@gmail.com')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
);

-- Guest attendance has no subscription row, so snapshot its price separately.
-- Existing rows predate this catalog and retain the historical defaults.
alter table public.attendance
  add column if not exists price_snapshot_uah integer check (price_snapshot_uah >= 0);

update public.attendance
set price_snapshot_uah = case lower(coalesce(entry_type, guest_type, ''))
  when 'trial' then 150
  when 'single' then 300
end
where student_id is null
  and price_snapshot_uah is null
  and lower(coalesce(entry_type, guest_type, '')) in ('trial', 'single');

create or replace function public.crm_snapshot_guest_attendance_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service_code text;
  v_is_admin boolean;
begin
  v_service_code := lower(coalesce(new.entry_type, new.guest_type, ''));
  v_is_admin := lower(coalesce(auth.jwt() ->> 'email', '')) = lower('semagin.vlad@gmail.com')
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';

  if v_service_code not in ('trial', 'single') then
    if not v_is_admin then
      new.price_snapshot_uah := null;
    end if;
    return new;
  end if;

  -- Only a trusted admin may explicitly preserve a supplied historical value.
  -- Trainer/client input is always replaced with the authoritative catalog price.
  if v_is_admin and new.price_snapshot_uah is not null then
    return new;
  end if;

  select price_uah into new.price_snapshot_uah
  from public.service_prices
  where service_code = v_service_code;

  if new.price_snapshot_uah is null then
    raise exception 'Price is not configured for guest service %', v_service_code using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists attendance_snapshot_guest_price on public.attendance;
create trigger attendance_snapshot_guest_price
before insert on public.attendance
for each row execute function public.crm_snapshot_guest_attendance_price();

create or replace function public.crm_protect_attendance_price_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
begin
  if new.price_snapshot_uah is not distinct from old.price_snapshot_uah then
    return new;
  end if;

  v_is_admin := lower(coalesce(auth.jwt() ->> 'email', '')) = lower('semagin.vlad@gmail.com')
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
  if not v_is_admin then
    raise exception 'Only an administrator may change attendance.price_snapshot_uah' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists attendance_protect_price_snapshot on public.attendance;
create trigger attendance_protect_price_snapshot
before update of price_snapshot_uah on public.attendance
for each row execute function public.crm_protect_attendance_price_snapshot();

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

  select * into v_att from public.attendance a where a.id = p_attendance_id;
  if not found then
    raise exception 'Attendance % not found', p_attendance_id using errcode = 'P0002';
  end if;

  v_entry_type := lower(nullif(btrim(coalesce(v_att.entry_type, v_att.guest_type, '')), ''));
  if v_entry_type is null or v_entry_type not in ('trial', 'single') then
    return;
  end if;

  v_is_admin := lower(coalesce(auth.jwt() ->> 'email', '')) = lower('semagin.vlad@gmail.com');
  v_has_group_access := public.rls_owns_group(v_att.group_id);
  if not (v_is_admin or v_has_group_access) then
    raise exception 'Not allowed to manage one-off payment for attendance %', p_attendance_id using errcode = '42501';
  end if;

  if v_att.student_id is null or v_att.group_id is null or v_att.date is null then
    return;
  end if;

  if v_att.price_snapshot_uah is not null then
    v_amount := v_att.price_snapshot_uah;
  else
    select sp.price_uah into v_amount
    from public.service_prices sp
    where sp.service_code = v_entry_type;
  end if;
  if v_amount is null then
    raise exception 'Price is not configured for service %', v_entry_type using errcode = 'P0001';
  end if;

  select * into v_sub
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
      student_id, group_id, plan_type, start_date, end_date, activation_date,
      original_end_date, total_trainings, used_trainings, amount, base_price,
      discount_pct, discount_source, paid, pay_method, notification_sent, notes
    ) values (
      v_att.student_id, v_att.group_id, v_entry_type, v_att.date, v_att.date,
      v_att.date, v_att.date, 1, 1, v_amount, v_amount, 0, 'studio', true,
      'card', false, 'auto_one_off_from_attendance:' || p_attendance_id::text
    ) returning * into v_sub;
  end if;

  return query select
    v_sub.id, v_sub.student_id, v_sub.group_id, v_sub.plan_type,
    v_sub.start_date, v_sub.end_date, v_sub.total_trainings,
    v_sub.used_trainings, v_sub.notification_sent, v_sub.created_at,
    v_sub.activation_date, v_sub.original_end_date;
end;
$$;

revoke execute on function public.crm_ensure_one_off_payment_for_attendance(uuid) from public, anon;
grant execute on function public.crm_ensure_one_off_payment_for_attendance(uuid) to authenticated;

commit;
