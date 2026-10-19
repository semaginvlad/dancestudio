begin;

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

  -- Closed rooms are an operational restriction for trainers, not admins.
  if public.crm_is_admin_session() then return new; end if;

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

commit;
