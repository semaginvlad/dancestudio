-- Read-only decision for a prospective attended lesson. The caller must serialize
-- the eventual attendance/activation write and re-resolve in that transaction.
-- Existing usage is a current snapshot, not an attendance history: do not use
-- this to reconstruct past decisions after usage or dates have been changed.
create or replace function public.crm_resolve_subscription_for_attendance(
  p_student_id uuid, p_group_id text, p_attendance_date date
)
returns table (result text, subscription_id uuid, activation_date date)
language plpgsql stable security invoker
set search_path = public
as $$
declare
  root record;
  current_sub public.subscriptions%rowtype;
  next_sub public.subscriptions%rowtype;
  chosen_id uuid;
  chosen_activation date;
  candidate_id uuid;
  candidate_activation date;
  effective_activation date;
  visited uuid[] := '{}'::uuid[];
  visited_count integer := 0;
  total_count integer;
  successor_count integer;
  available boolean;
begin
  if p_student_id is null or p_group_id is null or p_attendance_date is null then
    raise exception 'student, group and attendance date are required' using errcode = '22023';
  end if;

  select count(*) into total_count from public.subscriptions s
    where s.student_id = p_student_id and s.group_id = p_group_id;

  -- Broken cross-scope or missing links must never silently become roots.
  if exists (
    select 1 from public.subscriptions s
    left join public.subscriptions p on p.id = s.previous_subscription_id
      and p.student_id = s.student_id and p.group_id = s.group_id
    where s.student_id = p_student_id and s.group_id = p_group_id
      and s.previous_subscription_id is not null
      and (p.id is null or s.paid_at is null
        or (p.paid_at is not null and s.paid_at < p.paid_at)
        or (s.activation_date is not null and s.activation_date < s.paid_at))
  ) then
    return query select 'ambiguity'::text, null::uuid, null::date; return;
  end if;

  for root in select s.id from public.subscriptions s
    where s.student_id = p_student_id and s.group_id = p_group_id
      and s.previous_subscription_id is null
  loop
    select s.* into current_sub from public.subscriptions s where s.id = root.id;
    candidate_id := null;
    candidate_activation := null;
    effective_activation := current_sub.activation_date;
    loop
      if current_sub.id = any(visited) then
        return query select 'ambiguity'::text, null::uuid, null::date; return;
      end if;
      visited := array_append(visited, current_sub.id);
      visited_count := visited_count + 1;
      select count(*) into successor_count from public.subscriptions s
        where s.student_id = p_student_id and s.group_id = p_group_id
          and s.previous_subscription_id = current_sub.id;
      if successor_count > 1 then
        return query select 'ambiguity'::text, null::uuid, null::date; return;
      end if;
      select s.* into next_sub from public.subscriptions s
        where s.student_id = p_student_id and s.group_id = p_group_id
          and s.previous_subscription_id = current_sub.id;
      available := coalesce(current_sub.used_trainings, 0) < coalesce(current_sub.total_trainings, 0)
        and coalesce(effective_activation, current_sub.start_date, '-infinity'::date) <= p_attendance_date
        and coalesce(current_sub.end_date, 'infinity'::date) >= p_attendance_date;

      if candidate_id is null and available then
        candidate_id := current_sub.id;
        candidate_activation := effective_activation;
      end if;
      if successor_count = 0 then exit; end if;

      -- Once the successor's deadline (or stored activation) is reached it
      -- supersedes its predecessor even when that predecessor has units left.
      if next_sub.paid_at <= p_attendance_date then
        if least(coalesce(next_sub.activation_date, next_sub.paid_at + 14), next_sub.paid_at + 14) <= p_attendance_date then
          effective_activation := least(coalesce(next_sub.activation_date, next_sub.paid_at + 14), next_sub.paid_at + 14);
          candidate_id := null;
          candidate_activation := null;
        elsif candidate_id is null and effective_activation <> 'infinity'::date
          and (coalesce(current_sub.used_trainings, 0) >= coalesce(current_sub.total_trainings, 0)
            or (current_sub.end_date is not null and current_sub.end_date < p_attendance_date)) then
          effective_activation := p_attendance_date;
        else
          -- Still queued: continue traversal only to validate the whole chain.
          effective_activation := 'infinity'::date;
        end if;
      else
        effective_activation := 'infinity'::date;
      end if;
      current_sub := next_sub;
    end loop;
    if candidate_id is not null then
      if chosen_id is not null then
        return query select 'ambiguity'::text, null::uuid, null::date; return;
      end if;
      chosen_id := candidate_id;
      chosen_activation := candidate_activation;
    end if;
  end loop;
  -- An unvisited component is a cycle (or otherwise disconnected from a root).
  if visited_count <> total_count then
    return query select 'ambiguity'::text, null::uuid, null::date; return;
  end if;
  if chosen_id is null then
    return query select 'debt'::text, null::uuid, null::date;
  else
    return query select 'subscription'::text, chosen_id, chosen_activation;
  end if;
end;
$$;

-- This foundational RPC is intentionally not exposed to application roles.
revoke execute on function public.crm_resolve_subscription_for_attendance(uuid, text, date) from public, anon, authenticated;
grant execute on function public.crm_resolve_subscription_for_attendance(uuid, text, date) to service_role;

-- Call only for a confirmed attended lesson, in the same transaction as the
-- future attendance write. This deliberately touches at most one queued row.
-- Callers must serialize all writes for this student/group, including inserts;
-- row locks here alone cannot prevent phantoms from concurrent subscriptions.
create or replace function public.crm_record_subscription_queue_activation(
  p_student_id uuid, p_group_id text, p_attendance_date date
)
returns table (result text, subscription_id uuid, activation_date date)
language plpgsql volatile security invoker
set search_path = public
as $$
declare
  decision record;
begin
  perform 1 from public.subscriptions s
    where s.student_id = p_student_id and s.group_id = p_group_id
    for update;
  select * into decision from public.crm_resolve_subscription_for_attendance(
    p_student_id, p_group_id, p_attendance_date
  );
  if decision.result = 'subscription' and decision.activation_date is not null then
    update public.subscriptions s set activation_date = decision.activation_date
      where s.id = decision.subscription_id and s.student_id = p_student_id
        and s.group_id = p_group_id and s.previous_subscription_id is not null
        and s.paid_at is not null and s.activation_date is null;
  end if;
  return query select decision.result::text, decision.subscription_id::uuid, decision.activation_date::date;
end;
$$;
revoke execute on function public.crm_record_subscription_queue_activation(uuid, text, date) from public, anon, authenticated;
grant execute on function public.crm_record_subscription_queue_activation(uuid, text, date) to service_role;
