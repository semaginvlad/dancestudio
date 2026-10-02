begin;

do $preflight$
begin
  if to_regclass('public.studio_rooms') is null or to_regclass('public.room_bookings') is null then
    raise exception 'schedule booking blocks require studio_rooms and room_bookings';
  end if;
  if to_regprocedure('public.crm_is_admin_session()') is null or to_regprocedure('public.crm_is_active_trainer_session()') is null then
    raise exception 'canonical CRM session helpers are required';
  end if;
end $preflight$;

create or replace function public.crm_valid_iso_weekdays(p_days smallint[])
returns boolean language sql immutable set search_path=public as $$
  select coalesce(cardinality(p_days)>0 and p_days <@ array[1,2,3,4,5,6,7]::smallint[] and cardinality(p_days)=(select count(distinct d) from unnest(p_days)d),false)
$$;

create table if not exists public.schedule_booking_blocks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  note text,
  starts_on date not null,
  ends_on date not null,
  start_time time not null,
  end_time time not null,
  all_rooms boolean not null default false,
  weekdays smallint[] not null,
  is_active boolean not null default true,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_booking_blocks_title_check check (length(btrim(title)) between 1 and 120),
  constraint schedule_booking_blocks_note_check check (note is null or length(note) <= 2000),
  constraint schedule_booking_blocks_dates_check check (starts_on <= ends_on),
  constraint schedule_booking_blocks_times_check check (start_time < end_time),
  constraint schedule_booking_blocks_weekdays_check check (public.crm_valid_iso_weekdays(weekdays))
);

create table if not exists public.schedule_booking_block_rooms (
  block_id uuid not null references public.schedule_booking_blocks(id) on delete cascade,
  room_id uuid not null references public.studio_rooms(id),
  primary key (block_id, room_id)
);

alter table public.schedule_booking_blocks enable row level security;
alter table public.schedule_booking_block_rooms enable row level security;
revoke all on public.schedule_booking_blocks, public.schedule_booking_block_rooms from public, anon, authenticated;

drop policy if exists schedule_booking_blocks_read on public.schedule_booking_blocks;
create policy schedule_booking_blocks_read on public.schedule_booking_blocks for select to authenticated
using (public.crm_is_admin_session() or public.crm_is_active_trainer_session());
drop policy if exists schedule_booking_block_rooms_read on public.schedule_booking_block_rooms;
create policy schedule_booking_block_rooms_read on public.schedule_booking_block_rooms for select to authenticated
using (public.crm_is_admin_session() or public.crm_is_active_trainer_session());

