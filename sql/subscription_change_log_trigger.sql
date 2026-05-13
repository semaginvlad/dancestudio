-- Subscription change log trigger for future admin audit UI.
-- Documentation/migration draft only. Apply manually in Supabase after reviewing.
--
-- This file intentionally does not change frontend/backend runtime code and does
-- not add direct INSERT/UPDATE/DELETE RLS policies for subscription_change_log.

begin;

create or replace function public.log_subscription_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_auth_user_id uuid := auth.uid();
  v_actor_email text := nullif(auth.jwt() ->> 'email', '');
  v_actor_type text := 'unknown';
  v_actor_trainer_id uuid := null;
  v_actor_name text := null;

  v_subscription_id uuid;
  v_student_id uuid;
  v_student_name text := null;
  v_group_id text;
  v_group_name text := null;

  v_action_type text;
  v_change_type text := 'unknown';
  v_previous_value jsonb := null;
  v_new_value jsonb := null;
  v_changed_fields text[] := array[]::text[];

  v_subscription_type text;
  v_start_date date;
  v_end_date date;
  v_activation_date date;
  v_original_end_date date;
  v_total_trainings integer;
  v_used_trainings integer;
  v_amount numeric;
  v_base_price numeric;
  v_discount_pct numeric;
  v_discount_source text;
  v_paid boolean;
  v_pay_method text;
  v_notes text;

  v_is_one_off boolean := false;
  v_source text := 'db_trigger';
  v_details jsonb;
