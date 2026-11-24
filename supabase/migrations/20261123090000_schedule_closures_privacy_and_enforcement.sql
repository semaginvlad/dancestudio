begin;

-- A single-date closure applies on its date regardless of legacy weekday selections.
create or replace function public.crm_enforce_schedule_booking_blocks()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_title text;
begin
  if coalesce(new.status,'active')='cancelled' then return new; end if;
  if tg_op='INSERT' and current_setting('crm.occurrence_removal_continuation',true)='on'
     and public.crm_occurrence_removal_signature(new.date,new.start_time,new.end_time,new.room_name,new.recurrence,new.recurrence_until,new.status,new.trainer_id::text)=current_setting('crm.occurrence_removal_signature',true)
  then return new; end if;
  if tg_op='UPDATE'
     and new.start_time is not distinct from old.start_time
     and new.end_time is not distinct from old.end_time
     and public.crm_canonical_room_name(new.room_name)=public.crm_canonical_room_name(old.room_name)
     and new.status is not distinct from old.status
     and new.recurrence is not distinct from old.recurrence
     and (new.date is distinct from old.date or new.recurrence_until is distinct from old.recurrence_until)
     and public.crm_schedule_booking_update_only_shrinks(old.date,old.recurrence_until,new.date,new.recurrence_until,new.recurrence)
  then return new; end if;
  if tg_op='UPDATE' and public.crm_is_admin_session()
     and new.date is not distinct from old.date
     and new.start_time is not distinct from old.start_time
     and new.end_time is not distinct from old.end_time
     and new.recurrence is not distinct from old.recurrence
     and new.recurrence_until is not distinct from old.recurrence_until
     and new.status is not distinct from old.status
     and coalesce(current_setting('crm.room_rename_old_name',true),'')<>''
     and coalesce(current_setting('crm.room_rename_new_name',true),'')<>''
     and public.crm_canonical_room_name(old.room_name)=current_setting('crm.room_rename_old_name',true)
     and public.crm_canonical_room_name(new.room_name)=current_setting('crm.room_rename_new_name',true)
  then return new; end if;
  select b.title into v_title
  from public.schedule_booking_blocks b
  where b.is_active
    and (
      (b.starts_on < b.ends_on and b.end_time <= b.start_time and public.crm_schedule_booking_recurrence_overlaps_continuous_block(new.date,new.recurrence_until,new.recurrence,new.start_time::time,new.end_time::time,b.starts_on,b.ends_on,b.start_time,b.end_time))
      or
      (not (b.starts_on < b.ends_on and b.end_time <= b.start_time)
       and public.crm_schedule_booking_recurrence_hits_block(new.date,new.recurrence_until,new.recurrence,b.starts_on,b.ends_on,case when b.starts_on=b.ends_on then array[1,2,3,4,5,6,7]::smallint[] else b.weekdays end)
       and new.start_time::time < b.end_time and b.start_time < new.end_time::time)
    )
    and (b.all_rooms or exists(select 1 from public.schedule_booking_block_rooms br join public.studio_rooms r on r.id=br.room_id where br.block_id=b.id and public.crm_canonical_room_name(r.name)=public.crm_canonical_room_name(new.room_name)))
  limit 1;
  if v_title is not null then
    raise exception 'Цей час закритий адміністратором' using errcode='P0001';
  end if;
  return new;
end $$;


-- All edits must be checked, including changes to fields outside the time slot.
drop trigger if exists trg_enforce_schedule_booking_blocks on public.room_bookings;
create trigger trg_enforce_schedule_booking_blocks before insert or update on public.room_bookings
for each row execute function public.crm_enforce_schedule_booking_blocks();

-- Preserve the RPC shape for existing clients while removing private metadata.
create or replace function public.crm_fetch_schedule_booking_blocks()
returns table(id uuid,title text,note text,starts_on date,ends_on date,start_time time,end_time time,all_rooms boolean,weekdays smallint[],is_active boolean,created_by uuid,created_at timestamptz,updated_at timestamptz,room_ids uuid[],room_names text[])
language sql stable security definer set search_path=public as $$
 select case when public.crm_is_admin_session() then b.id else md5(b.id::text || auth.uid()::text)::uuid end,
 case when public.crm_is_admin_session() then b.title end,
 case when public.crm_is_admin_session() then b.note end,
 b.starts_on,b.ends_on,b.start_time,b.end_time,b.all_rooms,b.weekdays,b.is_active,
 case when public.crm_is_admin_session() then b.created_by end,
 case when public.crm_is_admin_session() then b.created_at end,
 case when public.crm_is_admin_session() then b.updated_at end,
 coalesce(array_agg(r.id order by r.name) filter(where r.id is not null),'{}'),
 coalesce(array_agg(r.name order by r.name) filter(where r.id is not null),'{}')
 from public.schedule_booking_blocks b left join public.schedule_booking_block_rooms br on br.block_id=b.id left join public.studio_rooms r on r.id=br.room_id
 where public.crm_is_admin_session() or (public.crm_is_active_trainer_session() and b.is_active)
 group by b.id order by b.starts_on,b.start_time;
$$;
commit;
