-- Serialize queue writes, including new roots, with Auto attendance decisions.
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

create or replace function public.crm_create_auto_attendance(p_student_id uuid, p_group_id text, p_date date)
returns public.attendance language plpgsql security definer set search_path = public as $$
declare decision record; result public.attendance%rowtype;
begin
  if auth.uid() is null then raise exception 'Потрібна авторизація' using errcode = '28000'; end if;
  if p_student_id is null or p_group_id is null or p_date is null then
    raise exception 'Учениця, група і дата обовʼязкові' using errcode = '22023';
  end if;
  if not (public.crm_is_admin_session() or public.rls_can_record_attendance(p_student_id, p_group_id)) then
    raise exception 'Немає доступу до учениці в цій групі' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text || ':' || p_group_id, 0));
  if exists (select 1 from public.attendance a where a.student_id = p_student_id and a.group_id = p_group_id and a.date = p_date) then
    raise exception 'Відмітка вже існує' using errcode = '23505';
  end if;
  select * into decision from public.crm_record_subscription_queue_activation(p_student_id, p_group_id, p_date);
  if decision.result = 'ambiguity' then
    raise exception 'Черга абонементів неоднозначна або пошкоджена. Зверніться до адміністратора.' using errcode = 'P0001';
  end if;
  if decision.result not in ('subscription', 'debt') then raise exception 'Невідомий результат перевірки абонемента'; end if;
  insert into public.attendance (student_id, group_id, date, sub_id, entry_type, quantity)
    values (p_student_id, p_group_id, p_date, decision.subscription_id, decision.result, 1) returning * into result;
  if decision.subscription_id is not null then
    update public.subscriptions s set used_trainings = (select coalesce(sum(coalesce(a.quantity, 1)), 0)::integer from public.attendance a where a.sub_id = s.id)
      where s.id = decision.subscription_id;
  end if;
  return result;
end $$;

create or replace function public.crm_delete_auto_attendance(p_attendance_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare item public.attendance%rowtype;
begin
  if auth.uid() is null then raise exception 'Потрібна авторизація' using errcode = '28000'; end if;
  select * into item from public.attendance where id = p_attendance_id;
  if not found then raise exception 'Відмітку не знайдено' using errcode = 'P0002'; end if;
  if not (public.crm_is_admin_session() or public.rls_can_record_attendance(item.student_id, item.group_id)) then
    raise exception 'Немає доступу до учениці в цій групі' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(item.student_id::text || ':' || item.group_id, 0));
  select * into item from public.attendance where id = p_attendance_id for update;
  if not found then raise exception 'Відмітку не знайдено' using errcode = 'P0002'; end if;
  if not (public.crm_is_admin_session() or public.rls_can_record_attendance(item.student_id, item.group_id)) then
    raise exception 'Немає доступу до учениці в цій групі' using errcode = '42501';
  end if;
  if item.student_id is null or item.guest_name is not null or item.guest_type is not null
    or item.price_snapshot_uah is not null
    or item.entry_type not in ('subscription', 'debt') or item.entry_type is null
    or (item.entry_type = 'debt' and item.sub_id is not null)
    or (item.entry_type = 'subscription' and item.sub_id is null)
    or exists (select 1 from public.financial_operations f where f.attendance_id = item.id) then
    raise exception 'Цю фінансову відмітку може змінити лише адміністратор' using errcode = '42501';
  end if;
  delete from public.attendance where id = item.id;
  if item.sub_id is not null then
    update public.subscriptions s set used_trainings = (select coalesce(sum(coalesce(a.quantity, 1)), 0)::integer from public.attendance a where a.sub_id = s.id)
      where s.id = item.sub_id;
  end if;
end $$;
revoke all on function public.crm_create_auto_attendance(uuid, text, date) from public, anon;
revoke all on function public.crm_delete_auto_attendance(uuid) from public, anon;
grant execute on function public.crm_create_auto_attendance(uuid, text, date) to authenticated;
grant execute on function public.crm_delete_auto_attendance(uuid) to authenticated;
