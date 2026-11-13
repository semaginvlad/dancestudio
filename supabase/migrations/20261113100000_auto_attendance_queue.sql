-- New queue marks carry an ordering token. Existing rows remain NULL; no history is changed.
create sequence public.crm_auto_attendance_order_seq;
alter table public.attendance add column queue_auto_order bigint;

-- The security-definer RPCs below are the only trainer attendance write/read path.
alter table public.attendance enable row level security;
drop policy if exists attendance_trainer_insert_own_groups on public.attendance;
drop policy if exists attendance_trainer_update_own_groups on public.attendance;
drop policy if exists attendance_trainer_delete_own_groups on public.attendance;
drop policy if exists attendance_trainer_select_own_groups on public.attendance;
-- Restrictive policy also closes any other permissive legacy policies for trainers.
create policy attendance_direct_admin_only on public.attendance as restrictive
for all to authenticated using (public.crm_is_admin_session())
with check (public.crm_is_admin_session());

-- Serialize queue insertions, including new roots, against attendance decisions.
create or replace function public.subscriptions_reject_previous_cycle()
returns trigger language plpgsql set search_path = public as $$
declare v_cycle_found boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.student_id::text || ':' || new.group_id::text, 0));
  if new.previous_subscription_id is null then return new; end if;
  with recursive predecessors(id, previous_subscription_id, path) as (
    select s.id, s.previous_subscription_id, array[s.id] from public.subscriptions s where s.id = new.previous_subscription_id
    union all
    select s.id, s.previous_subscription_id, p.path || s.id from predecessors p
      join public.subscriptions s on s.id = p.previous_subscription_id where not s.id = any(p.path)
  ) select exists(select 1 from predecessors where id = new.id) into v_cycle_found;
  if v_cycle_found then raise exception 'Subscription predecessor cycle is not allowed' using errcode = '23514'; end if;
  return new;
end $$;

-- Replace the former projection: trainers must not receive subscription IDs.
drop function if exists public.crm_fetch_my_attendance();
create function public.crm_fetch_my_attendance()
returns table(id uuid, student_id uuid, date date, guest_name text, guest_type text,
  group_id text, quantity integer, entry_type text, queue_auto boolean)
language sql stable security definer set search_path = public as $$
  select a.id, a.student_id, a.date, a.guest_name, a.guest_type, a.group_id,
    a.quantity, a.entry_type, a.queue_auto_order is not null
  from public.attendance a
  where auth.uid() is not null and a.group_id is not null and public.rls_owns_group(a.group_id)
$$;
revoke all on function public.crm_fetch_my_attendance() from public, anon;
grant execute on function public.crm_fetch_my_attendance() to authenticated;

-- One unit per row allows the second lesson to use a different subscription.
-- p_quantity is a desired count, never a financial selection. The advisory lock
-- serializes all mutations for the student/group and makes retries idempotent.
create or replace function public.crm_set_auto_attendance(
  p_student_id uuid, p_group_id text, p_date date, p_quantity integer
) returns void language plpgsql security definer set search_path = public as $$
declare
  decision record;
  current_count integer;
  item public.attendance%rowtype;
  affected uuid[] := '{}'::uuid[];
  affected_id uuid;
begin
  if auth.uid() is null then raise exception 'Потрібна авторизація' using errcode = '28000'; end if;
  if p_student_id is null or p_group_id is null or p_date is null or p_quantity is null or p_quantity not between 0 and 2 then
    raise exception 'Некоректна учениця, група, дата або кількість' using errcode = '22023';
  end if;
  if not (public.crm_is_admin_session() or public.rls_can_record_attendance(p_student_id, p_group_id)) then
    raise exception 'Немає доступу до учениці в цій групі' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text || ':' || p_group_id, 0));
  -- Historical or financial rows are not reinterpreted or changed by this flow.
  if exists (select 1 from public.attendance a
    where a.student_id = p_student_id and a.group_id = p_group_id and a.date = p_date
      and (a.queue_auto_order is null or a.guest_name is not null or a.guest_type is not null
        or a.price_snapshot_uah is not null or a.entry_type not in ('subscription', 'debt')
        or a.entry_type is null or coalesce(a.quantity, 0) <> 1
        or (a.entry_type = 'debt' and a.sub_id is not null)
        or (a.entry_type = 'subscription' and a.sub_id is null)
        or exists (select 1 from public.financial_operations f where f.attendance_id = a.id))) then
    raise exception 'Історичну або фінансову відмітку може змінити лише адміністратор.' using errcode = 'P0001';
  end if;
  select count(*)::integer into current_count from public.attendance a
    where a.student_id = p_student_id and a.group_id = p_group_id and a.date = p_date;
  if current_count > 2 then raise exception 'Некоректна кількість Auto-відміток. Зверніться до адміністратора.'; end if;
  while current_count < p_quantity loop
    select * into decision from public.crm_record_subscription_queue_activation(p_student_id, p_group_id, p_date);
    if decision.result = 'ambiguity' then
      raise exception 'Черга абонементів неоднозначна або пошкоджена. Зверніться до адміністратора.' using errcode = 'P0001';
    end if;
    if decision.result not in ('subscription', 'debt') then raise exception 'Невідомий результат перевірки абонемента'; end if;
    insert into public.attendance (student_id, group_id, date, sub_id, entry_type, quantity, queue_auto_order)
      values (p_student_id, p_group_id, p_date, decision.subscription_id, decision.result, 1, nextval('public.crm_auto_attendance_order_seq'));
    if decision.subscription_id is not null then
      -- The next loop iteration must resolve against the freshly updated usage.
      update public.subscriptions s set used_trainings = (select coalesce(sum(coalesce(a.quantity, 1)), 0)::integer from public.attendance a where a.sub_id = s.id)
        where s.id = decision.subscription_id;
    end if;
    current_count := current_count + 1;
  end loop;
  while current_count > p_quantity loop
    select a.* into item from public.attendance a
      where a.student_id = p_student_id and a.group_id = p_group_id and a.date = p_date
      order by a.queue_auto_order desc limit 1 for update;
    delete from public.attendance where id = item.id;
    if item.sub_id is not null then affected := array_append(affected, item.sub_id); end if;
    current_count := current_count - 1;
  end loop;
  foreach affected_id in array affected loop
    update public.subscriptions s set used_trainings = (select coalesce(sum(coalesce(a.quantity, 1)), 0)::integer from public.attendance a where a.sub_id = s.id)
      where s.id = affected_id;
  end loop;
end $$;
revoke all on function public.crm_set_auto_attendance(uuid, text, date, integer) from public, anon;
grant execute on function public.crm_set_auto_attendance(uuid, text, date, integer) to authenticated;
