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

-- Room exceptions are disposable access settings, not trainer history. Clear
-- them before the fail-closed dependency scan in the canonical delete RPC.
create or replace function public.delete_archived_trainer(p_trainer_id text)
returns table(deleted_id text)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_trainer public.trainers%rowtype;
  v_dependency record;
  v_count bigint;
  v_reasons text[] := array[]::text[];
  v_label text;
begin
  if not public.rls_is_admin() then
    raise exception 'Лише адміністратор може остаточно видаляти тренерів.' using errcode = '42501';
  end if;

  select * into v_trainer
  from public.trainers
  where id::text = p_trainer_id::text
  for update;

  if not found then
    raise exception 'Тренера не знайдено.' using errcode = 'P0002';
  end if;

  if v_trainer.archived_at is null then
    raise exception 'Активного тренера не можна видалити. Спочатку перемістіть його в архів.' using errcode = '55000';
  end if;

  delete from public.studio_room_booking_trainer_exceptions
  where trainer_id::text = p_trainer_id::text;

  for v_dependency in
    with candidate_columns as (
      select c.table_name, c.column_name
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name <> 'trainers'
        and lower(c.column_name) in (
          'trainer_id', 'trainerid', 'trainer_tg_id', 'source_trainer_id',
          'target_trainer_id', 'actor_trainer_id'
        )
      union
      select child.relname, child_col.attname
      from pg_constraint fk
      join pg_class child on child.oid = fk.conrelid
      join pg_namespace child_ns on child_ns.oid = child.relnamespace
      join pg_class parent on parent.oid = fk.confrelid
      join pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
      join lateral unnest(fk.conkey) with ordinality child_key(attnum, ord) on true
      join pg_attribute child_col on child_col.attrelid = child.oid and child_col.attnum = child_key.attnum
      where fk.contype = 'f'
        and child_ns.nspname = 'public'
        and parent_ns.nspname = 'public'
        and parent.relname = 'trainers'
    )
    select distinct table_name, column_name
    from candidate_columns
    where table_name <> 'trainer_groups'
    order by table_name, column_name
  loop
    execute format('select count(*) from public.%I where %I::text = $1', v_dependency.table_name, v_dependency.column_name)
      into v_count using p_trainer_id;

    if v_count > 0 then
      v_label := case v_dependency.table_name
        when 'groups' then 'груп'
        when 'attendance' then 'відвідувань'
        when 'subscriptions' then 'абонементів'
        when 'payments' then 'платежів'
        when 'training_lesson_plans' then 'планів тренувань'
        when 'training_lesson_reports' then 'звітів тренувань'
        when 'room_bookings' then 'бронювань залів'
        when 'group_lesson_overrides' then 'замін у заняттях'
        when 'trial_bookings' then 'пробних записів'
        when 'trainer_dispatch_history' then 'записів історії повідомлень'
        when 'attendance_change_log' then 'записів історії відвідувань'
        when 'subscription_change_log' then 'записів історії абонементів'
        when 'payroll' then 'нарахувань зарплати'
        when 'trainer_payroll' then 'нарахувань зарплати'
        when 'payouts' then 'виплат'
        when 'trainer_payouts' then 'виплат'
        when 'trainer_percentages' then 'налаштувань відсотків'
        when 'trainer_merge_history' then 'записів історії об’єднань'
        when 'trainer_merge_operations' then 'операцій об’єднання'
        when 'audit_logs' then 'записів аудиту'
        when 'mod_log' then 'записів історії змін'
        else format('записів у %I', v_dependency.table_name)
      end;
      v_reasons := array_append(v_reasons, format('%s — %s', v_label, v_count));
    end if;
  end loop;

  if cardinality(v_reasons) > 0 then
    raise exception 'Тренера не можна видалити, бо до нього прив’язані:%', E'\n• ' || array_to_string(v_reasons, E'\n• ')
      using errcode = '23503';
  end if;

  if to_regclass('public.trainer_groups') is not null then
    delete from public.trainer_groups where trainer_id::text = p_trainer_id::text;
  end if;

  delete from public.trainers where id::text = p_trainer_id::text;
  deleted_id := p_trainer_id;
  return next;
end;
$function$;

revoke all on function public.delete_archived_trainer(text) from public, anon;
grant execute on function public.delete_archived_trainer(text) to authenticated;

commit;
