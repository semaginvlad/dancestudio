-- Permanently delete an archived trainer only when no business/history rows refer
-- to them. Unknown conventional columns and every real FK are fail-closed.
create or replace function public.delete_archived_trainer(p_trainer_id text)
returns table(deleted_id text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

  -- archived_at is the canonical archive marker. is_active alone is deliberately
  -- insufficient, so a disabled active row cannot be deleted by a direct call.
  if v_trainer.archived_at is null then
    raise exception 'Активного тренера не можна видалити. Спочатку перемістіть його в архів.' using errcode = '55000';
  end if;

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

  -- The sole allowlisted cleanup is the disposable access mapping. No groups,
  -- finance, lessons, bookings, messages, or history are modified.
  if to_regclass('public.trainer_groups') is not null then
    delete from public.trainer_groups where trainer_id::text = p_trainer_id::text;
  end if;

  delete from public.trainers where id::text = p_trainer_id::text;
  deleted_id := p_trainer_id;
  return next;
end;
$$;

revoke all on function public.delete_archived_trainer(text) from public, anon;
grant execute on function public.delete_archived_trainer(text) to authenticated;
