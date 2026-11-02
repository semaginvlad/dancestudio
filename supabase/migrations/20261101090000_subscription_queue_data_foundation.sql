-- Data-only foundation for subscription queues.
--
-- Legacy subscriptions intentionally keep both columns NULL. In particular,
-- created_at, UUID order and physical row order are not used to infer either
-- payment dates or queue links.

alter table public.subscriptions
  add column if not exists paid_at date,
  add column if not exists previous_subscription_id uuid;

-- PostgreSQL needs a matching unique key for the composite foreign key below.
-- Keeping student_id and group_id in that key makes the same-student,
-- same-group rule a database invariant (including direct API writes).
create unique index if not exists subscriptions_queue_identity_key
  on public.subscriptions (id, student_id, group_id);

alter table public.subscriptions
  drop constraint if exists subscriptions_previous_not_self;

alter table public.subscriptions
  add constraint subscriptions_previous_not_self
  check (
    previous_subscription_id is null
    or (
      previous_subscription_id <> id
      and student_id is not null
      and group_id is not null
    )
  );

alter table public.subscriptions
  drop constraint if exists subscriptions_previous_same_student_group_fk;

alter table public.subscriptions
  add constraint subscriptions_previous_same_student_group_fk
  foreign key (previous_subscription_id, student_id, group_id)
  references public.subscriptions (id, student_id, group_id)
  on update no action
  on delete restrict
  deferrable initially immediate;

-- A queue is a chain: one subscription cannot have two direct successors.
create unique index if not exists subscriptions_one_successor_per_previous_key
  on public.subscriptions (previous_subscription_id)
  where previous_subscription_id is not null;

comment on column public.subscriptions.paid_at is
  'Canonical business payment date. NULL means unknown for a legacy/unpaid record; never infer from created_at.';

comment on column public.subscriptions.previous_subscription_id is
  'Explicit previous subscription in the same student+group queue. NULL means no declared predecessor.';

create or replace function public.subscriptions_reject_previous_cycle()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_cycle_found boolean;
begin
  if new.previous_subscription_id is null then
    return new;
  end if;

  -- Serialize edits to one student+group queue before walking it. The trigger
  -- covers both INSERT and UPDATE and does not depend on UUID/row ordering.
  perform pg_advisory_xact_lock(
    hashtextextended(new.student_id::text || ':' || new.group_id::text, 0)
  );

  with recursive predecessors(id, previous_subscription_id, path) as (
    select s.id, s.previous_subscription_id, array[s.id]
    from public.subscriptions s
    where s.id = new.previous_subscription_id

    union all

    select s.id, s.previous_subscription_id, p.path || s.id
    from predecessors p
    join public.subscriptions s on s.id = p.previous_subscription_id
    where not s.id = any(p.path)
  )
  select exists (
    select 1
    from predecessors
    where id = new.id
  ) into v_cycle_found;

  if v_cycle_found then
    raise exception 'Subscription predecessor cycle is not allowed'
      using errcode = '23514';
  end if;

  return new;
end
$$;

drop trigger if exists subscriptions_reject_previous_cycle_trigger
  on public.subscriptions;

create trigger subscriptions_reject_previous_cycle_trigger
before insert or update of previous_subscription_id, student_id, group_id
on public.subscriptions
for each row
execute function public.subscriptions_reject_previous_cycle();

-- Move memberships and their explicitly selected subscriptions as one
-- transaction. Queue links wholly inside the moved set are preserved; links
-- crossing the source/target boundary are explicitly detached. No ordering is
-- inferred for independent legacy chains in the target group.
create or replace function public.crm_move_group_memberships_and_subscriptions(
  p_source_group_id text,
  p_target_group_id text,
  p_add_target_student_ids uuid[],
  p_remove_source_student_ids uuid[],
  p_subscription_ids uuid[] default '{}'::uuid[],
  p_restore_previous_subscription_ids jsonb default '{}'::jsonb
)
returns table (
  moved_subscription_id uuid,
  moved_student_id uuid,
  moved_group_id text,
  moved_previous_subscription_id uuid
)
language plpgsql
set search_path = public
as $$
declare
  v_invalid_subscription_id uuid;
