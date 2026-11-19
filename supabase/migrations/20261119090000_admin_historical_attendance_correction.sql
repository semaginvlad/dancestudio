-- Historical corrections never reclassify attendance or mutate financial history.
create or replace function public.crm_admin_correct_historical_attendance(
  p_attendance_id uuid, p_quantity integer
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_att public.attendance%rowtype;
  v_type text;
  v_sub public.subscriptions%rowtype;
  v_used integer;
  v_last date;
begin
  if auth.uid() is null then raise exception 'Потрібна авторизація' using errcode = '28000'; end if;
  if not public.crm_is_admin_session() then raise exception 'Доступ лише для адміністратора' using errcode = '42501'; end if;
  if p_attendance_id is null or p_quantity is null or p_quantity not between 0 and 2 then
    raise exception 'Некоректна відмітка або кількість' using errcode = '22023';
  end if;
  select * into v_att from public.attendance where id = p_attendance_id;
  if not found then raise exception 'Відмітку вже змінено або видалено. Оновіть журнал.' using errcode = 'P0002'; end if;
  -- Same serialization key as Queue-Auto, acquired before row locks.
  perform pg_advisory_xact_lock(hashtextextended(v_att.student_id::text || ':' || v_att.group_id, 0));
  select * into v_att from public.attendance where id = p_attendance_id for update;
  if not found then raise exception 'Відмітку вже змінено або видалено. Оновіть журнал.' using errcode = 'P0002'; end if;
  if v_att.queue_auto_order is not null then raise exception 'Ця дія доступна лише для старих відміток'; end if;
  if exists (select 1 from public.financial_operations f where f.attendance_id = v_att.id or f.attendance_source_id = v_att.id)
     or exists (select 1 from public.subscriptions s where s.notes = 'auto_one_off_from_attendance:' || v_att.id::text)
     or exists (select 1 from public.subscriptions s where s.student_id = v_att.student_id
       and s.group_id = v_att.group_id and s.activation_date = v_att.date
       and lower(coalesce(s.plan_type, '')) in ('trial','single') and s.paid = true)
     or (v_att.sub_id is not null and exists (select 1 from public.subscriptions s where s.id = v_att.sub_id and lower(coalesce(s.plan_type, '')) in ('trial','single'))) then
    raise exception 'Ця відмітка має підтверджену оплату. Для неї потрібна окрема фінансова корекція' using errcode = 'P0001';
  end if;
  v_type := lower(coalesce(nullif(btrim(v_att.entry_type), ''), case when v_att.sub_id is null then 'debt' else 'subscription' end));
  if v_type not in ('subscription','debt') or v_att.guest_name is not null or v_att.guest_type is not null or v_att.price_snapshot_uah is not null
     or (v_type = 'subscription' and v_att.sub_id is null) or (v_type = 'debt' and v_att.sub_id is not null) then
    raise exception 'Цю відмітку потрібно перевірити окремо перед виправленням' using errcode = 'P0001';
  end if;
  if v_att.sub_id is not null and p_quantity < coalesce(v_att.quantity, 1) then
    select * into v_sub from public.subscriptions where id = v_att.sub_id for update;
    if not found then raise exception 'Абонемент для відмітки не знайдено' using errcode = 'P0002'; end if;
    select coalesce(sum(coalesce(a.quantity, 1)), 0)::integer, max(a.date) into v_used, v_last
      from public.attendance a where a.sub_id = v_att.sub_id;
    if v_sub.usage_expiry_state = 'legacy_unknown' and coalesce(v_sub.total_trainings, 0) > 0
       and v_used >= v_sub.total_trainings
       and v_used - coalesce(v_att.quantity, 1) + p_quantity < v_sub.total_trainings
       and v_sub.end_date is not null and v_last is not null and v_sub.end_date <= v_last then
      raise exception 'Для цього старого абонемента потрібно вручну перевірити дату завершення' using errcode = 'P0001';
    end if;
  end if;
  if p_quantity = 0 then
    delete from public.attendance where id = v_att.id;
  elsif p_quantity is distinct from coalesce(v_att.quantity, 1) then
    update public.attendance set quantity = p_quantity where id = v_att.id;
  end if;
  -- PR #469 attendance trigger performs canonical reconciliation in this same
  -- transaction; exceptions roll back attendance and subscription together.
end $$;
revoke all on function public.crm_admin_correct_historical_attendance(uuid, integer) from public, anon;
grant execute on function public.crm_admin_correct_historical_attendance(uuid, integer) to authenticated;
