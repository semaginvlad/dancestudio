begin;

-- PR #1 financial foundation. No trigger in this migration creates a financial
-- operation: attendance and booking automation are intentionally deferred.

create table public.financial_categories (
  code text primary key check (code in (
    'subscription', 'trial', 'single', 'room_rental',
    'individual_training', 'manual_income', 'manual_expense'
  )),
  name text not null,
  direction text not null check (direction in ('income', 'expense')),
  is_active boolean not null default true,
  sort_order smallint not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.financial_categories(code, name, direction, sort_order) values
  ('subscription', 'Абонемент', 'income', 10),
  ('trial', 'Пробне заняття', 'income', 20),
  ('single', 'Разове заняття', 'income', 30),
  ('room_rental', 'Оренда залу', 'income', 40),
  ('individual_training', 'Індивідуальне тренування', 'income', 50),
  ('manual_income', 'Інший дохід', 'income', 60),
  ('manual_expense', 'Ручна витрата', 'expense', 70)
on conflict (code) do nothing;

create table public.financial_payment_methods (
  code text primary key check (code in ('cash', 'card')),
  name text not null,
  is_active boolean not null default true,
  sort_order smallint not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.financial_payment_methods(code, name, sort_order) values
  ('cash', 'Готівка', 10),
  ('card', 'Картка', 20)
on conflict (code) do nothing;

create table public.financial_operations (
  id uuid primary key default gen_random_uuid(),
  category_code text not null references public.financial_categories(code),
  direction text not null check (direction in ('income', 'expense')),
  amount_uah numeric(12,2) not null check (amount_uah >= 0),
  operation_date date not null default current_date,
  status text not null default 'pending' check (status in ('pending', 'posted', 'voided')),
  payment_method_code text references public.financial_payment_methods(code),
  note text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  attendance_id uuid references public.attendance(id) on delete restrict,
  room_booking_id uuid references public.room_bookings(id) on delete restrict,
  trainer_share_uah numeric(12,2) not null default 0 check (trainer_share_uah >= 0),
  check (created_by is not null)
);

-- A voided row remains audit history; only pending/posted rows reserve a source.
create unique index financial_operations_active_attendance_uidx
  on public.financial_operations(attendance_id)
  where attendance_id is not null and status in ('pending', 'posted');
create unique index financial_operations_active_room_booking_uidx
  on public.financial_operations(room_booking_id)
  where room_booking_id is not null and status in ('pending', 'posted');

create or replace function public.crm_validate_financial_operation()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_direction text;
begin
  select direction into v_direction from public.financial_categories where code = new.category_code;
  if v_direction is distinct from new.direction then
    raise exception 'Financial operation direction must match its category' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger financial_operations_validate_category
before insert or update of category_code, direction on public.financial_operations
for each row execute function public.crm_validate_financial_operation();

create or replace function public.crm_prevent_used_financial_dictionary_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'financial_categories'
     and exists(select 1 from public.financial_operations where category_code = old.code) then
    raise exception 'Used financial categories must be deactivated, not deleted' using errcode = '23503';
  end if;
  if tg_table_name = 'financial_payment_methods'
     and exists(select 1 from public.financial_operations where payment_method_code = old.code) then
    raise exception 'Used payment methods must be deactivated, not deleted' using errcode = '23503';
  end if;
  return old;
end $$;

create trigger financial_categories_prevent_used_delete
before delete on public.financial_categories for each row
execute function public.crm_prevent_used_financial_dictionary_delete();
create trigger financial_payment_methods_prevent_used_delete
before delete on public.financial_payment_methods for each row
execute function public.crm_prevent_used_financial_dictionary_delete();

create table public.room_booking_tariffs (
  code text primary key,
  name text not null check (length(btrim(name)) between 1 and 120),
  price_uah integer not null check (price_uah >= 0),
  people_min integer check (people_min is null or people_min >= 1),
  people_max integer check (people_max is null or people_max >= people_min),
  is_active boolean not null default true,
  sort_order smallint not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.room_booking_tariffs(code, name, price_uah, people_min, people_max, is_active, sort_order) values
  ('cleaning', 'Прибирання', 0, null, null, true, 10),
  ('individual_1_2', 'Індивідуальне 1–2 особи', 250, 1, 2, true, 20),
  ('small_group_3_9', 'Міні-група 3–9 осіб', 500, 3, 9, true, 30),
  ('group_10_plus', 'Група 10+ осіб', 1000, 10, null, true, 40)
on conflict (code) do nothing;

create table public.trainer_financial_settings (
  trainer_id uuid primary key references public.trainers(id) on delete cascade,
  individual_income_enabled boolean not null default false,
  trainer_share_uah numeric(12,2) not null default 0 check (trainer_share_uah >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.financial_categories enable row level security;
alter table public.financial_payment_methods enable row level security;
alter table public.financial_operations enable row level security;
alter table public.room_booking_tariffs enable row level security;
alter table public.trainer_financial_settings enable row level security;

revoke all on public.financial_categories, public.financial_payment_methods,
  public.financial_operations, public.room_booking_tariffs,
  public.trainer_financial_settings from public, anon, authenticated;
grant select, insert, update, delete on public.financial_categories,
  public.financial_payment_methods, public.financial_operations,
  public.room_booking_tariffs, public.trainer_financial_settings to authenticated;

do $policies$
declare v_table text;
begin
  foreach v_table in array array[
    'financial_categories', 'financial_payment_methods', 'financial_operations',
    'room_booking_tariffs', 'trainer_financial_settings'
  ] loop
    execute format('create policy %I on public.%I for all to authenticated using (public.crm_is_admin_session()) with check (public.crm_is_admin_session())', v_table || '_admin_all', v_table);
  end loop;
end $policies$;

-- Trainers need type/range metadata to keep booking creation working, but the
-- price is returned only for a canonical server-authorized administrator.
create or replace function public.crm_fetch_room_booking_tariffs()
returns table(code text, name text, price_uah integer, people_min integer, people_max integer, is_active boolean, sort_order smallint)
language sql stable security definer set search_path = public as $$
  select t.code, t.name,
    case when public.crm_is_admin_session() then t.price_uah else null end,
    t.people_min, t.people_max, t.is_active, t.sort_order
  from public.room_booking_tariffs t
  where public.crm_is_admin_session() or t.is_active
  order by t.sort_order;
$$;
revoke execute on function public.crm_fetch_room_booking_tariffs() from public, anon;
grant execute on function public.crm_fetch_room_booking_tariffs() to authenticated;

commit;