begin
  select
    t.id,
    coalesce(
      nullif(btrim(t.name), ''),
      nullif(btrim(concat_ws(' ', t.first_name, t.last_name)), '')
    )
  into v_actor_trainer_id, v_actor_name
  from public.trainers t
  where t.auth_user_id = v_actor_auth_user_id
  limit 1;

  if lower(coalesce(v_actor_email, '')) = lower('semagin.vlad@gmail.com') then
    v_actor_type := 'admin';
  elsif v_actor_trainer_id is not null then
    v_actor_type := 'trainer';
  elsif v_actor_auth_user_id is null then
    v_actor_type := 'system';
  else
    v_actor_type := 'unknown';
  end if;

  v_actor_name := coalesce(nullif(btrim(v_actor_name), ''), v_actor_email);

  if TG_OP = 'INSERT' then
    v_subscription_id := NEW.id;
    v_student_id := NEW.student_id;
    v_group_id := NEW.group_id;
    v_subscription_type := NEW.plan_type;
    v_start_date := NEW.start_date;
    v_end_date := NEW.end_date;
    v_activation_date := NEW.activation_date;
    v_original_end_date := NEW.original_end_date;
    v_total_trainings := NEW.total_trainings;
    v_used_trainings := NEW.used_trainings;
    v_amount := NEW.amount;
    v_base_price := NEW.base_price;
    v_discount_pct := NEW.discount_pct;
    v_discount_source := NEW.discount_source;
    v_paid := NEW.paid;
    v_pay_method := NEW.pay_method;
    v_notes := NEW.notes;

    v_is_one_off := lower(coalesce(NEW.plan_type, '')) in ('trial', 'single')
      and coalesce(NEW.notes, '') like 'auto_one_off_from_attendance:%';
    v_action_type := 'create';
    v_change_type := case when v_is_one_off then 'one_off_created' else 'subscription_created' end;
    v_new_value := jsonb_build_object(
      'id', NEW.id,
      'student_id', NEW.student_id,
      'group_id', NEW.group_id,
      'plan_type', NEW.plan_type,
      'start_date', NEW.start_date,
      'end_date', NEW.end_date,
      'activation_date', NEW.activation_date,
      'original_end_date', NEW.original_end_date,
      'total_trainings', NEW.total_trainings,
      'used_trainings', NEW.used_trainings,
      'amount', NEW.amount,
      'base_price', NEW.base_price,
      'discount_pct', NEW.discount_pct,
      'discount_source', NEW.discount_source,
      'paid', NEW.paid,
      'pay_method', NEW.pay_method,
      'notification_sent', NEW.notification_sent,
      'notes', NEW.notes,
      'created_at', NEW.created_at
    );
  elsif TG_OP = 'DELETE' then
    v_subscription_id := OLD.id;
    v_student_id := OLD.student_id;
    v_group_id := OLD.group_id;
    v_subscription_type := OLD.plan_type;
    v_start_date := OLD.start_date;
    v_end_date := OLD.end_date;
    v_activation_date := OLD.activation_date;
    v_original_end_date := OLD.original_end_date;
    v_total_trainings := OLD.total_trainings;
    v_used_trainings := OLD.used_trainings;
    v_amount := OLD.amount;
    v_base_price := OLD.base_price;
    v_discount_pct := OLD.discount_pct;
    v_discount_source := OLD.discount_source;
    v_paid := OLD.paid;
    v_pay_method := OLD.pay_method;
    v_notes := OLD.notes;

    v_is_one_off := lower(coalesce(OLD.plan_type, '')) in ('trial', 'single')
      and coalesce(OLD.notes, '') like 'auto_one_off_from_attendance:%';
    v_action_type := 'delete';
    v_change_type := case when v_is_one_off then 'one_off_removed' else 'subscription_deleted' end;
    v_previous_value := jsonb_build_object(
      'id', OLD.id,
      'student_id', OLD.student_id,
      'group_id', OLD.group_id,
      'plan_type', OLD.plan_type,
      'start_date', OLD.start_date,
      'end_date', OLD.end_date,
      'activation_date', OLD.activation_date,
      'original_end_date', OLD.original_end_date,
      'total_trainings', OLD.total_trainings,
      'used_trainings', OLD.used_trainings,
      'amount', OLD.amount,
      'base_price', OLD.base_price,
      'discount_pct', OLD.discount_pct,
      'discount_source', OLD.discount_source,
      'paid', OLD.paid,
      'pay_method', OLD.pay_method,
      'notification_sent', OLD.notification_sent,
      'notes', OLD.notes,
      'created_at', OLD.created_at
    );
  elsif TG_OP = 'UPDATE' then
    if OLD.student_id is distinct from NEW.student_id then v_changed_fields := array_append(v_changed_fields, 'student_id'); end if;
    if OLD.group_id is distinct from NEW.group_id then v_changed_fields := array_append(v_changed_fields, 'group_id'); end if;
    if OLD.plan_type is distinct from NEW.plan_type then v_changed_fields := array_append(v_changed_fields, 'plan_type'); end if;
    if OLD.total_trainings is distinct from NEW.total_trainings then v_changed_fields := array_append(v_changed_fields, 'total_trainings'); end if;
    if OLD.paid is distinct from NEW.paid then v_changed_fields := array_append(v_changed_fields, 'paid'); end if;
    if OLD.pay_method is distinct from NEW.pay_method then v_changed_fields := array_append(v_changed_fields, 'pay_method'); end if;
    if OLD.amount is distinct from NEW.amount then v_changed_fields := array_append(v_changed_fields, 'amount'); end if;
    if OLD.base_price is distinct from NEW.base_price then v_changed_fields := array_append(v_changed_fields, 'base_price'); end if;
    if OLD.discount_pct is distinct from NEW.discount_pct then v_changed_fields := array_append(v_changed_fields, 'discount_pct'); end if;
    if OLD.discount_source is distinct from NEW.discount_source then v_changed_fields := array_append(v_changed_fields, 'discount_source'); end if;
    if OLD.activation_date is distinct from NEW.activation_date then v_changed_fields := array_append(v_changed_fields, 'activation_date'); end if;
    if OLD.start_date is distinct from NEW.start_date then v_changed_fields := array_append(v_changed_fields, 'start_date'); end if;
    if OLD.end_date is distinct from NEW.end_date then v_changed_fields := array_append(v_changed_fields, 'end_date'); end if;
    if OLD.original_end_date is distinct from NEW.original_end_date then v_changed_fields := array_append(v_changed_fields, 'original_end_date'); end if;
    if OLD.used_trainings is distinct from NEW.used_trainings then v_changed_fields := array_append(v_changed_fields, 'used_trainings'); end if;
    if OLD.notification_sent is distinct from NEW.notification_sent then v_changed_fields := array_append(v_changed_fields, 'notification_sent'); end if;
    if OLD.notes is distinct from NEW.notes then v_changed_fields := array_append(v_changed_fields, 'notes'); end if;

    if coalesce(array_length(v_changed_fields, 1), 0) = 0 then
      return null;
    end if;

    v_subscription_id := NEW.id;
    v_student_id := NEW.student_id;
    v_group_id := NEW.group_id;
    v_subscription_type := NEW.plan_type;
    v_start_date := NEW.start_date;
    v_end_date := NEW.end_date;
    v_activation_date := NEW.activation_date;
    v_original_end_date := NEW.original_end_date;
    v_total_trainings := NEW.total_trainings;
    v_used_trainings := NEW.used_trainings;
    v_amount := NEW.amount;
    v_base_price := NEW.base_price;
    v_discount_pct := NEW.discount_pct;
    v_discount_source := NEW.discount_source;
    v_paid := NEW.paid;
    v_pay_method := NEW.pay_method;
    v_notes := NEW.notes;

    v_is_one_off := lower(coalesce(NEW.plan_type, '')) in ('trial', 'single')
      and coalesce(NEW.notes, '') like 'auto_one_off_from_attendance:%';
    v_action_type := 'update';
    v_change_type := case
      when OLD.student_id is distinct from NEW.student_id or OLD.group_id is distinct from NEW.group_id then 'student_or_group_changed'
      when OLD.plan_type is distinct from NEW.plan_type or OLD.total_trainings is distinct from NEW.total_trainings then 'plan_changed'
      when OLD.paid is distinct from NEW.paid or OLD.pay_method is distinct from NEW.pay_method then 'payment_changed'
      when OLD.amount is distinct from NEW.amount
        or OLD.base_price is distinct from NEW.base_price
        or OLD.discount_pct is distinct from NEW.discount_pct
        or OLD.discount_source is distinct from NEW.discount_source then 'financial_changed'
      when OLD.activation_date is distinct from NEW.activation_date then 'activation_changed'
      when OLD.start_date is distinct from NEW.start_date
        or OLD.end_date is distinct from NEW.end_date
        or OLD.original_end_date is distinct from NEW.original_end_date then 'date_changed'
      when OLD.used_trainings is distinct from NEW.used_trainings then 'usage_changed'
      when v_changed_fields = array['notification_sent']::text[] then 'notification_changed'
      when coalesce(array_length(v_changed_fields, 1), 0) > 0 then 'subscription_updated'
      else 'unknown'
    end;
    v_previous_value := jsonb_build_object(
      'id', OLD.id,
      'student_id', OLD.student_id,
      'group_id', OLD.group_id,
      'plan_type', OLD.plan_type,
      'start_date', OLD.start_date,
      'end_date', OLD.end_date,
      'activation_date', OLD.activation_date,
      'original_end_date', OLD.original_end_date,
      'total_trainings', OLD.total_trainings,
      'used_trainings', OLD.used_trainings,
      'amount', OLD.amount,
      'base_price', OLD.base_price,
      'discount_pct', OLD.discount_pct,
      'discount_source', OLD.discount_source,
      'paid', OLD.paid,
      'pay_method', OLD.pay_method,
      'notification_sent', OLD.notification_sent,
      'notes', OLD.notes,
      'created_at', OLD.created_at
    );
    v_new_value := jsonb_build_object(
      'id', NEW.id,
      'student_id', NEW.student_id,
      'group_id', NEW.group_id,
      'plan_type', NEW.plan_type,
      'start_date', NEW.start_date,
      'end_date', NEW.end_date,
      'activation_date', NEW.activation_date,
      'original_end_date', NEW.original_end_date,
      'total_trainings', NEW.total_trainings,
      'used_trainings', NEW.used_trainings,
      'amount', NEW.amount,
      'base_price', NEW.base_price,
      'discount_pct', NEW.discount_pct,
      'discount_source', NEW.discount_source,
      'paid', NEW.paid,
      'pay_method', NEW.pay_method,
      'notification_sent', NEW.notification_sent,
      'notes', NEW.notes,
      'created_at', NEW.created_at
    );
  else
    return null;
  end if;

  if v_group_id is not null then
    select g.name
    into v_group_name
    from public.groups g
    where g.id = v_group_id
    limit 1;
  end if;

  if v_student_id is not null then
    select s.name
    into v_student_name
    from public.students s
    where s.id = v_student_id
    limit 1;
  end if;

  v_source := case
    when v_is_one_off then 'attendance_one_off'
    when v_change_type = 'usage_changed' then 'usage_sync'
    else 'db_trigger'
  end;

  v_details := jsonb_build_object(
    'tg_op', TG_OP,
    'trigger_name', TG_NAME,
    'table_name', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
    'current_user', current_user,
    'session_user', session_user,
    'inferred_source', v_source,
    'changed_fields', to_jsonb(v_changed_fields)
  );

  insert into public.subscription_change_log (
    actor_type,
    actor_auth_user_id,
    actor_email,
    actor_name,
    actor_trainer_id,
    subscription_id,
    student_id,
    student_name,
    group_id,
    group_name,
    action_type,
    change_type,
    previous_value,
    new_value,
    subscription_type,
    status,
    start_date,
    end_date,
    activation_date,
    original_end_date,
    total_trainings,
    used_trainings,
    amount,
    base_price,
    discount_pct,
    discount_source,
    paid,
    pay_method,
    notes,
    source,
    details
  ) values (
    v_actor_type,
    v_actor_auth_user_id,
    v_actor_email,
    v_actor_name,
    v_actor_trainer_id,
    v_subscription_id,
    v_student_id,
    v_student_name,
    v_group_id,
    v_group_name,
    v_action_type,
    v_change_type,
    v_previous_value,
    v_new_value,
    v_subscription_type,
    null,
    v_start_date,
    v_end_date,
    v_activation_date,
    v_original_end_date,
    v_total_trainings,
    v_used_trainings,
    v_amount,
    v_base_price,
    v_discount_pct,
    v_discount_source,
    v_paid,
    v_pay_method,
    v_notes,
    v_source,
    v_details
  );

  return null;
end;
$$;

revoke execute on function public.log_subscription_change() from public, anon, authenticated;

drop trigger if exists subscription_change_log_trigger on public.subscriptions;
create trigger subscription_change_log_trigger
after insert or update or delete on public.subscriptions
for each row execute function public.log_subscription_change();

commit;
