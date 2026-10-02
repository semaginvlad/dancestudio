-- Run against a disposable migrated database. Every assertion is read-only and the transaction is rolled back.
begin;
do $$
declare d record;
begin
  if to_regclass('public.schedule_booking_blocks') is null or to_regclass('public.schedule_booking_block_rooms') is null then raise exception 'tables missing'; end if;
  if (select atttypid <> 'uuid'::regtype from pg_attribute where attrelid='public.schedule_booking_block_rooms'::regclass and attname='room_id') then raise exception 'room_id must be uuid'; end if;
  if not exists(select 1 from pg_class where oid='public.schedule_booking_blocks'::regclass and relrowsecurity) then raise exception 'RLS disabled'; end if;
  if exists(select 1 from information_schema.role_table_grants where table_schema='public' and table_name like 'schedule_booking_block%' and grantee in ('anon','authenticated') and privilege_type in ('INSERT','UPDATE','DELETE')) then raise exception 'direct mutations granted'; end if;
  if exists(select 1 from pg_policies where schemaname='public' and tablename like 'schedule_booking_block%' and cmd in ('INSERT','UPDATE','DELETE','ALL')) then raise exception 'mutation policy exists'; end if;
  if not exists(select 1 from pg_proc where oid='public.crm_fetch_schedule_booking_blocks()'::regprocedure and prosecdef and array_to_string(proconfig,',') like '%search_path=public%') then raise exception 'fetch hardening missing'; end if;
  if not exists(select 1 from information_schema.triggers where event_object_schema='public' and event_object_table='room_bookings' and action_timing='BEFORE' and event_manipulation='INSERT') or not exists(select 1 from information_schema.triggers where event_object_schema='public' and event_object_table='room_bookings' and event_manipulation='UPDATE') then raise exception 'booking trigger missing'; end if;
  if not public.crm_valid_iso_weekdays(array[1,7]::smallint[]) or public.crm_valid_iso_weekdays(array[1,1]::smallint[]) then raise exception 'weekday validation broken'; end if;
  if not ('10:00'::time < '11:00'::time and '10:00'::time < '11:00'::time) or ('10:00'::time < '10:00'::time) then raise exception 'half-open overlap broken'; end if;
  if not public.crm_schedule_booking_occurs_on('2026-01-01','2027-01-01','daily') then raise exception 'open-ended daily semantics broken'; end if;
  if not public.crm_schedule_booking_occurs_on('2026-01-01','2026-12-31','weekly') then raise exception 'open-ended weekly semantics broken'; end if;
  if public.crm_schedule_booking_occurs_on('2026-01-31','2026-02-28','monthly') or not public.crm_schedule_booking_occurs_on('2026-01-31','2026-03-31','monthly') then raise exception 'month-end recurrence shifted'; end if;
end $$;
rollback;
