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
