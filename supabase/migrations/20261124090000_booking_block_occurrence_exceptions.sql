begin;

create table public.schedule_booking_block_exceptions (
  block_id uuid not null references public.schedule_booking_blocks(id) on delete cascade,
  occurrence_date date not null,
  kind text not null check (kind in ('override','skip')),
  title text, note text, start_time time, end_time time, all_rooms boolean,
  primary key (block_id, occurrence_date),
  check ((kind='skip' and title is null and note is null and start_time is null and end_time is null and all_rooms is null)
    or (kind='override' and title is not null and length(btrim(title)) between 1 and 120 and length(coalesce(note,''))<=2000 and start_time is not null and end_time is not null and start_time<end_time and all_rooms is not null))
);
create table public.schedule_booking_block_exception_rooms (
  block_id uuid not null, occurrence_date date not null, room_id uuid not null references public.studio_rooms(id),
  primary key(block_id,occurrence_date,room_id),
  foreign key(block_id,occurrence_date) references public.schedule_booking_block_exceptions(block_id,occurrence_date) on delete cascade
);
alter table public.schedule_booking_block_exceptions enable row level security;
alter table public.schedule_booking_block_exception_rooms enable row level security;
revoke all on public.schedule_booking_block_exceptions, public.schedule_booking_block_exception_rooms from public, anon, authenticated;

create function public.crm_admin_save_booking_block_exception(p_block_id uuid,p_date date,p_kind text,p_title text,p_note text,p_start_time time,p_end_time time,p_all_rooms boolean,p_room_ids uuid[])
returns void language plpgsql security definer set search_path=public as $$
declare b public.schedule_booking_blocks;
begin
  if not public.crm_is_admin_session() then raise exception 'Лише адміністратор може змінювати закриті години' using errcode='42501'; end if;
  select * into b from public.schedule_booking_blocks where id=p_block_id for update;
  if b.id is null or b.starts_on>=b.ends_on or b.end_time<=b.start_time or p_date is null or p_date not between b.starts_on and b.ends_on or not extract(isodow from p_date)::smallint=any(b.weekdays) then raise exception 'Ця дата не є повторенням правила'; end if;
  if p_kind not in ('skip','override') or p_kind is null then raise exception 'Некоректний тип винятку'; end if;
  if p_kind='override' then
    perform public.crm_validate_booking_block_input(p_title,p_note,p_date,p_date,p_start_time,p_end_time,p_all_rooms,array[1]::smallint[],p_room_ids);
  end if;
  insert into public.schedule_booking_block_exceptions(block_id,occurrence_date,kind,title,note,start_time,end_time,all_rooms)
  values(p_block_id,p_date,p_kind,case when p_kind='override' then btrim(p_title) end,case when p_kind='override' then nullif(p_note,'') end,case when p_kind='override' then p_start_time end,case when p_kind='override' then p_end_time end,case when p_kind='override' then p_all_rooms end)
  on conflict(block_id,occurrence_date) do update set kind=excluded.kind,title=excluded.title,note=excluded.note,start_time=excluded.start_time,end_time=excluded.end_time,all_rooms=excluded.all_rooms;
  delete from public.schedule_booking_block_exception_rooms where block_id=p_block_id and occurrence_date=p_date;
  if p_kind='override' and not p_all_rooms then insert into public.schedule_booking_block_exception_rooms select p_block_id,p_date,id from unnest(p_room_ids) id; end if;
end $$;

create function public.crm_admin_delete_booking_block_exception(p_block_id uuid,p_date date)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.crm_is_admin_session() then raise exception 'Лише адміністратор може змінювати закриті години' using errcode='42501'; end if;
  delete from public.schedule_booking_block_exceptions where block_id=p_block_id and occurrence_date=p_date;
end $$;

-- IDs and private details are visible only to administrators. The pseudonym matches the base RPC.
create function public.crm_fetch_booking_block_exceptions()
returns table(block_id uuid,occurrence_date date,kind text,title text,note text,start_time time,end_time time,all_rooms boolean,room_ids uuid[],room_names text[])
language sql stable security definer set search_path=public as $$
 select case when public.crm_is_admin_session() then e.block_id else md5(e.block_id::text || auth.uid()::text)::uuid end,
 e.occurrence_date,e.kind,case when public.crm_is_admin_session() then e.title end,case when public.crm_is_admin_session() then e.note end,
 e.start_time,e.end_time,e.all_rooms,
 coalesce(array_agg(r.id order by r.name) filter(where r.id is not null),'{}'),
 coalesce(array_agg(r.name order by r.name) filter(where r.id is not null),'{}')
 from public.schedule_booking_block_exceptions e join public.schedule_booking_blocks b on b.id=e.block_id
 left join public.schedule_booking_block_exception_rooms er on er.block_id=e.block_id and er.occurrence_date=e.occurrence_date
 left join public.studio_rooms r on r.id=er.room_id
 where public.crm_is_admin_session() or (public.crm_is_active_trainer_session() and b.is_active)
 group by e.block_id,e.occurrence_date;
