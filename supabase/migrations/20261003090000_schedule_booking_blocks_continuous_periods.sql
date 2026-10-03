begin;

alter table public.schedule_booking_blocks drop constraint if exists schedule_booking_blocks_times_check;
alter table public.schedule_booking_blocks add constraint schedule_booking_blocks_times_check
  check (starts_on < ends_on or start_time < end_time);

create or replace function public.crm_validate_booking_block_input(
  p_title text, p_note text, p_starts_on date, p_ends_on date, p_start_time time,
  p_end_time time, p_all_rooms boolean, p_weekdays smallint[], p_room_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.crm_is_admin_session() then raise exception 'Лише адміністратор може змінювати закриті години' using errcode='42501'; end if;
  if p_title is null or length(btrim(p_title)) not between 1 and 120 then raise exception 'Назва повинна містити 1–120 символів'; end if;
  if length(coalesce(p_note,'')) > 2000 then raise exception 'Нотатка задовга'; end if;
  if p_starts_on is null or p_ends_on is null or p_starts_on > p_ends_on then raise exception 'Некоректний діапазон дат'; end if;
  if p_start_time is null or p_end_time is null or (p_starts_on=p_ends_on and p_start_time>=p_end_time) then raise exception 'Некоректний діапазон часу'; end if;
  if cardinality(p_weekdays) is null or cardinality(p_weekdays)=0 or exists(select 1 from unnest(p_weekdays) d where d not between 1 and 7) or cardinality(p_weekdays)<>(select count(distinct d) from unnest(p_weekdays)d) then raise exception 'Дні тижня мають бути унікальними ISO 1–7'; end if;
  if coalesce(p_all_rooms,false)=false and coalesce(cardinality(p_room_ids),0)=0 then raise exception 'Оберіть хоча б одну залу'; end if;
  if coalesce(p_all_rooms,false) and coalesce(cardinality(p_room_ids),0)>0 then raise exception 'Для всіх зал room links не передаються'; end if;
  if exists(select 1 from unnest(coalesce(p_room_ids,'{}')) id left join public.studio_rooms r on r.id=id where r.id is null) then raise exception 'Невідома зала'; end if;
end $$;

create or replace function public.crm_schedule_booking_recurrence_overlaps_continuous_block(
 p_start date,p_until date,p_recurrence text,p_booking_start time,p_booking_end time,
 p_block_start date,p_block_end date,p_block_start_time time,p_block_end_time time)
returns boolean language sql immutable set search_path=public as $$
  select
    (public.crm_schedule_booking_recurrence_hits_block(p_start,p_until,p_recurrence,p_block_start,p_block_start,array[1,2,3,4,5,6,7]::smallint[]) and p_booking_end>p_block_start_time)
    or
    (public.crm_schedule_booking_recurrence_hits_block(p_start,p_until,p_recurrence,p_block_end,p_block_end,array[1,2,3,4,5,6,7]::smallint[]) and p_booking_start<p_block_end_time)
    or
    (p_block_start+1<=p_block_end-1 and public.crm_schedule_booking_recurrence_hits_block(p_start,p_until,p_recurrence,p_block_start+1,p_block_end-1,array[1,2,3,4,5,6,7]::smallint[]))
$$;

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
       and public.crm_schedule_booking_recurrence_hits_block(new.date,new.recurrence_until,new.recurrence,b.starts_on,b.ends_on,b.weekdays)
       and new.start_time::time < b.end_time and b.start_time < new.end_time::time)
    )
    and (b.all_rooms or exists(select 1 from public.schedule_booking_block_rooms br join public.studio_rooms r on r.id=br.room_id where br.block_id=b.id and public.crm_canonical_room_name(r.name)=public.crm_canonical_room_name(new.room_name)))
  limit 1;
  if v_title is not null then
    if public.crm_is_admin_session()
       and current_setting('crm.booking_block_override',true)='on' then return new; end if;
    raise exception 'Цей час закритий адміністратором: %',v_title using errcode='P0001';
  end if;
  return new;
end $$;


revoke execute on function public.crm_schedule_booking_recurrence_overlaps_continuous_block(date,date,text,time,time,date,date,time,time) from public,anon,authenticated;
revoke execute on function public.crm_validate_booking_block_input(text,text,date,date,time,time,boolean,smallint[],uuid[]) from public,anon,authenticated;

commit;
