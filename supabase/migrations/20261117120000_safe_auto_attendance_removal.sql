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
        or a.entry_type not in ('subscription', 'debt') or coalesce(a.quantity, 0) <> 1
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