create or replace function public.crm_validate_booking_block_input(
  p_title text, p_note text, p_starts_on date, p_ends_on date, p_start_time time,
  p_end_time time, p_all_rooms boolean, p_weekdays smallint[], p_room_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.crm_is_admin_session() then raise exception 'Лише адміністратор може змінювати закриті години' using errcode='42501'; end if;
  if p_title is null or length(btrim(p_title)) not between 1 and 120 then raise exception 'Назва повинна містити 1–120 символів'; end if;
  if length(coalesce(p_note,'')) > 2000 then raise exception 'Нотатка задовга'; end if;
  if p_starts_on is null or p_ends_on is null or p_starts_on > p_ends_on then raise exception 'Некоректний діапазон дат'; end if;
  if p_start_time is null or p_end_time is null or p_start_time >= p_end_time then raise exception 'Некоректний діапазон часу'; end if;
  if cardinality(p_weekdays) is null or cardinality(p_weekdays)=0 or exists(select 1 from unnest(p_weekdays) d where d not between 1 and 7) or cardinality(p_weekdays)<>(select count(distinct d) from unnest(p_weekdays)d) then raise exception 'Дні тижня мають бути унікальними ISO 1–7'; end if;
  if coalesce(p_all_rooms,false)=false and coalesce(cardinality(p_room_ids),0)=0 then raise exception 'Оберіть хоча б одну залу'; end if;
  if coalesce(p_all_rooms,false) and coalesce(cardinality(p_room_ids),0)>0 then raise exception 'Для всіх зал room links не передаються'; end if;
  if exists(select 1 from unnest(coalesce(p_room_ids,'{}')) id left join public.studio_rooms r on r.id=id where r.id is null) then raise exception 'Невідома зала'; end if;
end $$;

create or replace function public.crm_admin_create_schedule_booking_block(p_title text,p_note text,p_starts_on date,p_ends_on date,p_start_time time,p_end_time time,p_all_rooms boolean,p_weekdays smallint[],p_room_ids uuid[] default '{}',p_is_active boolean default true)
returns public.schedule_booking_blocks language plpgsql security definer set search_path=public as $$
declare v_row public.schedule_booking_blocks;
begin
  perform public.crm_validate_booking_block_input(p_title,p_note,p_starts_on,p_ends_on,p_start_time,p_end_time,p_all_rooms,p_weekdays,p_room_ids);
  insert into public.schedule_booking_blocks(title,note,starts_on,ends_on,start_time,end_time,all_rooms,weekdays,is_active,created_by)
  values(btrim(p_title),nullif(p_note,''),p_starts_on,p_ends_on,p_start_time,p_end_time,p_all_rooms,p_weekdays,coalesce(p_is_active,true),auth.uid()) returning * into v_row;
  if not p_all_rooms then insert into public.schedule_booking_block_rooms select v_row.id, id from unnest(p_room_ids) id; end if;
  return v_row;
end $$;

create or replace function public.crm_admin_update_schedule_booking_block(p_id uuid,p_title text,p_note text,p_starts_on date,p_ends_on date,p_start_time time,p_end_time time,p_all_rooms boolean,p_weekdays smallint[],p_room_ids uuid[] default '{}',p_is_active boolean default true)
returns public.schedule_booking_blocks language plpgsql security definer set search_path=public as $$
declare v_row public.schedule_booking_blocks;
begin
  perform public.crm_validate_booking_block_input(p_title,p_note,p_starts_on,p_ends_on,p_start_time,p_end_time,p_all_rooms,p_weekdays,p_room_ids);
  update public.schedule_booking_blocks set title=btrim(p_title),note=nullif(p_note,''),starts_on=p_starts_on,ends_on=p_ends_on,start_time=p_start_time,end_time=p_end_time,all_rooms=p_all_rooms,weekdays=p_weekdays,is_active=coalesce(p_is_active,true),updated_at=now() where id=p_id returning * into v_row;
  if v_row.id is null then raise exception 'Правило не знайдено'; end if;
  delete from public.schedule_booking_block_rooms where block_id=p_id;
  if not p_all_rooms then insert into public.schedule_booking_block_rooms select p_id,id from unnest(p_room_ids)id; end if;
  return v_row;
end $$;

create or replace function public.crm_admin_delete_schedule_booking_block(p_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
begin
  if not public.crm_is_admin_session() then raise exception 'Лише адміністратор може видаляти закриті години' using errcode='42501'; end if;
  delete from public.schedule_booking_blocks where id=p_id;
  if not found then raise exception 'Правило не знайдено'; end if;
  return p_id;
end $$;

create or replace function public.crm_fetch_schedule_booking_blocks()
returns table(id uuid,title text,note text,starts_on date,ends_on date,start_time time,end_time time,all_rooms boolean,weekdays smallint[],is_active boolean,created_by uuid,created_at timestamptz,updated_at timestamptz,room_ids uuid[],room_names text[])
language sql stable security definer set search_path=public as $$
 select b.id,b.title,b.note,b.starts_on,b.ends_on,b.start_time,b.end_time,b.all_rooms,b.weekdays,b.is_active,b.created_by,b.created_at,b.updated_at,
 coalesce(array_agg(r.id order by r.name) filter(where r.id is not null),'{}'),coalesce(array_agg(r.name order by r.name) filter(where r.id is not null),'{}')
 from public.schedule_booking_blocks b left join public.schedule_booking_block_rooms br on br.block_id=b.id left join public.studio_rooms r on r.id=br.room_id
 where public.crm_is_admin_session() or public.crm_is_active_trainer_session() group by b.id order by b.starts_on,b.start_time;
$$;

-- Candidate dates are generated only inside a block's finite date range. This
-- keeps open-ended recurrences safe and makes monthly recurrence skip months
-- that do not contain the original day (for example, January 31 -> March 31).
create or replace function public.crm_schedule_booking_occurs_on(p_start date,p_candidate date,p_recurrence text)
returns boolean language sql immutable set search_path=public as $$
  select case lower(coalesce(p_recurrence,'none'))
    when 'none' then p_candidate=p_start
    when 'daily' then p_candidate>=p_start
    when 'weekly' then p_candidate>=p_start and (p_candidate-p_start)%7=0
    when 'monthly' then p_candidate>=p_start and extract(day from p_candidate)=extract(day from p_start)
    else p_candidate=p_start
  end
$$;

create or replace function public.crm_schedule_booking_recurrence_hits_block(
  p_start date,p_until date,p_recurrence text,p_block_start date,p_block_end date,p_weekdays smallint[])
returns boolean language plpgsql immutable set search_path=public as $$
declare
  v_mode text := lower(coalesce(p_recurrence,'none'));
  v_from date := greatest(p_start,p_block_start);
  v_to date;
  v_candidate date;
  v_month date;
  v_offset integer;
  i integer;
begin
  if v_mode not in ('daily','weekly','monthly') then
    return p_start between p_block_start and p_block_end
      and extract(isodow from p_start)::smallint=any(p_weekdays);
  end if;
  v_to := least(coalesce(p_until,p_block_end),p_block_end);
  if v_from > v_to then return false; end if;
  if v_mode='daily' then
    -- Seven dates cover every possible ISO weekday, regardless of rule length.
    for i in 0..least(6,v_to-v_from) loop
      if extract(isodow from (v_from+i))::smallint=any(p_weekdays) then return true; end if;
    end loop;
    return false;
  elsif v_mode='weekly' then
    v_offset := v_from-p_start;
    v_candidate := p_start + (((v_offset+6)/7)*7);
    return v_candidate <= v_to and extract(isodow from v_candidate)::smallint=any(p_weekdays);
  end if;

  -- Monthly work scales by months, never days; invalid dates such as February
  -- 31 roll forward and are rejected by the day equality check.
  v_month := date_trunc('month',v_from)::date;
  while v_month <= date_trunc('month',v_to)::date loop
    v_candidate := (v_month + (extract(day from p_start)::integer-1))::date;
    if extract(day from v_candidate)=extract(day from p_start)
       and v_candidate between v_from and v_to
       and extract(isodow from v_candidate)::smallint=any(p_weekdays) then return true; end if;
    v_month := (v_month+interval '1 month')::date;
  end loop;
  return false;
end $$;

create or replace function public.crm_schedule_booking_step_date(p_date date,p_recurrence text,p_direction integer)
returns date language plpgsql immutable set search_path=public as $$
declare v_month date; v_candidate date; i integer;
begin
  if p_direction not in (-1,1) then raise exception 'direction must be -1 or 1'; end if;
  if lower(coalesce(p_recurrence,''))='daily' then return p_date+p_direction; end if;
  if lower(coalesce(p_recurrence,''))='weekly' then return p_date+(7*p_direction); end if;
  if lower(coalesce(p_recurrence,''))<>'monthly' then return null; end if;
  v_month:=date_trunc('month',p_date)::date;
  for i in 1..12 loop
    v_month:=(v_month+(p_direction*interval '1 month'))::date;
    v_candidate:=(v_month+(extract(day from p_date)::integer-1))::date;
    if extract(day from v_candidate)=extract(day from p_date) then return v_candidate; end if;
  end loop;
  return null;
end $$;

create or replace function public.crm_schedule_booking_update_only_shrinks(old_start date,old_until date,new_start date,new_until date,p_recurrence text)
returns boolean language sql immutable set search_path=public as $$
  select lower(coalesce(p_recurrence,'')) in ('daily','weekly','monthly')
    and new_start>=old_start
    and public.crm_schedule_booking_occurs_on(old_start,new_start,p_recurrence)
    and (old_until is null or (new_until is not null and new_until<=old_until))
    and (new_until is null or new_start<=new_until)
    and (new_start>old_start or (new_until is not null and (old_until is null or new_until<old_until)))
$$;

create or replace function public.crm_canonical_room_name(p_name text)
returns text language sql immutable set search_path=public as $$
  select lower(btrim(regexp_replace(coalesce(p_name,''),'[[:space:]]+',' ','g')))
$$;

create or replace function public.crm_occurrence_removal_signature(p_date date,p_start text,p_end text,p_room text,p_recurrence text,p_until date,p_status text,p_trainer text)
returns text language sql immutable set search_path=public as $$
  select concat_ws('|',p_date::text,coalesce(p_start,''),coalesce(p_end,''),public.crm_canonical_room_name(p_room),lower(coalesce(p_recurrence,'none')),coalesce(p_until::text,''),coalesce(p_status,'active'),coalesce(p_trainer,''))
$$;

-- Replace the canonical rename RPC so its room-booking metadata cascade can
-- cross existing blocks without opening a general room_name bypass.
create or replace function public.rename_studio_room(p_room_id uuid,p_new_name text)
returns public.studio_rooms language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_room public.studio_rooms;
  v_old_name text;
  v_previous_old text := current_setting('crm.room_rename_old_name',true);
  v_previous_new text := current_setting('crm.room_rename_new_name',true);
begin
  if not public.crm_is_admin_session() then raise exception 'Лише адміністратор може перейменовувати зали' using errcode='42501'; end if;
  if p_room_id is null or nullif(btrim(p_new_name),'') is null then raise exception 'room id and name are required' using errcode='22023'; end if;
  select name into v_old_name from public.studio_rooms where id=p_room_id for update;
  if not found then raise exception 'studio room not found' using errcode='P0002'; end if;
  update public.studio_rooms set name=btrim(p_new_name) where id=p_room_id returning * into v_room;

  perform set_config('crm.room_rename_old_name',public.crm_canonical_room_name(v_old_name),true);
  perform set_config('crm.room_rename_new_name',public.crm_canonical_room_name(v_room.name),true);
  begin
    update public.room_bookings set room_name=v_room.name
    where public.crm_canonical_room_name(room_name)=public.crm_canonical_room_name(v_old_name);
  exception when others then
    perform set_config('crm.room_rename_old_name',coalesce(v_previous_old,''),true);
    perform set_config('crm.room_rename_new_name',coalesce(v_previous_new,''),true);
    raise;
  end;
  perform set_config('crm.room_rename_old_name',coalesce(v_previous_old,''),true);
  perform set_config('crm.room_rename_new_name',coalesce(v_previous_new,''),true);

  update public.group_lesson_overrides set room_name=v_room.name
  where public.crm_canonical_room_name(room_name)=public.crm_canonical_room_name(v_old_name);
  with rewritten as (
    select g.id,jsonb_agg(case when jsonb_typeof(slot.value)='object' and
      (coalesce(slot.value->>'roomId',slot.value->>'room_id')=p_room_id::text or
       (nullif(btrim(coalesce(slot.value->>'roomId',slot.value->>'room_id')),'') is null and
        public.crm_canonical_room_name(coalesce(slot.value->>'roomName',slot.value->>'room_name',slot.value->>'room',slot.value->>'location',slot.value->>'hall',''))=public.crm_canonical_room_name(v_old_name)))
      then (slot.value-'room_id'-'room_name'-'room'-'location'-'hall')||jsonb_build_object('roomId',p_room_id::text,'roomName',v_room.name)
      else slot.value end order by slot.ordinality) schedule
    from public.groups g cross join lateral jsonb_array_elements(case when jsonb_typeof(g.schedule)='array' then g.schedule else '[]'::jsonb end) with ordinality slot(value,ordinality)
    where jsonb_typeof(g.schedule)='array' group by g.id)
  update public.groups g set schedule=rewritten.schedule from rewritten where g.id=rewritten.id and rewritten.schedule is distinct from g.schedule;
  return v_room;
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
    and public.crm_schedule_booking_recurrence_hits_block(new.date,new.recurrence_until,new.recurrence,b.starts_on,b.ends_on,b.weekdays)
    and new.start_time::time < b.end_time and b.start_time < new.end_time::time
    and (b.all_rooms or exists(select 1 from public.schedule_booking_block_rooms br join public.studio_rooms r on r.id=br.room_id where br.block_id=b.id and public.crm_canonical_room_name(r.name)=public.crm_canonical_room_name(new.room_name)))
  limit 1;
  if v_title is not null then
    if public.crm_is_admin_session()
       and current_setting('crm.booking_block_override',true)='on' then return new; end if;
    raise exception 'Цей час закритий адміністратором: %',v_title using errcode='P0001';
  end if;
  return new;
end $$;

drop trigger if exists trg_enforce_schedule_booking_blocks on public.room_bookings;
create trigger trg_enforce_schedule_booking_blocks before insert or update of date,start_time,end_time,room_name,status,recurrence,recurrence_until on public.room_bookings for each row execute function public.crm_enforce_schedule_booking_blocks();

create or replace function public.crm_remove_room_booking_occurrence(p_id uuid,p_occurrence_date date)
returns boolean language plpgsql security definer set search_path=public as $$
declare
  v_old public.room_bookings;
  v_next date;
  v_prev date;
  v_previous_context text:=current_setting('crm.occurrence_removal_continuation',true);
  v_previous_signature text:=current_setting('crm.occurrence_removal_signature',true);
begin
  select * into v_old from public.room_bookings where id=p_id for update;
  if v_old.id is null then raise exception 'Бронювання не знайдено'; end if;
  if not public.crm_is_admin_session() then
    if not public.crm_is_active_trainer_session() or not exists(
      select 1 from public.trainers t where t.auth_user_id=auth.uid() and t.is_active is true
        and t.archived_at is null and t.access_disabled_at is null
        and (v_old.trainer_id::text=auth.uid()::text or v_old.trainer_id::text=t.id::text)
    ) then raise exception 'Немає права змінювати це бронювання' using errcode='42501'; end if;
  end if;
  if lower(coalesce(v_old.recurrence,'none')) not in ('daily','weekly','monthly')
     or not public.crm_schedule_booking_occurs_on(v_old.date,p_occurrence_date,v_old.recurrence)
     or p_occurrence_date<v_old.date
     or (v_old.recurrence_until is not null and p_occurrence_date>v_old.recurrence_until)
  then raise exception 'Occurrence не належить серії' using errcode='22023'; end if;
  v_next:=public.crm_schedule_booking_step_date(p_occurrence_date,v_old.recurrence,1);
  v_prev:=public.crm_schedule_booking_step_date(p_occurrence_date,v_old.recurrence,-1);
  if p_occurrence_date=v_old.date then
    if v_old.recurrence_until is not null and v_next>v_old.recurrence_until then delete from public.room_bookings where id=p_id;
    else update public.room_bookings set date=v_next where id=p_id; end if;
  elsif v_old.recurrence_until is not null and (v_next is null or v_next>v_old.recurrence_until) then
    update public.room_bookings set recurrence_until=v_prev where id=p_id;
  else
    update public.room_bookings set recurrence_until=v_prev where id=p_id;
    perform set_config('crm.occurrence_removal_continuation','on',true);
    perform set_config('crm.occurrence_removal_signature',public.crm_occurrence_removal_signature(v_next,v_old.start_time,v_old.end_time,v_old.room_name,v_old.recurrence,v_old.recurrence_until,v_old.status,v_old.trainer_id::text),true);
    begin
      insert into public.room_bookings(date,start_time,end_time,trainer_id,trainer_name,title,type,booking_type,people_count,price,payment_method,event_type,note,color,recurrence,recurrence_until,description,status,room_name)
      values(v_next,v_old.start_time,v_old.end_time,v_old.trainer_id,v_old.trainer_name,v_old.title,v_old.type,v_old.booking_type,v_old.people_count,v_old.price,v_old.payment_method,v_old.event_type,v_old.note,v_old.color,v_old.recurrence,v_old.recurrence_until,v_old.description,v_old.status,v_old.room_name);
    exception when others then
      perform set_config('crm.occurrence_removal_continuation',coalesce(v_previous_context,''),true);
      perform set_config('crm.occurrence_removal_signature',coalesce(v_previous_signature,''),true);
      raise;
    end;
    perform set_config('crm.occurrence_removal_continuation',coalesce(v_previous_context,''),true);
    perform set_config('crm.occurrence_removal_signature',coalesce(v_previous_signature,''),true);
  end if;
  return true;
end $$;

-- The override is deliberately available only through these whitelisted,
-- admin-checked writes. set_config(..., true) scopes the flag to this RPC's
-- transaction, so a later ordinary request must pass the trigger again.
create or replace function public.crm_admin_override_create_room_booking(
  p_date date,p_start_time text,p_end_time text,p_trainer_id text,p_trainer_name text,
  p_title text,p_type text,p_booking_type text,p_people_count integer,p_price integer,
  p_payment_method text,p_event_type text,p_note text,p_color text,p_recurrence text,
  p_recurrence_until date,p_description text,p_status text,p_room_name text)
returns public.room_bookings language plpgsql security definer set search_path=public as $$
declare v_row public.room_bookings;
begin
  if not public.crm_is_admin_session() then raise exception 'Лише адміністратор може підтвердити обхід закритих годин' using errcode='42501'; end if;
  perform set_config('crm.booking_block_override','on',true);
  insert into public.room_bookings(date,start_time,end_time,trainer_id,trainer_name,title,type,booking_type,people_count,price,payment_method,event_type,note,color,recurrence,recurrence_until,description,status,room_name)
  values(p_date,p_start_time,p_end_time,p_trainer_id,p_trainer_name,p_title,coalesce(p_type,'individual'),p_booking_type,p_people_count,p_price,p_payment_method,p_event_type,p_note,p_color,coalesce(p_recurrence,'none'),p_recurrence_until,p_description,coalesce(p_status,'active'),p_room_name)
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.crm_admin_override_update_room_booking(
  p_id uuid,p_date date,p_start_time text,p_end_time text,p_trainer_id text,p_trainer_name text,
  p_title text,p_type text,p_booking_type text,p_people_count integer,p_price integer,
  p_payment_method text,p_event_type text,p_note text,p_color text,p_recurrence text,
  p_recurrence_until date,p_description text,p_status text,p_room_name text)
returns public.room_bookings language plpgsql security definer set search_path=public as $$
declare v_row public.room_bookings;
begin
  if not public.crm_is_admin_session() then raise exception 'Лише адміністратор може підтвердити обхід закритих годин' using errcode='42501'; end if;
  perform set_config('crm.booking_block_override','on',true);
  update public.room_bookings set date=p_date,start_time=p_start_time,end_time=p_end_time,
    trainer_id=p_trainer_id,trainer_name=p_trainer_name,title=p_title,type=coalesce(p_type,'individual'),
    booking_type=p_booking_type,people_count=p_people_count,price=p_price,payment_method=p_payment_method,
    event_type=p_event_type,note=p_note,color=p_color,recurrence=coalesce(p_recurrence,'none'),
    recurrence_until=p_recurrence_until,description=p_description,status=coalesce(p_status,'active'),room_name=p_room_name
  where id=p_id returning * into v_row;
  if v_row.id is null then raise exception 'Бронювання не знайдено'; end if;
  return v_row;
end $$;

revoke execute on function public.crm_validate_booking_block_input(text,text,date,date,time,time,boolean,smallint[],uuid[]) from public,anon,authenticated;
revoke execute on function public.crm_valid_iso_weekdays(smallint[]) from public,anon,authenticated;
revoke execute on function public.crm_enforce_schedule_booking_blocks() from public,anon,authenticated;
revoke execute on function public.crm_schedule_booking_occurs_on(date,date,text) from public,anon,authenticated;
revoke execute on function public.crm_schedule_booking_recurrence_hits_block(date,date,text,date,date,smallint[]) from public,anon,authenticated;
revoke execute on function public.crm_schedule_booking_step_date(date,text,integer) from public,anon,authenticated;
revoke execute on function public.crm_schedule_booking_update_only_shrinks(date,date,date,date,text) from public,anon,authenticated;
revoke execute on function public.crm_canonical_room_name(text) from public,anon,authenticated;
revoke execute on function public.crm_occurrence_removal_signature(date,text,text,text,text,date,text,text) from public,anon,authenticated;
revoke execute on function public.crm_remove_room_booking_occurrence(uuid,date) from public,anon;
revoke execute on function public.crm_admin_override_create_room_booking(date,text,text,text,text,text,text,text,integer,integer,text,text,text,text,text,date,text,text,text) from public,anon;
revoke execute on function public.crm_admin_override_update_room_booking(uuid,date,text,text,text,text,text,text,text,integer,integer,text,text,text,text,text,date,text,text,text) from public,anon;
revoke execute on function public.crm_fetch_schedule_booking_blocks() from public,anon;
revoke execute on function public.crm_admin_create_schedule_booking_block(text,text,date,date,time,time,boolean,smallint[],uuid[],boolean) from public,anon;
revoke execute on function public.crm_admin_update_schedule_booking_block(uuid,text,text,date,date,time,time,boolean,smallint[],uuid[],boolean) from public,anon;
revoke execute on function public.crm_admin_delete_schedule_booking_block(uuid) from public,anon;
grant execute on function public.crm_fetch_schedule_booking_blocks() to authenticated;
grant execute on function public.crm_remove_room_booking_occurrence(uuid,date) to authenticated;
grant execute on function public.crm_admin_create_schedule_booking_block(text,text,date,date,time,time,boolean,smallint[],uuid[],boolean), public.crm_admin_update_schedule_booking_block(uuid,text,text,date,date,time,time,boolean,smallint[],uuid[],boolean), public.crm_admin_delete_schedule_booking_block(uuid) to authenticated;
grant execute on function public.crm_admin_override_create_room_booking(date,text,text,text,text,text,text,text,integer,integer,text,text,text,text,text,date,text,text,text), public.crm_admin_override_update_room_booking(uuid,date,text,text,text,text,text,text,text,integer,integer,text,text,text,text,text,date,text,text,text) to authenticated;

commit;
