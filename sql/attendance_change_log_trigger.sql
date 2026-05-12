-- Attendance change log trigger for future admin audit UI.
-- Documentation/migration draft only. Apply manually in Supabase after reviewing.
--
-- This file intentionally does not change frontend/backend runtime code and does
-- not add direct INSERT/UPDATE/DELETE RLS policies for attendance_change_log.

begin;

create or replace function public.log_attendance_change()
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

  v_attendance_id uuid;
  v_group_id text;
  v_group_name text := null;
  v_student_id uuid;
  v_student_name text := null;
  v_guest_name text;
  v_attendance_date date;
  v_sub_id uuid;
  v_entry_type text;
  v_guest_type text;
  v_quantity integer;
  v_action_type text;
  v_change_type text;
  v_previous_value jsonb := null;
  v_new_value jsonb := null;
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
  else
    v_actor_type := 'unknown';
  end if;

  v_actor_name := coalesce(nullif(btrim(v_actor_name), ''), v_actor_email);

  if TG_OP = 'INSERT' then
    v_attendance_id := NEW.id;
    v_group_id := NEW.group_id;
    v_student_id := NEW.student_id;
    v_guest_name := NEW.guest_name;
    v_attendance_date := NEW.date;
    v_sub_id := NEW.sub_id;
    v_entry_type := NEW.entry_type;
    v_guest_type := NEW.guest_type;
    v_quantity := NEW.quantity;
    v_action_type := 'create';
    v_change_type := case
      when NEW.student_id is null and nullif(btrim(NEW.guest_name), '') is not null then 'guest_added'
      else 'mark_added'
    end;
    v_new_value := jsonb_build_object(
      'id', NEW.id,
      'sub_id', NEW.sub_id,
      'student_id', NEW.student_id,
      'date', NEW.date,
      'guest_name', NEW.guest_name,
      'guest_type', NEW.guest_type,
      'group_id', NEW.group_id,
      'quantity', NEW.quantity,
      'entry_type', NEW.entry_type,
      'created_at', NEW.created_at
    );
  elsif TG_OP = 'UPDATE' then
    v_attendance_id := NEW.id;
    v_group_id := NEW.group_id;
    v_student_id := NEW.student_id;
    v_guest_name := NEW.guest_name;
    v_attendance_date := NEW.date;
    v_sub_id := NEW.sub_id;
    v_entry_type := NEW.entry_type;
    v_guest_type := NEW.guest_type;
    v_quantity := NEW.quantity;
    v_action_type := 'update';
    v_change_type := case
      when OLD.quantity is distinct from NEW.quantity then 'quantity_changed'
      when OLD.student_id is null
        and nullif(btrim(OLD.guest_name), '') is not null
        and NEW.student_id is not null then 'guest_relinked'
      else 'unknown'
    end;
    v_previous_value := jsonb_build_object(
      'id', OLD.id,
      'sub_id', OLD.sub_id,
      'student_id', OLD.student_id,
      'date', OLD.date,
      'guest_name', OLD.guest_name,
      'guest_type', OLD.guest_type,
      'group_id', OLD.group_id,
      'quantity', OLD.quantity,
      'entry_type', OLD.entry_type,
      'created_at', OLD.created_at
    );
    v_new_value := jsonb_build_object(
      'id', NEW.id,
      'sub_id', NEW.sub_id,
      'student_id', NEW.student_id,
      'date', NEW.date,
      'guest_name', NEW.guest_name,
      'guest_type', NEW.guest_type,
      'group_id', NEW.group_id,
      'quantity', NEW.quantity,
      'entry_type', NEW.entry_type,
      'created_at', NEW.created_at
    );
  elsif TG_OP = 'DELETE' then
    v_attendance_id := OLD.id;
    v_group_id := OLD.group_id;
    v_student_id := OLD.student_id;
    v_guest_name := OLD.guest_name;
    v_attendance_date := OLD.date;
    v_sub_id := OLD.sub_id;
    v_entry_type := OLD.entry_type;
    v_guest_type := OLD.guest_type;
    v_quantity := OLD.quantity;
    v_action_type := 'delete';
    v_change_type := case
      when OLD.student_id is null and nullif(btrim(OLD.guest_name), '') is not null then 'guest_removed'
      else 'mark_removed'
    end;
    v_previous_value := jsonb_build_object(
      'id', OLD.id,
      'sub_id', OLD.sub_id,
      'student_id', OLD.student_id,
      'date', OLD.date,
      'guest_name', OLD.guest_name,
      'guest_type', OLD.guest_type,
      'group_id', OLD.group_id,
      'quantity', OLD.quantity,
      'entry_type', OLD.entry_type,
      'created_at', OLD.created_at
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

  v_details := jsonb_build_object(
    'tg_op', TG_OP,
    'trigger_name', TG_NAME,
    'table_name', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
    'current_user', current_user,
    'session_user', session_user
  );

  insert into public.attendance_change_log (
    actor_type,
    actor_auth_user_id,
    actor_email,
    actor_trainer_id,
    actor_name,
    actor_telegram_user_id,
    actor_telegram_chat_id,
    attendance_id,
    group_id,
    group_name,
    student_id,
    student_name,
    guest_name,
    attendance_date,
    action_type,
    change_type,
    previous_value,
    new_value,
    sub_id,
    entry_type,
    guest_type,
    quantity,
    source,
    details
  ) values (
    v_actor_type,
    v_actor_auth_user_id,
    v_actor_email,
    v_actor_trainer_id,
    v_actor_name,
    null,
    null,
    v_attendance_id,
    v_group_id,
    v_group_name,
    v_student_id,
    v_student_name,
    v_guest_name,
    v_attendance_date,
    v_action_type,
    v_change_type,
    v_previous_value,
    v_new_value,
    v_sub_id,
    v_entry_type,
    v_guest_type,
    v_quantity,
    'db_trigger',
    v_details
  );

  return null;
end;
$$;

revoke execute on function public.log_attendance_change() from public, anon, authenticated;

drop trigger if exists attendance_change_log_trigger on public.attendance;
create trigger attendance_change_log_trigger
after insert or update or delete on public.attendance
for each row execute function public.log_attendance_change();

commit;