$$;

-- The base rule applies in the gaps between exception dates; this stays bounded
-- by the number of exceptions even for an open-ended recurring booking.
create function public.crm_booking_block_conflicts(p_block_id uuid,p_start date,p_until date,p_recurrence text,p_start_time time,p_end_time time,p_room text)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare b public.schedule_booking_blocks; e record; v_from date; v_weekdays smallint[]; v_base_room boolean;
begin
 select * into b from public.schedule_booking_blocks where id=p_block_id;
 v_weekdays:=case when b.starts_on=b.ends_on then array[1,2,3,4,5,6,7]::smallint[] else b.weekdays end;
 v_base_room:=b.all_rooms or exists(select 1 from public.schedule_booking_block_rooms br join public.studio_rooms r on r.id=br.room_id where br.block_id=b.id and public.crm_canonical_room_name(r.name)=public.crm_canonical_room_name(p_room));
 v_from:=b.starts_on;
 for e in select * from public.schedule_booking_block_exceptions where block_id=b.id and b.starts_on<b.ends_on and occurrence_date between b.starts_on and b.ends_on order by occurrence_date loop
   if v_base_room and p_start_time<b.end_time and b.start_time<p_end_time and v_from<=e.occurrence_date-1 and public.crm_schedule_booking_recurrence_hits_block(p_start,p_until,p_recurrence,v_from,e.occurrence_date-1,v_weekdays) then return true; end if;
   if e.kind='override' and extract(isodow from e.occurrence_date)::smallint=any(v_weekdays)
      and public.crm_schedule_booking_recurrence_hits_block(p_start,p_until,p_recurrence,e.occurrence_date,e.occurrence_date,v_weekdays)
      and p_start_time<e.end_time and e.start_time<p_end_time
      and (e.all_rooms or exists(select 1 from public.schedule_booking_block_exception_rooms er join public.studio_rooms r on r.id=er.room_id where er.block_id=b.id and er.occurrence_date=e.occurrence_date and public.crm_canonical_room_name(r.name)=public.crm_canonical_room_name(p_room))) then return true; end if;
   v_from:=e.occurrence_date+1;
 end loop;
 return v_base_room and p_start_time<b.end_time and b.start_time<p_end_time and v_from<=b.ends_on and public.crm_schedule_booking_recurrence_hits_block(p_start,p_until,p_recurrence,v_from,b.ends_on,v_weekdays);
end $$;

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
  select b.title into v_title from public.schedule_booking_blocks b
  where b.is_active and (
    (b.starts_on < b.ends_on and b.end_time <= b.start_time
      and public.crm_schedule_booking_recurrence_overlaps_continuous_block(new.date,new.recurrence_until,new.recurrence,new.start_time::time,new.end_time::time,b.starts_on,b.ends_on,b.start_time,b.end_time)
      and (b.all_rooms or exists(select 1 from public.schedule_booking_block_rooms br join public.studio_rooms r on r.id=br.room_id where br.block_id=b.id and public.crm_canonical_room_name(r.name)=public.crm_canonical_room_name(new.room_name))))
    or
    (not (b.starts_on < b.ends_on and b.end_time <= b.start_time)
      and public.crm_booking_block_conflicts(b.id,new.date,new.recurrence_until,new.recurrence,new.start_time::time,new.end_time::time,new.room_name))
  ) limit 1;
  if v_title is not null then
    raise exception 'Цей час закритий адміністратором' using errcode='P0001';
  end if;
  return new;
end $$;



revoke execute on function public.crm_booking_block_conflicts(uuid,date,date,text,time,time,text) from public,anon,authenticated;
revoke execute on function public.crm_admin_save_booking_block_exception(uuid,date,text,text,text,time,time,boolean,uuid[]) from public,anon;
revoke execute on function public.crm_admin_delete_booking_block_exception(uuid,date) from public,anon;
revoke execute on function public.crm_fetch_booking_block_exceptions() from public,anon;
grant execute on function public.crm_admin_save_booking_block_exception(uuid,date,text,text,text,time,time,boolean,uuid[]) to authenticated;
grant execute on function public.crm_admin_delete_booking_block_exception(uuid,date) to authenticated;
grant execute on function public.crm_fetch_booking_block_exceptions() to authenticated;
commit;