begin
  if p_source_group_id is null
     or p_target_group_id is null
     or p_source_group_id = p_target_group_id then
    raise exception 'Source and target groups must be different and non-null'
      using errcode = '22023';
  end if;

  p_add_target_student_ids := coalesce(p_add_target_student_ids, '{}'::uuid[]);
  p_remove_source_student_ids := coalesce(p_remove_source_student_ids, '{}'::uuid[]);
  p_subscription_ids := coalesce(p_subscription_ids, '{}'::uuid[]);
  p_restore_previous_subscription_ids := coalesce(p_restore_previous_subscription_ids, '{}'::jsonb);

  -- Lock every affected student's source/target subscriptions before any
  -- membership write, then reject the complete request if one id is stale or
  -- belongs to a different student/group.
  perform 1
  from public.subscriptions s
  where s.student_id = any(
    p_add_target_student_ids || p_remove_source_student_ids
  )
    and s.group_id in (p_source_group_id, p_target_group_id)
  for update;

  select requested.id
  into v_invalid_subscription_id
  from unnest(p_subscription_ids) as requested(id)
  left join public.subscriptions s on s.id = requested.id
  where s.id is null
     or s.group_id <> p_source_group_id
     or not (s.student_id = any(p_add_target_student_ids))
  limit 1;

  if v_invalid_subscription_id is not null then
    raise exception 'Subscription % cannot be moved by this group transfer', v_invalid_subscription_id
      using errcode = '23514';
  end if;

  set constraints subscriptions_previous_same_student_group_fk deferred;

  -- Detach both sides of queue links that cross the move boundary.
  update public.subscriptions s
  set previous_subscription_id = null
  where s.id = any(p_subscription_ids)
    and s.previous_subscription_id is not null
    and not (s.previous_subscription_id = any(p_subscription_ids));

  update public.subscriptions s
  set previous_subscription_id = null
  where s.previous_subscription_id = any(p_subscription_ids)
    and not (s.id = any(p_subscription_ids));

  update public.subscriptions s
  set group_id = p_target_group_id
  where s.id = any(p_subscription_ids);

  -- Undo may provide the exact pre-transfer queue boundary snapshot. Clear the
  -- affected links first to avoid transient unique-successor conflicts, then
  -- restore them inside this same transaction.
  update public.subscriptions s
  set previous_subscription_id = null
  where s.id in (
    select queue_snapshot.id::uuid
    from jsonb_object_keys(p_restore_previous_subscription_ids) as queue_snapshot(id)
  )
    and s.student_id = any(p_add_target_student_ids)
    and s.group_id in (p_source_group_id, p_target_group_id);

  update public.subscriptions s
  set previous_subscription_id = case
    when queue_snapshot.previous_id = 'null'::jsonb then null
    else (queue_snapshot.previous_id #>> '{}')::uuid
  end
  from jsonb_each(p_restore_previous_subscription_ids) as queue_snapshot(id, previous_id)
  where s.id = queue_snapshot.id::uuid
    and s.student_id = any(p_add_target_student_ids)
    and s.group_id in (p_source_group_id, p_target_group_id);

  insert into public.student_groups (student_id, group_id)
  select distinct requested_student_id, p_target_group_id
  from unnest(p_add_target_student_ids) as requested_students(requested_student_id)
  on conflict (student_id, group_id) do nothing;

  delete from public.student_groups sg
  where sg.group_id = p_source_group_id
    and sg.student_id = any(p_remove_source_student_ids);

  return query
  select s.id, s.student_id, s.group_id, s.previous_subscription_id
  from public.subscriptions s
  where s.id = any(p_subscription_ids);
end
$$;

revoke execute on function public.crm_move_group_memberships_and_subscriptions(
  text, text, uuid[], uuid[], uuid[], jsonb
) from public, anon;
grant execute on function public.crm_move_group_memberships_and_subscriptions(
  text, text, uuid[], uuid[], uuid[], jsonb
) to authenticated;

alter table public.group_merge_operations
  add column if not exists previous_subscription_predecessor_ids jsonb not null default '{}'::jsonb;

create or replace function public.crm_undo_group_merge(
  p_operation_id text,
  p_undone_by text default null
)
returns setof public.group_merge_operations
language plpgsql
set search_path = public
as $$
declare
  v_operation public.group_merge_operations%rowtype;
  v_selected_student_ids uuid[];
  v_new_target_student_ids uuid[];
  v_moved_subscription_ids uuid[];
  v_archive_mode text;
  v_group_rows integer := 0;
begin
  select *
  into v_operation
  from public.group_merge_operations
  where id = p_operation_id
  for update;

  if not found then
    raise exception 'Group merge operation % was not found', p_operation_id
      using errcode = 'P0002';
  end if;

  -- Retrying after a lost response/refresh is safe and does not move the same
  -- subscriptions a second time.
  if v_operation.status = 'undone' and v_operation.undone_at is not null then
    return next v_operation;
    return;
  end if;

  if v_operation.status <> 'completed' or v_operation.undone_at is not null then
    raise exception 'Group merge operation % is not undoable from status %', p_operation_id, v_operation.status
      using errcode = '23514';
  end if;

  select coalesce(array_agg(value::uuid), '{}'::uuid[])
  into v_selected_student_ids
  from jsonb_array_elements_text(v_operation.selected_student_ids);

  select coalesce(array_agg(value::uuid), '{}'::uuid[])
  into v_new_target_student_ids
  from jsonb_array_elements_text(v_operation.new_target_links_student_ids);

  select coalesce(array_agg(value::uuid), '{}'::uuid[])
  into v_moved_subscription_ids
  from jsonb_array_elements_text(v_operation.moved_subscription_ids);

  perform *
  from public.crm_move_group_memberships_and_subscriptions(
    v_operation.target_group_id,
    v_operation.source_group_id,
    v_selected_student_ids,
    v_new_target_student_ids,
    v_moved_subscription_ids,
    coalesce(v_operation.previous_subscription_predecessor_ids, '{}'::jsonb)
  );

  if v_operation.schedule_mode <> 'keep_target_schedule' then
    update public.groups
    set schedule = v_operation.previous_target_schedule
    where id = v_operation.target_group_id;

    if not found then
      raise exception 'Target group % was not found while undoing merge', v_operation.target_group_id
        using errcode = 'P0002';
    end if;
  end if;

  v_archive_mode := v_operation.previous_source_archive_state ->> 'mode';
  if v_archive_mode = 'is_active' then
    update public.groups
    set is_active = not v_operation.source_was_archived_before
    where id = v_operation.source_group_id;
    get diagnostics v_group_rows = row_count;
  elsif v_archive_mode = 'archived_at' then
    update public.groups
    set archived_at = case when v_operation.source_was_archived_before then current_date::timestamptz else null end
    where id = v_operation.source_group_id;
    get diagnostics v_group_rows = row_count;
  elsif v_archive_mode = 'active' then
    execute 'update public.groups set active = $1 where id = $2'
      using not v_operation.source_was_archived_before, v_operation.source_group_id;
    get diagnostics v_group_rows = row_count;
  end if;

  if v_archive_mode is not null and v_group_rows = 0 then
    raise exception 'Source group % was not found while undoing merge', v_operation.source_group_id
      using errcode = 'P0002';
  end if;

  update public.group_merge_operations
  set status = 'undone',
      undone_at = now(),
      undone_by = p_undone_by
  where id = v_operation.id
  returning * into v_operation;

  return next v_operation;
end
$$;

revoke execute on function public.crm_undo_group_merge(text, text) from public, anon;
grant execute on function public.crm_undo_group_merge(text, text) to authenticated;
