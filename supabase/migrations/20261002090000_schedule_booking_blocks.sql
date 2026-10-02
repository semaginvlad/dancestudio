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

create or replace function public.crm_canonical_room_name(p_name text)
returns text language sql immutable set search_path=public as $$
  select lower(btrim(regexp_replace(coalesce(p_name,''),'[[:space:]]+',' ','g')))
$$;

create or replace function public.crm_enforce_schedule_booking_blocks()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_title text;
begin
  if public.crm_is_admin_session() or coalesce(new.status,'active')='cancelled' then return new; end if;
  select b.title into v_title
  from public.schedule_booking_blocks b
  where b.is_active
    and public.crm_schedule_booking_recurrence_hits_block(new.date,new.recurrence_until,new.recurrence,b.starts_on,b.ends_on,b.weekdays)
    and new.start_time::time < b.end_time and b.start_time < new.end_time::time
    and (b.all_rooms or exists(select 1 from public.schedule_booking_block_rooms br join public.studio_rooms r on r.id=br.room_id where br.block_id=b.id and public.crm_canonical_room_name(r.name)=public.crm_canonical_room_name(new.room_name)))
  limit 1;
  if v_title is not null then raise exception 'Цей час закритий адміністратором: %',v_title using errcode='P0001'; end if;
  return new;
end $$;

drop trigger if exists trg_enforce_schedule_booking_blocks on public.room_bookings;
create trigger trg_enforce_schedule_booking_blocks before insert or update of date,start_time,end_time,room_name,status,recurrence,recurrence_until on public.room_bookings for each row execute function public.crm_enforce_schedule_booking_blocks();

revoke execute on function public.crm_validate_booking_block_input(text,text,date,date,time,time,boolean,smallint[],uuid[]) from public,anon,authenticated;
revoke execute on function public.crm_valid_iso_weekdays(smallint[]) from public,anon,authenticated;
revoke execute on function public.crm_enforce_schedule_booking_blocks() from public,anon,authenticated;
revoke execute on function public.crm_schedule_booking_occurs_on(date,date,text) from public,anon,authenticated;
revoke execute on function public.crm_schedule_booking_recurrence_hits_block(date,date,text,date,date,smallint[]) from public,anon,authenticated;
revoke execute on function public.crm_canonical_room_name(text) from public,anon,authenticated;
revoke execute on function public.crm_fetch_schedule_booking_blocks() from public,anon;
revoke execute on function public.crm_admin_create_schedule_booking_block(text,text,date,date,time,time,boolean,smallint[],uuid[],boolean) from public,anon;
revoke execute on function public.crm_admin_update_schedule_booking_block(uuid,text,text,date,date,time,time,boolean,smallint[],uuid[],boolean) from public,anon;
revoke execute on function public.crm_admin_delete_schedule_booking_block(uuid) from public,anon;
grant execute on function public.crm_fetch_schedule_booking_blocks() to authenticated;
grant execute on function public.crm_admin_create_schedule_booking_block(text,text,date,date,time,time,boolean,smallint[],uuid[],boolean), public.crm_admin_update_schedule_booking_block(uuid,text,text,date,date,time,time,boolean,smallint[],uuid[],boolean), public.crm_admin_delete_schedule_booking_block(uuid) to authenticated;

commit;
