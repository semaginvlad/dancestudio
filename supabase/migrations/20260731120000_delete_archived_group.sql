-- Permanently delete only an archived, dependency-free group. The function is
-- SECURITY DEFINER so the whole check/cleanup/delete is one transaction, but it
-- performs an explicit admin check before touching data.
create or replace function public.delete_archived_group(p_group_id text)
returns table(deleted_id text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_group public.groups%rowtype;
  v_dependency record;
  v_count bigint;
  v_reasons text[] := array[]::text[];
  v_label text;
begin
  if not public.rls_is_admin() then
    raise exception 'Лише адміністратор може остаточно видаляти групи.' using errcode = '42501';
  end if;

  select * into v_group
  from public.groups
  where id::text = p_group_id::text
  for update;

  if not found then
    raise exception 'Групу не знайдено.' using errcode = 'P0002';
  end if;

  if v_group.archived_at is null then
    raise exception 'Активну групу не можна видалити. Спочатку перемістіть її в архів.' using errcode = '55000';
  end if;

  -- Audit both conventional group columns (including legacy "groupId") and
  -- every actual FK to groups(id). Anything not explicitly classified as
  -- disposable technical metadata blocks deletion, even when its FK says
  -- CASCADE: historical data must never disappear implicitly.
  for v_dependency in
    with candidate_columns as (
      select c.table_name, c.column_name
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name <> 'groups'
        and lower(c.column_name) in ('group_id', 'groupid', 'source_group_id', 'target_group_id')
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
        and parent.relname = 'groups'
    )
    select distinct table_name, column_name
    from candidate_columns
    where table_name not in (
      'trainer_groups',
      'group_lesson_overrides',
      'cancelled_trainings',
      'group_merge_operations'
    )
    order by table_name, column_name
  loop
    execute format('select count(*) from public.%I where %I::text = $1', v_dependency.table_name, v_dependency.column_name)
      into v_count using p_group_id;

    if v_count > 0 then
      v_label := case v_dependency.table_name
        when 'attendance' then 'відвідувань'
        when 'subscriptions' then 'абонементів / оплат'
        when 'trial_bookings' then 'пробних записів'
        when 'waitlist' then 'записів резерву'
        when 'student_groups' then 'прив’язок учениць'
        when 'training_lesson_plans' then 'планів тренувань'
        when 'training_lesson_reports' then 'звітів тренувань'
        when 'attendance_change_log' then 'записів історії відвідувань'
        when 'subscription_change_log' then 'записів історії абонементів'
        when 'trainer_dispatch_history' then 'записів історії повідомлень'
        when 'notification_schedule_rules' then 'правил повідомлень'
        when 'trainer_notification_state' then 'налаштувань повідомлень'
        else format('записів у %I', v_dependency.table_name)
      end;
      v_reasons := array_append(v_reasons, format('%s — %s', v_label, v_count));
    end if;
  end loop;

  if cardinality(v_reasons) > 0 then
    raise exception 'Групу не можна видалити, бо до неї прив’язані:%', E'\n• ' || array_to_string(v_reasons, E'\n• ')
      using errcode = '23503';
  end if;

  -- Only disposable group-specific metadata is removed automatically.
  if to_regclass('public.trainer_groups') is not null then
    delete from public.trainer_groups where group_id::text = p_group_id::text;
  end if;
  if to_regclass('public.group_lesson_overrides') is not null then
    delete from public.group_lesson_overrides where group_id::text = p_group_id::text;
  end if;
  if to_regclass('public.cancelled_trainings') is not null then
    delete from public.cancelled_trainings where group_id::text = p_group_id::text;
  end if;
  if to_regclass('public.group_merge_operations') is not null then
    delete from public.group_merge_operations
    where source_group_id::text = p_group_id::text
       or target_group_id::text = p_group_id::text;
  end if;

  delete from public.groups where id::text = p_group_id::text;
  deleted_id := p_group_id;
  return next;
end;
$$;

revoke all on function public.delete_archived_group(text) from public, anon;
grant execute on function public.delete_archived_group(text) to authenticated;
