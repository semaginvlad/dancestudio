-- Preserve atomic desired-count semantics while storing repeated units in one row.
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
        or a.entry_type is null or coalesce(a.quantity, 0) not between 1 and 2
        or (a.entry_type = 'debt' and a.sub_id is not null)
        or (a.entry_type = 'subscription' and a.sub_id is null)
        or exists (select 1 from public.financial_operations f where f.attendance_id = a.id or f.attendance_source_id = a.id))) then
    raise exception 'Історичну або фінансову відмітку може змінити лише адміністратор.' using errcode = 'P0001';
  end if;
  select coalesce(sum(a.quantity), 0)::integer into current_count from public.attendance a
    where a.student_id = p_student_id and a.group_id = p_group_id and a.date = p_date;
  if current_count > 2 then raise exception 'Некоректна кількість Auto-відміток. Зверніться до адміністратора.'; end if;
  while current_count < p_quantity loop
    select * into decision from public.crm_record_subscription_queue_activation(p_student_id, p_group_id, p_date);
    if decision.result = 'ambiguity' then
      raise exception 'Черга абонементів неоднозначна або пошкоджена. Зверніться до адміністратора.' using errcode = 'P0001';
    end if;
    if decision.result not in ('subscription', 'debt') then raise exception 'Невідомий результат перевірки абонемента'; end if;
    -- Reuse the existing row for the same subscription (or debt). The unique
    -- attendance key forbids another row for the same student/date/subscription.
    select a.* into item from public.attendance a
      where a.student_id = p_student_id and a.group_id = p_group_id and a.date = p_date
        and a.entry_type = decision.result and a.sub_id is not distinct from decision.subscription_id
      order by a.queue_auto_order desc limit 1 for update;
    if found then
      update public.attendance set quantity = quantity + 1 where id = item.id;
    else
      insert into public.attendance (student_id, group_id, date, sub_id, entry_type, quantity, queue_auto_order)
        values (p_student_id, p_group_id, p_date, decision.subscription_id, decision.result, 1, nextval('public.crm_auto_attendance_order_seq'));
    end if;
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
    if item.quantity > 1 then
      update public.attendance set quantity = quantity - 1 where id = item.id;
    else
      delete from public.attendance where id = item.id;
    end if;
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

-- Delete only ordinary Queue-Auto marks visible in a trainer's assigned group.
-- No direct attendance policy is relaxed and no financial fields are exposed.
create or replace function public.crm_remove_my_auto_attendance(
  p_student_id uuid, p_group_id text, p_date date
) returns void language plpgsql security definer set search_path = public as $$
declare
  item public.attendance%rowtype;
  affected uuid[] := '{}'::uuid[];
  affected_id uuid;
begin
  if auth.uid() is null then raise exception 'Потрібна авторизація' using errcode = '28000'; end if;
  if p_student_id is null or p_group_id is null or p_date is null then
    raise exception 'Некоректна учениця, група або дата' using errcode = '22023';
  end if;
  if not public.rls_owns_group(p_group_id) then
    raise exception 'Немає доступу до цієї групи' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text || ':' || p_group_id, 0));
  perform 1 from public.attendance a
    where a.student_id = p_student_id and a.group_id = p_group_id and a.date = p_date
    for update;
  if exists (select 1 from public.attendance a
    where a.student_id = p_student_id and a.group_id = p_group_id and a.date = p_date
      and (a.queue_auto_order is null or a.guest_name is not null or a.guest_type is not null
        or a.price_snapshot_uah is not null or a.entry_type is null
        or a.entry_type not in ('subscription', 'debt') or coalesce(a.quantity, 0) not between 1 and 2
        or (a.entry_type = 'debt' and a.sub_id is not null)
        or (a.entry_type = 'subscription' and a.sub_id is null)
        or exists (select 1 from public.financial_operations f
          where f.attendance_id = a.id or f.attendance_source_id = a.id))) then
    raise exception 'Цю відмітку може скасувати адміністратор.' using errcode = 'P0001';
  end if;
  for item in select a.* from public.attendance a
    where a.student_id = p_student_id and a.group_id = p_group_id and a.date = p_date
    for update
  loop
    delete from public.attendance where id = item.id;
    if item.sub_id is not null then affected := array_append(affected, item.sub_id); end if;
  end loop;
  foreach affected_id in array affected loop
    update public.subscriptions s set used_trainings = (
      select coalesce(sum(coalesce(a.quantity, 1)), 0)::integer
      from public.attendance a where a.sub_id = s.id
    ) where s.id = affected_id;
  end loop;
end $$;
revoke all on function public.crm_remove_my_auto_attendance(uuid, text, date) from public, anon;
grant execute on function public.crm_remove_my_auto_attendance(uuid, text, date) to authenticated;
