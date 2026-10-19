begin;

create table public.studio_room_booking_trainer_exceptions (
  room_id uuid not null references public.studio_rooms(id) on delete cascade,
  trainer_id uuid not null references public.trainers(id) on delete cascade,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (room_id, trainer_id)
);

alter table public.studio_room_booking_trainer_exceptions enable row level security;
revoke all on public.studio_room_booking_trainer_exceptions from public, anon, authenticated;

create or replace function public.crm_fetch_studio_rooms(p_include_inactive boolean default false)
returns table (
  id uuid, name text, is_active boolean, booking_open boolean, sort_order integer,
  created_at timestamptz, allowed_trainer_ids uuid[]
)
language sql stable security definer set search_path = public
as $function$
  select r.id, r.name, r.is_active, r.booking_open, r.sort_order, r.created_at,
    coalesce((select array_agg(e.trainer_id order by e.trainer_id)
      from public.studio_room_booking_trainer_exceptions e where e.room_id = r.id), '{}')
  from public.studio_rooms r
  where (public.crm_is_admin_session() or public.crm_is_active_trainer_session())
    and (r.is_active or (coalesce(p_include_inactive, false) and public.crm_is_admin_session()))
  order by r.sort_order, r.created_at, r.name;
$function$;

revoke execute on function public.crm_fetch_studio_rooms(boolean) from public, anon;
grant execute on function public.crm_fetch_studio_rooms(boolean) to authenticated;

create or replace function public.crm_admin_set_studio_room_booking_trainers(p_room_id uuid, p_trainer_ids uuid[] default '{}')
returns uuid[] language plpgsql security definer set search_path = public
as $function$
declare v_ids uuid[] := coalesce(p_trainer_ids, '{}');
begin
  if not public.crm_is_admin_session() then
    raise exception 'Лише адміністратор може змінювати винятки залу' using errcode = '42501';
  end if;
  if not exists(select 1 from public.studio_rooms where id = p_room_id) then raise exception 'Залу не знайдено'; end if;
  if cardinality(v_ids) <> (select count(distinct id) from unnest(v_ids) selected(id)) then raise exception 'Тренери не мають дублюватися'; end if;
  if exists(select 1 from unnest(v_ids) selected(id) left join public.trainers t on t.id=selected.id where t.id is null) then raise exception 'Невідомий тренер'; end if;
  delete from public.studio_room_booking_trainer_exceptions where room_id = p_room_id;
  insert into public.studio_room_booking_trainer_exceptions(room_id, trainer_id, created_by)
    select p_room_id, id, auth.uid() from unnest(v_ids) selected(id);
  return v_ids;
end;
$function$;

revoke execute on function public.crm_admin_set_studio_room_booking_trainers(uuid,uuid[]) from public, anon;
grant execute on function public.crm_admin_set_studio_room_booking_trainers(uuid,uuid[]) to authenticated;

create or replace function public.crm_enforce_studio_room_booking_open()
returns trigger language plpgsql security definer set search_path = public
as $function$
begin
  if coalesce(new.status, 'active') = 'cancelled' then return new; end if;
  if tg_op = 'UPDATE' and new.start_time is not distinct from old.start_time and new.end_time is not distinct from old.end_time
     and public.crm_canonical_room_name(new.room_name)=public.crm_canonical_room_name(old.room_name)
     and new.status is not distinct from old.status and new.recurrence is not distinct from old.recurrence
     and public.crm_schedule_booking_update_only_shrinks(old.date,old.recurrence_until,new.date,new.recurrence_until,new.recurrence)
  then return new; end if;
  if tg_op='INSERT' and current_setting('crm.occurrence_removal_continuation',true)='on'
     and public.crm_occurrence_removal_signature(new.date,new.start_time,new.end_time,new.room_name,new.recurrence,new.recurrence_until,new.status,new.trainer_id::text)=current_setting('crm.occurrence_removal_signature',true)
  then return new; end if;
  if tg_op='UPDATE' and coalesce(current_setting('crm.room_rename_old_name',true),'')<>''
     and coalesce(current_setting('crm.room_rename_new_name',true),'')<>''
     and public.crm_canonical_room_name(old.room_name)=current_setting('crm.room_rename_old_name',true)
     and public.crm_canonical_room_name(new.room_name)=current_setting('crm.room_rename_new_name',true)
  then return new; end if;
  if public.crm_is_admin_session() then return new; end if;
  if exists(select 1 from public.studio_rooms r where r.is_active and not r.booking_open
      and public.crm_canonical_room_name(r.name)=public.crm_canonical_room_name(new.room_name)) then
    if exists(
      select 1 from public.studio_rooms r
      join public.studio_room_booking_trainer_exceptions e on e.room_id=r.id
      join public.trainers t on t.id=e.trainer_id
      where public.crm_canonical_room_name(r.name)=public.crm_canonical_room_name(new.room_name)
        and t.auth_user_id=auth.uid() and t.is_active is true and t.archived_at is null and t.access_disabled_at is null
        and new.trainer_id::text in (auth.uid()::text, t.id::text)
    ) then return new; end if;
    raise exception 'Цей зал тимчасово недоступний для бронювання. Оберіть інший зал.' using errcode='P0001';
  end if;
  return new;
end;
$function$;

commit;
