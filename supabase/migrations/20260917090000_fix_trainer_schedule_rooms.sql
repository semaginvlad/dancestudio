-- Keep trainer Schedule room labels accurate without exposing booking-private data.
begin;

do $preflight$
declare
  v_missing text;
  v_args integer;
begin
  select string_agg(required.name, ', ' order by required.name)
    into v_missing
  from (values
    ('room_bookings'), ('studio_rooms'), ('trainers')
  ) as required(name)
  where to_regclass('public.' || required.name) is null;

  if v_missing is not null then
    raise exception 'schedule room migration requires tables: %', v_missing;
  end if;

  if to_regprocedure('public.crm_is_admin_session()') is null
     or to_regprocedure('public.crm_is_active_trainer_session()') is null then
    raise exception 'canonical CRM session helpers are required';
  end if;

  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.room_bookings'::regclass
      and attname = 'room_name' and atttypid = 'text'::regtype and not attisdropped
  ) then
    raise exception 'room_bookings.room_name text is required';
  end if;

  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.trainers'::regclass
      and attname = 'auth_user_id' and atttypid = 'uuid'::regtype and not attisdropped
  ) then
    raise exception 'trainers.auth_user_id uuid is required';
  end if;

  select count(*) into v_args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'crm_fetch_schedule_room_bookings'
    and p.pronargs <> 0;
  if v_args > 0 then
    raise exception 'unexpected parameterized crm_fetch_schedule_room_bookings overload';
  end if;
end;
$preflight$;

-- RETURNS TABLE gains room_name, so CREATE OR REPLACE is not valid here.
-- Deliberately omit CASCADE: unexpected dependencies must abort the transaction.
drop function if exists public.crm_fetch_schedule_room_bookings();

create function public.crm_fetch_schedule_room_bookings()
returns table (
  id uuid,
  date date,
  start_time text,
  end_time text,
  trainer_id text,
  trainer_name text,
  title text,
  type text,
  booking_type text,
  people_count integer,
  price integer,
  payment_method text,
  event_type text,
  note text,
  color text,
  recurrence text,
  recurrence_until date,
  description text,
  status text,
  created_at timestamptz,
  room_name text
)
language sql
stable
security definer
set search_path = public
as $function$
  with visible as (
    select
      rb.*,
      public.crm_is_admin_session() as is_admin,
      exists (
        select 1
        from public.trainers t
        where t.id::text = rb.trainer_id::text
          and t.auth_user_id = auth.uid()
          and coalesce(t.is_active, true) = true
          and t.archived_at is null
          and t.access_disabled_at is null
      ) as is_owner
    from public.room_bookings rb
    where public.crm_is_admin_session() or public.crm_is_active_trainer_session()
  )
  select
    v.id, v.date, v.start_time, v.end_time, v.trainer_id::text, v.trainer_name,
    v.title, v.type, v.booking_type,
    case when v.is_admin or v.is_owner then v.people_count else null end,
    case when v.is_admin or v.is_owner then v.price else null end,
    case when v.is_admin or v.is_owner then v.payment_method else null end,
    v.event_type,
    case when v.is_admin or v.is_owner then v.note else null end,
    v.color, v.recurrence, v.recurrence_until,
    case when v.is_admin or v.is_owner then v.description else null end,
    v.status, v.created_at, v.room_name
  from visible v
  order by v.date asc, v.start_time asc;
$function$;

revoke execute on function public.crm_fetch_schedule_room_bookings() from public, anon;
grant execute on function public.crm_fetch_schedule_room_bookings() to authenticated;

create or replace function public.crm_fetch_active_studio_rooms()
returns table (
  id uuid,
  name text,
  is_active boolean,
  sort_order integer,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $function$
  select sr.id, sr.name, sr.is_active, sr.sort_order, sr.created_at
  from public.studio_rooms sr
  where sr.is_active is true
    and (public.crm_is_admin_session() or public.crm_is_active_trainer_session())
  order by sr.sort_order asc, sr.created_at asc, sr.name asc;
$function$;

revoke execute on function public.crm_fetch_active_studio_rooms() from public, anon;
grant execute on function public.crm_fetch_active_studio_rooms() to authenticated;

-- Preserve a narrow read surface even if columns are added later. RLS still
-- gates rows, while room management remains admin-only.
revoke select on table public.studio_rooms from authenticated;
grant select (id, name, is_active, sort_order, created_at) on public.studio_rooms to authenticated;

drop policy if exists studio_rooms_select_authenticated on public.studio_rooms;
create policy studio_rooms_select_authenticated
on public.studio_rooms for select to authenticated
using (public.crm_is_admin_session() or public.crm_is_active_trainer_session());

drop policy if exists studio_rooms_admin_mutations on public.studio_rooms;
create policy studio_rooms_admin_mutations
on public.studio_rooms for all to authenticated
using (public.crm_is_admin_session())
with check (public.crm_is_admin_session());

commit;
