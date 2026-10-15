begin;

alter table public.studio_rooms
  add column if not exists booking_open boolean not null default true;

-- PostgreSQL cannot change OUT parameters with CREATE OR REPLACE. The prior
-- zero-argument RPC therefore has to be removed before adding booking_open to
-- its RETURNS TABLE shape.
drop function if exists public.crm_fetch_active_studio_rooms();

create or replace function public.crm_fetch_active_studio_rooms()
returns table (
  id uuid,
  name text,
  is_active boolean,
  booking_open boolean,
  sort_order integer,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $function$
  select sr.id, sr.name, sr.is_active, sr.booking_open, sr.sort_order, sr.created_at
  from public.studio_rooms sr
  where sr.is_active is true
    and (public.crm_is_admin_session() or public.crm_is_active_trainer_session())
  order by sr.sort_order asc, sr.created_at asc, sr.name asc;
$function$;

revoke execute on function public.crm_fetch_active_studio_rooms() from public, anon;
grant execute on function public.crm_fetch_active_studio_rooms() to authenticated;

revoke select on table public.studio_rooms from authenticated;
grant select (id, name, is_active, booking_open, sort_order, created_at)
  on public.studio_rooms to authenticated;

create or replace function public.crm_enforce_studio_room_booking_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  -- Cancelling and narrowing an existing recurring booking must remain possible.
  if coalesce(new.status, 'active') = 'cancelled' then return new; end if;
  if tg_op = 'UPDATE'
     and new.start_time is not distinct from old.start_time
     and new.end_time is not distinct from old.end_time
     and public.crm_canonical_room_name(new.room_name) = public.crm_canonical_room_name(old.room_name)
     and new.status is not distinct from old.status
     and new.recurrence is not distinct from old.recurrence
     and public.crm_schedule_booking_update_only_shrinks(
       old.date, old.recurrence_until, new.date, new.recurrence_until, new.recurrence
     )
  then return new; end if;

  -- Preserve the existing atomic occurrence-removal and canonical rename flows.
  if tg_op = 'INSERT'
     and current_setting('crm.occurrence_removal_continuation', true) = 'on'
     and public.crm_occurrence_removal_signature(
       new.date, new.start_time, new.end_time, new.room_name, new.recurrence,
       new.recurrence_until, new.status, new.trainer_id::text
     ) = current_setting('crm.occurrence_removal_signature', true)
  then return new; end if;
  if tg_op = 'UPDATE'
     and coalesce(current_setting('crm.room_rename_old_name', true), '') <> ''
     and coalesce(current_setting('crm.room_rename_new_name', true), '') <> ''
     and public.crm_canonical_room_name(old.room_name) = current_setting('crm.room_rename_old_name', true)
     and public.crm_canonical_room_name(new.room_name) = current_setting('crm.room_rename_new_name', true)
  then return new; end if;

  if exists (
    select 1
    from public.studio_rooms room
    where room.is_active is true
      and room.booking_open is false
      and public.crm_canonical_room_name(room.name) = public.crm_canonical_room_name(new.room_name)
  ) then
    raise exception 'Цей зал тимчасово недоступний для бронювання. Оберіть інший зал.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_enforce_studio_room_booking_open on public.room_bookings;
create trigger trg_enforce_studio_room_booking_open
before insert or update on public.room_bookings
for each row execute function public.crm_enforce_studio_room_booking_open();

commit;
