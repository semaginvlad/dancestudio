-- Enforce the CRM financial boundary at the database layer.
-- Attendance is operational. Only an administrator may create or mutate money.
begin;

do $preflight$
declare v_missing text;
begin
  select string_agg(x.name, ', ' order by x.name) into v_missing
  from (values ('attendance'),('subscriptions'),('room_bookings'),('trainers'),('trainer_groups'),('student_groups')) x(name)
  where to_regclass('public.' || x.name) is null;
  if v_missing is not null then raise exception 'financial hardening requires tables: %', v_missing; end if;
  if to_regprocedure('public.rls_is_admin()') is null or to_regprocedure('public.rls_owns_group(text)') is null then
    raise exception 'canonical admin/trainer authorization helpers are required';
  end if;
end $preflight$;

do $policy_preflight$
declare v_unknown text;
begin
  select string_agg(quote_ident(tablename)||'.'||quote_ident(policyname),', ' order by tablename,policyname)
  into v_unknown from pg_policies
  where schemaname='public' and tablename in ('attendance','subscriptions')
    and policyname not in (
      'Allow all on attendance','Allow all on subscriptions','attendance_admin_all','attendance_trainer_select_own_groups',
      'attendance_trainer_insert_own_groups','attendance_trainer_update_own_groups','attendance_trainer_delete_own_groups',
      'subscriptions_admin_all','subscriptions_trainer_select_own_group','subscriptions_trainer_insert_own_group',
      'subscriptions_trainer_update_own_group','subscriptions_trainer_delete_own_group'
    );
  if v_unknown is not null then
    raise warning 'financial hardening found unknown attendance/subscription policies; migration will fail unless reviewed: %',v_unknown;
  end if;
end $policy_preflight$;

alter table public.attendance add column if not exists mutation_key uuid;
alter table public.attendance add column if not exists mutation_hash text;
create unique index if not exists attendance_mutation_key_uidx
  on public.attendance (mutation_key) where mutation_key is not null;

alter table public.subscriptions add column if not exists source_attendance_id uuid;
alter table public.subscriptions add column if not exists financial_idempotency_key uuid;
alter table public.subscriptions add column if not exists financial_request_hash text;
create unique index if not exists subscriptions_source_attendance_uidx
  on public.subscriptions (source_attendance_id) where source_attendance_id is not null;
create unique index if not exists subscriptions_financial_idempotency_uidx
  on public.subscriptions (financial_idempotency_key) where financial_idempotency_key is not null;

-- Append-only audit independent from the legacy optional change-log installation.
create table if not exists public.financial_change_audit (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_user_id uuid,
  actor_email text,
  actor_is_admin boolean not null,
  table_name text not null check (table_name in ('subscriptions','room_bookings')),
  row_id text not null,
  operation text not null check (operation in ('INSERT','UPDATE','DELETE')),
  old_record jsonb,
  new_record jsonb
);
create index if not exists financial_change_audit_target_idx
  on public.financial_change_audit (table_name, row_id, occurred_at desc);
alter table public.financial_change_audit enable row level security;
revoke all on public.financial_change_audit from public, anon, authenticated;
grant select on public.financial_change_audit to authenticated;
drop policy if exists financial_change_audit_admin_read on public.financial_change_audit;
create policy financial_change_audit_admin_read on public.financial_change_audit
  for select to authenticated using (public.rls_is_admin());

create or replace function public.crm_audit_financial_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_old jsonb; v_new jsonb; v_id text;
begin
  v_old := case when tg_op <> 'INSERT' then to_jsonb(old) else null end;
  v_new := case when tg_op <> 'DELETE' then to_jsonb(new) else null end;
  v_id := coalesce(v_new->>'id', v_old->>'id');
  insert into public.financial_change_audit
    (actor_user_id, actor_email, actor_is_admin, table_name, row_id, operation, old_record, new_record)
  values
    (auth.uid(), nullif(auth.jwt()->>'email',''), public.rls_is_admin(), tg_table_name, v_id, tg_op, v_old, v_new);
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function public.crm_audit_financial_change() from public, anon, authenticated;

drop trigger if exists subscriptions_financial_audit on public.subscriptions;
create trigger subscriptions_financial_audit after insert or update or delete on public.subscriptions
for each row execute function public.crm_audit_financial_change();
drop trigger if exists room_bookings_financial_audit on public.room_bookings;
create trigger room_bookings_financial_audit after insert or update or delete on public.room_bookings
for each row execute function public.crm_audit_financial_change();

-- Base subscription rows contain finance and are administrator-only. Trainers use
-- operational SECURITY DEFINER read/sync RPCs, never the table.
alter table public.subscriptions enable row level security;
drop policy if exists "Allow all on subscriptions" on public.subscriptions;
drop policy if exists subscriptions_trainer_select_own_group on public.subscriptions;
drop policy if exists subscriptions_trainer_insert_own_group on public.subscriptions;
drop policy if exists subscriptions_trainer_update_own_group on public.subscriptions;
drop policy if exists subscriptions_trainer_delete_own_group on public.subscriptions;
drop policy if exists subscriptions_admin_all on public.subscriptions;
create policy subscriptions_admin_all on public.subscriptions for all to authenticated
  using (public.rls_is_admin()) with check (public.rls_is_admin());
revoke all on public.subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.subscriptions to authenticated;

-- Trainer attendance writes are RPC-only so idempotency and usage updates cannot
-- be bypassed with a direct PostgREST mutation. The existing admin ALL policy is
-- replaced explicitly; trainers retain only a scoped operational SELECT.
alter table public.attendance enable row level security;
drop policy if exists "Allow all on attendance" on public.attendance;
drop policy if exists attendance_admin_all on public.attendance;
drop policy if exists attendance_trainer_insert_own_groups on public.attendance;
drop policy if exists attendance_trainer_update_own_groups on public.attendance;
drop policy if exists attendance_trainer_delete_own_groups on public.attendance;
drop policy if exists attendance_trainer_select_own_groups on public.attendance;
create policy attendance_admin_all on public.attendance for all to authenticated
  using(public.rls_is_admin()) with check(public.rls_is_admin());
create policy attendance_trainer_select_own_groups on public.attendance for select to authenticated
  using(group_id is not null and public.rls_owns_group(group_id));
revoke all on public.attendance from public, anon, authenticated;
grant select, insert, update, delete on public.attendance to authenticated;

do $policy_postflight$
declare v_unknown text;
begin
  select string_agg(quote_ident(tablename)||'.'||quote_ident(policyname),', ' order by tablename,policyname)
  into v_unknown from pg_policies
  where schemaname='public' and tablename in ('attendance','subscriptions')
    and policyname not in ('attendance_admin_all','attendance_trainer_select_own_groups','subscriptions_admin_all');
  if v_unknown is not null then
    raise exception 'Unknown attendance/subscription policies require manual review before hardening: %',v_unknown;
  end if;
  if exists(select 1 from pg_policies where schemaname='public' and tablename='subscriptions' and policyname<>'subscriptions_admin_all')
     or exists(select 1 from pg_policies where schemaname='public' and tablename='attendance' and cmd in ('INSERT','UPDATE','DELETE','ALL') and policyname<>'attendance_admin_all') then
    raise exception 'Financial hardening policy invariant failed';
  end if;
end $policy_postflight$;

-- Trainers may keep schedule ownership, but money and event identity are immutable
-- to them even if a row policy permits an UPDATE/DELETE.
create or replace function public.crm_is_active_booking_owner(p_trainer_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.trainers t
    where t.auth_user_id=auth.uid()
      and t.is_active is true
      and t.archived_at is null
      and t.access_disabled_at is null
      and (t.id::text=p_trainer_id or t.auth_user_id::text=p_trainer_id)
  )
$$;
revoke all on function public.crm_is_active_booking_owner(text) from public, anon;
grant execute on function public.crm_is_active_booking_owner(text) to authenticated;

create or replace function public.crm_guard_room_booking_finance()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if public.rls_is_admin() then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if not public.crm_is_active_booking_owner(coalesce(new.trainer_id::text, old.trainer_id::text)) then
    raise exception 'Not allowed' using errcode='42501';
  end if;
  if tg_op='INSERT' and not (
    (new.event_type='room_booking' and new.type='room_booking' and new.booking_type is null)
    or
    (new.event_type='individual_training' and new.type='individual'
      and new.booking_type in ('individual','individual_1_2','small_group_3_9','group_10_plus'))
  ) then
    raise exception 'Unsupported trainer booking classification' using errcode='42501';
  elsif tg_op='INSERT' and (new.price is not null or new.payment_method is not null) then
    raise exception 'Only an administrator may set booking finance' using errcode='42501';
  elsif tg_op='UPDATE' and (
    old.price is distinct from new.price or old.payment_method is distinct from new.payment_method
    or old.event_type is distinct from new.event_type or old.booking_type is distinct from new.booking_type
    or old.type is distinct from new.type or old.trainer_id is distinct from new.trainer_id
  ) then raise exception 'Only an administrator may change booking finance or identity' using errcode='42501';
  elsif tg_op='DELETE' and (
    old.price is not null
    or (old.payment_method is not null and lower(btrim(old.payment_method)) not in ('','none'))
  ) then
    raise exception 'Only an administrator may delete a financially classified booking' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function public.crm_guard_room_booking_finance() from public, anon, authenticated;
drop trigger if exists room_bookings_financial_guard on public.room_bookings;
create trigger room_bookings_financial_guard before insert or update or delete on public.room_bookings
for each row execute function public.crm_guard_room_booking_finance();

-- Install and validate the canonical replacement inventory while the legacy
-- allow-all policy (if present) still keeps the table usable. The surrounding
-- transaction restores the previous inventory if any pre/postflight check fails.
do $room_bookings_policy_preflight$
declare v_missing text; v_unknown text;
begin
  select string_agg(c,', ' order by c) into v_missing
  from unnest(array['id','trainer_id','price','payment_method','type','booking_type','event_type']) c
  where not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='room_bookings' and column_name=c
  );
  if v_missing is not null then
    raise exception 'room_bookings hardening requires columns: %',v_missing;
  end if;
  if to_regprocedure('public.rls_is_admin()') is null
     or to_regprocedure('public.crm_is_active_booking_owner(text)') is null then
    raise exception 'room_bookings canonical authorization helpers are required';
  end if;
  select string_agg(quote_ident(policyname),', ' order by policyname) into v_unknown
  from pg_policies where schemaname='public' and tablename='room_bookings'
    and policyname not in (
      'Allow all on room_bookings','room_bookings_admin_all',
      'room_bookings_trainer_select_own','room_bookings_trainer_insert_own',
      'room_bookings_trainer_update_own','room_bookings_trainer_delete_own',
      'room_bookings_trainer_insert_own_allowed_events',
      'room_bookings_trainer_update_own_allowed_events'
    );
  if v_unknown is not null then
    raise exception 'Unknown room_bookings policies require manual review before hardening: %',v_unknown;
  end if;
end $room_bookings_policy_preflight$;

alter table public.room_bookings enable row level security;
drop policy if exists room_bookings_admin_all on public.room_bookings;
drop policy if exists room_bookings_trainer_select_own on public.room_bookings;
drop policy if exists room_bookings_trainer_insert_own on public.room_bookings;
drop policy if exists room_bookings_trainer_update_own on public.room_bookings;
drop policy if exists room_bookings_trainer_delete_own on public.room_bookings;

create policy room_bookings_admin_all on public.room_bookings for all to authenticated
  using(public.rls_is_admin()) with check(public.rls_is_admin());
create policy room_bookings_trainer_select_own on public.room_bookings for select to authenticated
  using(public.crm_is_active_booking_owner(trainer_id::text));
create policy room_bookings_trainer_insert_own on public.room_bookings for insert to authenticated
  with check(public.crm_is_active_booking_owner(trainer_id::text));
create policy room_bookings_trainer_update_own on public.room_bookings for update to authenticated
  using(public.crm_is_active_booking_owner(trainer_id::text))
  with check(public.crm_is_active_booking_owner(trainer_id::text));
create policy room_bookings_trainer_delete_own on public.room_bookings for delete to authenticated
  using(public.crm_is_active_booking_owner(trainer_id::text));

do $room_bookings_replacement_postflight$
declare v_count integer;
begin
  select count(*) into v_count from pg_policies
  where schemaname='public' and tablename='room_bookings'
    and policyname in ('room_bookings_admin_all','room_bookings_trainer_select_own',
      'room_bookings_trainer_insert_own','room_bookings_trainer_update_own',
      'room_bookings_trainer_delete_own');
  if v_count <> 5 then
    raise exception 'room_bookings replacement policy inventory is incomplete';
  end if;
  if exists (
    select 1 from pg_policies where schemaname='public' and tablename='room_bookings'
      and policyname in ('room_bookings_trainer_select_own','room_bookings_trainer_insert_own',
        'room_bookings_trainer_update_own','room_bookings_trainer_delete_own')
      and coalesce(qual,'')||' '||coalesce(with_check,'') not like '%crm_is_active_booking_owner%'
  ) then
    raise exception 'room_bookings trainer policies do not use canonical ownership';
  end if;
end $room_bookings_replacement_postflight$;

-- Replacement is present and verified; legacy permissive policies can now be
-- removed. Do not silently retain any repository-supported alternative policy.
drop policy if exists "Allow all on room_bookings" on public.room_bookings;
drop policy if exists room_bookings_trainer_insert_own_allowed_events on public.room_bookings;
drop policy if exists room_bookings_trainer_update_own_allowed_events on public.room_bookings;

do $room_bookings_final_postflight$
declare v_actual text; v_expected text := 'room_bookings_admin_all,room_bookings_trainer_delete_own,room_bookings_trainer_insert_own,room_bookings_trainer_select_own,room_bookings_trainer_update_own';
begin
  select string_agg(policyname,',' order by policyname) into v_actual
  from pg_policies where schemaname='public' and tablename='room_bookings';
  if v_actual is distinct from v_expected then
    raise exception 'Unexpected final room_bookings policy inventory: %',coalesce(v_actual,'<none>');
  end if;
end $room_bookings_final_postflight$;

revoke all on public.room_bookings from public, anon, authenticated;
grant select (id,date,start_time,end_time,trainer_id,trainer_name,title,type,booking_type,
  people_count,event_type,note,color,recurrence,recurrence_until,description,status,created_at,room_name)
  on public.room_bookings to authenticated;
grant insert, update, delete on public.room_bookings to authenticated;

-- No legacy attendance helper may manufacture or remove a payment.
revoke all on function public.crm_ensure_one_off_payment_for_attendance(uuid) from public, anon, authenticated;
revoke all on function public.crm_remove_one_off_payment_if_orphan(uuid) from public, anon, authenticated;

-- Operational subscription projection: canonical active trainer assignments,
-- no amount/paid/method/discount/notes in either the result or nested objects.
create or replace function public.crm_fetch_my_attendance_subscriptions()
returns table (
  id uuid, student_id uuid, group_id text, plan_type text, start_date date,
  end_date date, total_trainings integer, used_trainings integer,
  notification_sent boolean, created_at timestamptz, activation_date date,
  original_end_date date
) language sql stable security definer set search_path = public as $$
  select s.id,s.student_id,s.group_id,s.plan_type,s.start_date,s.end_date,
    s.total_trainings,s.used_trainings,s.notification_sent,s.created_at,
    s.activation_date,s.original_end_date
  from public.subscriptions s
  where auth.uid() is not null and public.rls_owns_group(s.group_id)
  order by s.created_at desc
$$;
revoke all on function public.crm_fetch_my_attendance_subscriptions() from public, anon;
grant execute on function public.crm_fetch_my_attendance_subscriptions() to authenticated;

-- Schedule projection never exposes price or payment method to a trainer,
-- including the owner of the booking.
create or replace function public.crm_fetch_schedule_room_bookings()
returns table (
  id uuid,date date,start_time text,end_time text,trainer_id text,trainer_name text,
  title text,type text,booking_type text,people_count integer,price integer,
  payment_method text,event_type text,note text,color text,recurrence text,
  recurrence_until date,description text,status text,created_at timestamptz,room_name text
) language sql stable security definer set search_path = public as $$
  select rb.id,rb.date,rb.start_time,rb.end_time,rb.trainer_id::text,rb.trainer_name,
    rb.title,rb.type,rb.booking_type,
    case when public.crm_is_admin_session() or public.crm_is_active_booking_owner(rb.trainer_id::text)
      then rb.people_count else null end,
    case when public.crm_is_admin_session() then rb.price else null end,
    case when public.crm_is_admin_session() then rb.payment_method else null end,
    rb.event_type,
    case when public.crm_is_admin_session() or public.crm_is_active_booking_owner(rb.trainer_id::text)
      then rb.note else null end,
    rb.color,rb.recurrence,rb.recurrence_until,
    case when public.crm_is_admin_session() or public.crm_is_active_booking_owner(rb.trainer_id::text)
      then rb.description else null end,
    rb.status,rb.created_at,rb.room_name
  from public.room_bookings rb
  where public.crm_is_admin_session() or public.crm_is_active_trainer_session()
  order by rb.date,rb.start_time
$$;
revoke all on function public.crm_fetch_schedule_room_bookings() from public, anon;
grant execute on function public.crm_fetch_schedule_room_bookings() to authenticated;

-- One canonical, lock-owning usage synchronizer shared by every attendance
-- mutation. It mirrors the established crm_sync_subscription_usage contract.
create or replace function public.crm_sync_subscription_usage_internal(p_sub_id uuid)
returns public.subscriptions language plpgsql security definer set search_path=public as $$
declare v_sub public.subscriptions%rowtype; v_used integer; v_first date; v_last date; v_end date; v_pack boolean;
begin
  select * into v_sub from public.subscriptions s where s.id=p_sub_id for update;
  if not found then raise exception 'Subscription not found' using errcode='P0002'; end if;
  select coalesce(sum(coalesce(a.quantity,1)),0)::integer,min(a.date),max(a.date)
    into v_used,v_first,v_last from public.attendance a where a.sub_id=p_sub_id;
  v_end:=v_sub.end_date;
  v_pack:=lower(btrim(coalesce(v_sub.plan_type,''))) in ('4pack','8pack','12pack');
  if v_pack and coalesce(v_sub.total_trainings,0)>0 and v_used>=v_sub.total_trainings
     and v_last is not null and v_sub.end_date is not null and v_last<v_sub.end_date then
    v_end:=v_last;
  end if;
  update public.subscriptions s set used_trainings=v_used,activation_date=v_first,end_date=v_end
  where s.id=p_sub_id returning * into v_sub;
  return v_sub;
end $$;
revoke all on function public.crm_sync_subscription_usage_internal(uuid) from public,anon,authenticated;

create or replace function public.crm_sync_subscription_usage(p_sub_id uuid)
returns table(id uuid,student_id uuid,group_id text,plan_type text,start_date date,end_date date,
  total_trainings integer,used_trainings integer,notification_sent boolean,created_at timestamptz,
  activation_date date,original_end_date date)
language plpgsql security definer set search_path=public as $$
declare v_sub public.subscriptions%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode='28000'; end if;
  select * into v_sub from public.subscriptions s where s.id=p_sub_id;
  if not found then raise exception 'Subscription not found' using errcode='P0002'; end if;
  if not (public.rls_is_admin() or public.rls_owns_group(v_sub.group_id)) then raise exception 'Not allowed' using errcode='42501'; end if;
  v_sub:=public.crm_sync_subscription_usage_internal(p_sub_id);
  return query select v_sub.id,v_sub.student_id,v_sub.group_id,v_sub.plan_type,v_sub.start_date,v_sub.end_date,
    v_sub.total_trainings,v_sub.used_trainings,v_sub.notification_sent,v_sub.created_at,v_sub.activation_date,v_sub.original_end_date;
end $$;
revoke all on function public.crm_sync_subscription_usage(uuid) from public,anon;
grant execute on function public.crm_sync_subscription_usage(uuid) to authenticated;

create or replace function public.crm_record_attendance(
  p_sub_id uuid, p_student_id uuid, p_date date, p_guest_name text,
  p_guest_type text, p_group_id text, p_quantity integer,
  p_entry_type text, p_idempotency_key uuid
) returns table (
  id uuid, sub_id uuid, student_id uuid, date date, guest_name text,
  guest_type text, group_id text, quantity integer, entry_type text
) language plpgsql security definer set search_path = public as $$
declare
  v_row public.attendance%rowtype;
  v_sub public.subscriptions%rowtype;
  v_type text;
  v_is_admin boolean;
  v_request_hash text;
  v_existing_usage integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode='28000'; end if;
  v_is_admin := public.rls_is_admin();
  if not v_is_admin and current_setting('crm.trainer_presence_internal',true) is distinct from 'on' then
    raise exception 'Trainers must record neutral presence through crm_record_trainer_presence' using errcode='42501';
  end if;
  if not (v_is_admin or public.rls_owns_group(p_group_id)) then raise exception 'Not allowed' using errcode='42501'; end if;
  if p_idempotency_key is null or p_date is null or p_group_id is null or coalesce(p_quantity,0) < 1 then
    raise exception 'Invalid attendance input' using errcode='22023';
  end if;
  -- Canonical create order: natural identity, student/group, subscription, rows.
  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|',p_group_id,p_date::text,
    coalesce(p_student_id::text,lower(btrim(p_guest_name)))),0));
  if p_student_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(concat_ws('|','attendance',p_group_id,p_student_id::text),0));
  end if;
  v_request_hash := md5(concat_ws('|',coalesce(p_sub_id::text,''),coalesce(p_student_id::text,''),p_date::text,
    lower(coalesce(btrim(p_guest_name),'')),lower(coalesce(btrim(p_guest_type),'')),p_group_id,p_quantity::text,
    lower(coalesce(btrim(p_entry_type),''))));
  select * into v_row from public.attendance a where a.mutation_key=p_idempotency_key;
  if found then
    if v_row.mutation_hash is distinct from v_request_hash then raise exception 'Idempotency key conflict' using errcode='23505'; end if;
    return query select v_row.id,v_row.sub_id,v_row.student_id,v_row.date,v_row.guest_name,v_row.guest_type,v_row.group_id,v_row.quantity,v_row.entry_type;
    return;
  end if;
  v_type := lower(coalesce(nullif(btrim(p_entry_type),''),'debt'));
  if v_type not in ('subscription','trial','single','debt','unpaid') then raise exception 'Invalid attendance type' using errcode='22023'; end if;
  if p_sub_id is not null then
    v_type := 'subscription';
  elsif p_student_id is not null and v_type not in ('trial','single','unpaid') then
    v_type := 'debt';
  elsif p_student_id is null and v_type not in ('trial','single') then
    raise exception 'Guest attendance must be trial or single' using errcode='22023';
  end if;
  if not v_is_admin and p_student_id is not null and not public.rls_can_record_attendance(p_student_id,p_group_id) then
    raise exception 'Student is outside trainer group' using errcode='42501';
  end if;
  -- Under the natural-identity lock, retry detection must precede capacity
  -- accounting: the first request may have consumed the final training.
  select * into v_row from public.attendance a
  where a.group_id=p_group_id and a.date=p_date
    and a.student_id is not distinct from p_student_id
    and lower(coalesce(a.guest_name,''))=lower(coalesce(case when p_student_id is null then nullif(btrim(p_guest_name),'') end,''))
    and a.sub_id is not distinct from p_sub_id
    and lower(coalesce(a.entry_type,a.guest_type,''))=v_type
  order by a.created_at nulls last, a.id limit 1;
  if found then
    if v_row.mutation_hash is distinct from v_request_hash then
      raise exception 'Attendance payload conflicts with existing record' using errcode='23505';
    end if;
    return query select v_row.id,v_row.sub_id,v_row.student_id,v_row.date,v_row.guest_name,v_row.guest_type,v_row.group_id,v_row.quantity,v_row.entry_type;
    return;
  end if;
  if p_sub_id is not null then
    select * into v_sub from public.subscriptions s where s.id=p_sub_id for update;
    if not found or v_sub.student_id is distinct from p_student_id or v_sub.group_id is distinct from p_group_id then
      raise exception 'Subscription does not match attendance' using errcode='22023';
    end if;
    if p_date < coalesce(v_sub.activation_date,v_sub.start_date) or p_date > v_sub.end_date then
      raise exception 'Subscription does not cover attendance date' using errcode='22023';
    end if;
    select coalesce(sum(a.quantity),0)::integer into v_existing_usage
    from public.attendance a where a.sub_id=p_sub_id;
    v_existing_usage := greatest(v_existing_usage,coalesce(v_sub.used_trainings,0));
    if v_existing_usage + p_quantity > coalesce(v_sub.total_trainings,0) then
      raise exception 'Subscription has no remaining trainings' using errcode='22023';
    end if;
  end if;
  insert into public.attendance(sub_id,student_id,date,guest_name,guest_type,group_id,quantity,entry_type,mutation_key,mutation_hash)
  values(p_sub_id,p_student_id,p_date,case when p_student_id is null then nullif(btrim(p_guest_name),'') else null end,
    case when p_student_id is null then v_type else null end,p_group_id,p_quantity,v_type,p_idempotency_key,v_request_hash)
  returning * into v_row;
  if p_sub_id is not null then
    perform public.crm_sync_subscription_usage_internal(p_sub_id);
  end if;
  return query select v_row.id,v_row.sub_id,v_row.student_id,v_row.date,v_row.guest_name,v_row.guest_type,v_row.group_id,v_row.quantity,v_row.entry_type;
exception when unique_violation then
  select * into v_row from public.attendance a where a.mutation_key=p_idempotency_key;
  if not found or v_row.mutation_hash is distinct from v_request_hash then
    raise exception 'Idempotency key conflict' using errcode='23505';
  end if;
  return query select v_row.id,v_row.sub_id,v_row.student_id,v_row.date,v_row.guest_name,v_row.guest_type,v_row.group_id,v_row.quantity,v_row.entry_type;
end $$;
revoke all on function public.crm_record_attendance(uuid,uuid,date,text,text,text,integer,text,uuid) from public, anon;
grant execute on function public.crm_record_attendance(uuid,uuid,date,text,text,text,integer,text,uuid) to authenticated;

create or replace function public.crm_record_trainer_presence(
  p_student_id uuid,p_date date,p_group_id text,p_quantity integer,p_idempotency_key uuid
) returns table(id uuid,sub_id uuid,student_id uuid,date date,guest_name text,guest_type text,group_id text,quantity integer,entry_type text)
language plpgsql security definer set search_path=public as $$
declare v_sub_id uuid;
begin
  if auth.uid() is null or not public.rls_can_record_attendance(p_student_id,p_group_id) then raise exception 'Not allowed' using errcode='42501'; end if;
  if p_student_id is null then raise exception 'Student is required' using errcode='22023'; end if;
  -- Match crm_record_attendance exactly: natural identity before student/group,
  -- then subscription. Nested acquisition is re-entrant and keeps this order.
  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|',p_group_id,p_date::text,p_student_id::text),0));
  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|','attendance',p_group_id,p_student_id::text),0));
  select s.id into v_sub_id from public.subscriptions s
  where s.student_id=p_student_id and s.group_id=p_group_id
    and p_date between coalesce(s.activation_date,s.start_date) and s.end_date
    and greatest(
      coalesce(s.used_trainings,0),
      (select coalesce(sum(a.quantity),0) from public.attendance a where a.sub_id=s.id)
    )<coalesce(s.total_trainings,0)
  order by coalesce(s.activation_date,s.start_date),s.created_at,s.id for update limit 1;
  perform set_config('crm.trainer_presence_internal','on',true);
  return query select * from public.crm_record_attendance(v_sub_id,p_student_id,p_date,null,null,p_group_id,p_quantity,
    case when v_sub_id is null then 'unpaid' else 'subscription' end,p_idempotency_key);
end $$;
revoke all on function public.crm_record_trainer_presence(uuid,date,text,integer,uuid) from public,anon;
grant execute on function public.crm_record_trainer_presence(uuid,date,text,integer,uuid) to authenticated;

create table if not exists public.attendance_quantity_mutations (
  idempotency_key uuid primary key,
  attendance_id uuid not null,
  expected_quantity integer not null,
  target_quantity integer not null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
alter table public.attendance_quantity_mutations enable row level security;
revoke all on public.attendance_quantity_mutations from public, anon, authenticated;

create or replace function public.crm_replace_attendance_quantity(
  p_attendance_id uuid, p_expected_quantity integer, p_target_quantity integer,
  p_idempotency_key uuid
) returns table (
  id uuid, sub_id uuid, student_id uuid, date date, guest_name text,
  guest_type text, group_id text, quantity integer, entry_type text
) language plpgsql security definer set search_path = public as $$
declare
  v_row public.attendance%rowtype;
  v_probe public.attendance%rowtype;
  v_sub public.subscriptions%rowtype;
  v_previous public.attendance_quantity_mutations%rowtype;
  v_usage_without_row integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode='28000'; end if;
  if p_attendance_id is null or p_idempotency_key is null
     or coalesce(p_expected_quantity,0) < 1 or coalesce(p_target_quantity,0) < 1 then
    raise exception 'Invalid attendance quantity input' using errcode='22023';
  end if;

  -- The request-key lock makes key reuse deterministic even for different rows.
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,0));
  select * into v_previous from public.attendance_quantity_mutations aqm
  where aqm.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.attendance_id is distinct from p_attendance_id
       or v_previous.expected_quantity is distinct from p_expected_quantity
       or v_previous.target_quantity is distinct from p_target_quantity then
      raise exception 'Idempotency key conflict' using errcode='23505';
    end if;
    select * into v_row from public.attendance a where a.id=p_attendance_id;
    if not found or v_row.quantity is distinct from p_target_quantity then
      raise exception 'Attendance changed after idempotent request' using errcode='40001';
    end if;
    return query select v_row.id,v_row.sub_id,v_row.student_id,v_row.date,v_row.guest_name,v_row.guest_type,v_row.group_id,v_row.quantity,v_row.entry_type;
    return;
  end if;

  select * into v_probe from public.attendance a where a.id=p_attendance_id;
  if not found then raise exception 'Attendance not found' using errcode='P0002'; end if;
  if not (public.rls_is_admin() or public.rls_owns_group(v_probe.group_id)) then
    raise exception 'Not allowed' using errcode='42501';
  end if;
  if v_probe.student_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(concat_ws('|','attendance',v_probe.group_id,v_probe.student_id::text),0));
  end if;
  if v_probe.sub_id is not null then
    select * into v_sub from public.subscriptions s where s.id=v_probe.sub_id for update;
  end if;
  select * into v_row from public.attendance a where a.id=p_attendance_id for update;
  if not found then raise exception 'Attendance not found' using errcode='P0002'; end if;
  if v_row.student_id is distinct from v_probe.student_id or v_row.group_id is distinct from v_probe.group_id
     or v_row.sub_id is distinct from v_probe.sub_id then
    raise exception 'Attendance changed during quantity update' using errcode='40001';
  end if;
  if not (public.rls_is_admin() or public.rls_owns_group(v_row.group_id)) then
    raise exception 'Not allowed' using errcode='42501';
  end if;
  if v_row.quantity is distinct from p_expected_quantity then
    raise exception 'Attendance quantity conflict' using errcode='40001';
  end if;

  if v_row.sub_id is not null then
    if not found or v_sub.student_id is distinct from v_row.student_id
       or v_sub.group_id is distinct from v_row.group_id then
      raise exception 'Subscription does not match attendance' using errcode='22023';
    end if;
    if v_row.date < coalesce(v_sub.activation_date,v_sub.start_date) or v_row.date > v_sub.end_date then
      raise exception 'Subscription does not cover attendance date' using errcode='22023';
    end if;
    select coalesce(sum(a.quantity),0)::integer into v_usage_without_row
    from public.attendance a where a.sub_id=v_row.sub_id and a.id<>v_row.id;
    if v_usage_without_row + p_target_quantity > coalesce(v_sub.total_trainings,0) then
      raise exception 'Subscription has no remaining trainings' using errcode='22023';
    end if;
  end if;

  update public.attendance a set quantity=p_target_quantity where a.id=v_row.id returning a.* into v_row;
  if v_row.sub_id is not null then
    perform public.crm_sync_subscription_usage_internal(v_row.sub_id);
  end if;
  insert into public.attendance_quantity_mutations(
    idempotency_key,attendance_id,expected_quantity,target_quantity,created_by
  ) values(p_idempotency_key,p_attendance_id,p_expected_quantity,p_target_quantity,auth.uid());
  return query select v_row.id,v_row.sub_id,v_row.student_id,v_row.date,v_row.guest_name,v_row.guest_type,v_row.group_id,v_row.quantity,v_row.entry_type;
end $$;
revoke all on function public.crm_replace_attendance_quantity(uuid,integer,integer,uuid) from public, anon;
grant execute on function public.crm_replace_attendance_quantity(uuid,integer,integer,uuid) to authenticated;

create table if not exists public.attendance_subscription_conversions (
  idempotency_key uuid primary key,
  subscription_id uuid not null,
  attendance_ids uuid[] not null default '{}',
  created_by uuid not null,
  created_at timestamptz not null default now()
);
alter table public.attendance_subscription_conversions enable row level security;
revoke all on public.attendance_subscription_conversions from public,anon,authenticated;

create or replace function public.crm_admin_convert_unpaid_attendance_to_subscription(
  p_subscription_id uuid,p_idempotency_key uuid
) returns table (
  id uuid,sub_id uuid,student_id uuid,date date,guest_name text,
  guest_type text,group_id text,quantity integer,entry_type text
) language plpgsql security definer set search_path=public as $$
declare
  v_sub public.subscriptions%rowtype;
  v_sub_probe public.subscriptions%rowtype;
  v_previous public.attendance_subscription_conversions%rowtype;
  v_ids uuid[];
  v_candidate_usage integer;
  v_linked_usage integer;
begin
  if auth.uid() is null or not public.rls_is_admin() then
    raise exception 'Administrator required' using errcode='42501';
  end if;
  if p_subscription_id is null or p_idempotency_key is null then
    raise exception 'Subscription and idempotency key are required' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,0));
  select * into v_previous from public.attendance_subscription_conversions c
  where c.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.subscription_id is distinct from p_subscription_id then
      raise exception 'Idempotency key conflict' using errcode='23505';
    end if;
    return query select a.id,a.sub_id,a.student_id,a.date,a.guest_name,a.guest_type,a.group_id,a.quantity,a.entry_type
      from public.attendance a where a.id=any(v_previous.attendance_ids) order by a.date,a.id;
    return;
  end if;

  select * into v_sub_probe from public.subscriptions s where s.id=p_subscription_id;
  if not found then raise exception 'Subscription not found' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|','attendance',v_sub_probe.group_id,v_sub_probe.student_id::text),0));
  select * into v_sub from public.subscriptions s where s.id=p_subscription_id for update;
  if not found then raise exception 'Subscription not found' using errcode='P0002'; end if;

  -- Candidate rows are locked in deterministic order before their quantities
  -- are aggregated. Locks remain held through capacity check, update and sync.
  perform 1 from public.attendance a
  where a.sub_id is null and a.student_id=v_sub.student_id and a.group_id=v_sub.group_id
    and a.date between coalesce(v_sub.activation_date,v_sub.start_date) and v_sub.end_date
    and lower(coalesce(a.entry_type,'')) in ('debt','unpaid')
    and not exists(select 1 from public.subscriptions paid where paid.source_attendance_id=a.id)
  order by a.date,a.id for update;

  select coalesce(array_agg(a.id order by a.date,a.id),'{}'::uuid[]),coalesce(sum(a.quantity),0)::integer
  into v_ids,v_candidate_usage
  from public.attendance a
  where a.sub_id is null and a.student_id=v_sub.student_id and a.group_id=v_sub.group_id
    and a.date between coalesce(v_sub.activation_date,v_sub.start_date) and v_sub.end_date
    and lower(coalesce(a.entry_type,'')) in ('debt','unpaid')
    and not exists(select 1 from public.subscriptions paid where paid.source_attendance_id=a.id);

  select coalesce(sum(a.quantity),0)::integer into v_linked_usage
  from public.attendance a where a.sub_id=p_subscription_id;
  if greatest(coalesce(v_sub.used_trainings,0),v_linked_usage)+v_candidate_usage > coalesce(v_sub.total_trainings,0) then
    raise exception 'Subscription has no capacity for unpaid attendance' using errcode='22023';
  end if;

  update public.attendance a set sub_id=p_subscription_id,entry_type='subscription',guest_name=null,guest_type=null
  where a.id=any(v_ids);
  perform public.crm_sync_subscription_usage_internal(p_subscription_id);
  insert into public.attendance_subscription_conversions(idempotency_key,subscription_id,attendance_ids,created_by)
  values(p_idempotency_key,p_subscription_id,v_ids,auth.uid());
  return query select a.id,a.sub_id,a.student_id,a.date,a.guest_name,a.guest_type,a.group_id,a.quantity,a.entry_type
    from public.attendance a where a.id=any(v_ids) order by a.date,a.id;
end $$;
revoke all on function public.crm_admin_convert_unpaid_attendance_to_subscription(uuid,uuid) from public,anon;
grant execute on function public.crm_admin_convert_unpaid_attendance_to_subscription(uuid,uuid) to authenticated;

create or replace function public.crm_delete_attendance(p_attendance_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_row public.attendance%rowtype; v_probe public.attendance%rowtype; v_sub public.subscriptions%rowtype; v_is_admin boolean;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode='28000'; end if;
  select * into v_probe from public.attendance where id=p_attendance_id;
  if not found then return; end if;
  v_is_admin := public.rls_is_admin();
  if not (v_is_admin or public.rls_owns_group(v_probe.group_id)) then raise exception 'Not allowed' using errcode='42501'; end if;
  if v_probe.student_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(concat_ws('|','attendance',v_probe.group_id,v_probe.student_id::text),0));
  end if;
  -- Serialize every usage-changing operation for this subscription before the
  -- attendance disappears, then calculate from the committed remaining rows.
  if v_probe.sub_id is not null then
    select * into v_sub from public.subscriptions s where s.id=v_probe.sub_id for update;
  end if;
  select * into v_row from public.attendance where id=p_attendance_id for update;
  if not found then return; end if;
  if v_row.student_id is distinct from v_probe.student_id or v_row.group_id is distinct from v_probe.group_id
     or v_row.sub_id is distinct from v_probe.sub_id then
    raise exception 'Attendance changed during delete' using errcode='40001';
  end if;
  delete from public.attendance where id=p_attendance_id;
  if v_row.sub_id is not null then
    perform public.crm_sync_subscription_usage_internal(v_row.sub_id);
  end if;
  -- Deliberately never delete or alter a payment. source_attendance_id remains an audit link.
end $$;
revoke all on function public.crm_delete_attendance(uuid) from public, anon;
grant execute on function public.crm_delete_attendance(uuid) to authenticated;

create or replace function public.crm_relink_guest_attendance(
  p_group_id text, p_student_id uuid, p_attendance_ids uuid[]
) returns table (
  id uuid, sub_id uuid, student_id uuid, date date, guest_name text,
  guest_type text, group_id text, quantity integer, entry_type text
) language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode='28000'; end if;
  if p_student_id is null
     or not exists(select 1 from public.groups g where g.id=p_group_id)
     or not exists(select 1 from public.students s where s.id=p_student_id)
     or not exists(select 1 from public.student_groups sg where sg.student_id=p_student_id and sg.group_id=p_group_id) then
    raise exception 'Student is not linked to group' using errcode='22023';
  end if;
  if not public.rls_is_admin() and not public.rls_can_record_attendance(p_student_id,p_group_id) then
    raise exception 'Student is outside trainer group' using errcode='42501';
  end if;
  return query
  update public.attendance a set student_id=p_student_id,guest_name=null,guest_type=null,sub_id=null,
    entry_type=case when lower(coalesce(a.entry_type,a.guest_type,'')) in ('trial','single')
      then lower(coalesce(a.entry_type,a.guest_type)) else 'debt' end
  where a.id=any(coalesce(p_attendance_ids,'{}')) and a.group_id=p_group_id and a.student_id is null
  returning a.id,a.sub_id,a.student_id,a.date,a.guest_name,a.guest_type,a.group_id,a.quantity,a.entry_type;
end $$;
revoke all on function public.crm_relink_guest_attendance(text,uuid,uuid[]) from public, anon;
grant execute on function public.crm_relink_guest_attendance(text,uuid,uuid[]) to authenticated;

create table if not exists public.guest_conversion_mutations (
  idempotency_key uuid primary key, request_hash text not null, student_id uuid not null,
  created_by uuid not null, created_at timestamptz not null default now()
);
alter table public.guest_conversion_mutations enable row level security;
revoke all on public.guest_conversion_mutations from public, anon, authenticated;

create or replace function public.crm_convert_guest_to_student(
  p_group_id text,p_attendance_ids uuid[],p_name text,p_first_name text,p_last_name text,
  p_phone text,p_telegram text,p_notes text,p_message_template text,p_idempotency_key uuid
) returns setof public.students language plpgsql security definer set search_path=public as $$
declare v_hash text; v_student_id uuid; v_count integer; v_previous public.guest_conversion_mutations%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode='28000'; end if;
  if not (public.rls_is_admin() or public.rls_owns_group(p_group_id)) then raise exception 'Not allowed' using errcode='42501'; end if;
  if p_idempotency_key is null or coalesce(array_length(p_attendance_ids,1),0)=0 or nullif(btrim(p_name),'') is null then
    raise exception 'Invalid guest conversion input' using errcode='22023';
  end if;
  v_hash:=md5(concat_ws('|',p_group_id,array_to_string(p_attendance_ids,','),btrim(p_name),coalesce(p_phone,''),coalesce(p_telegram,'')));
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,0));
  select * into v_previous from public.guest_conversion_mutations gcm where gcm.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.request_hash is distinct from v_hash then raise exception 'Guest conversion idempotency conflict' using errcode='23505'; end if;
    return query select s.* from public.students s where s.id=v_previous.student_id; return;
  end if;
  perform 1 from public.attendance a where a.id=any(p_attendance_ids) for update;
  select count(*)::integer into v_count from public.attendance a
  where a.id=any(p_attendance_ids) and a.group_id=p_group_id and a.student_id is null;
  if v_count<>cardinality(p_attendance_ids) then raise exception 'Guest attendance changed or is outside group' using errcode='40001'; end if;
  select c.id into v_student_id from public.crm_create_student_for_group(
    p_group_id,p_name,p_first_name,p_last_name,p_phone,p_telegram,p_notes,p_message_template
  ) c limit 1;
  if v_student_id is null then raise exception 'Student creation failed'; end if;
  perform public.crm_relink_guest_attendance(p_group_id,v_student_id,p_attendance_ids);
  insert into public.guest_conversion_mutations(idempotency_key,request_hash,student_id,created_by)
  values(p_idempotency_key,v_hash,v_student_id,auth.uid());
  return query select s.* from public.students s where s.id=v_student_id;
end $$;
revoke all on function public.crm_convert_guest_to_student(text,uuid[],text,text,text,text,text,text,text,uuid) from public,anon;
grant execute on function public.crm_convert_guest_to_student(text,uuid[],text,text,text,text,text,text,text,uuid) to authenticated;

-- Admin-only preflight. Legacy paid/card flags are deliberately reported as
-- unverified; they are never treated as evidence that money was received.
create or replace function public.crm_admin_inspect_attendance_payment(p_attendance_id uuid)
returns table (status text, message text, legacy_subscription_id uuid)
language plpgsql stable security definer set search_path = public as $$
declare v_att public.attendance%rowtype; v_legacy public.subscriptions%rowtype; v_count integer; v_type text;
begin
  if auth.uid() is null or not public.rls_is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  if exists(select 1 from public.subscriptions s where s.source_attendance_id=p_attendance_id) then
    return query select 'already_confirmed'::text,'Payment is already confirmed; refresh attendance'::text,null::uuid; return;
  end if;
  select * into v_att from public.attendance a where a.id=p_attendance_id;
  if not found then
    raise exception 'Student attendance not found' using errcode='P0002';
  end if;
  if coalesce(v_att.quantity,1)<>1 then
    return query select 'unsupported_quantity'::text,
      ('Payment confirmation currently supports exactly one training; attendance quantity is '||v_att.quantity::text)::text,null::uuid;
    return;
  end if;
  select count(*)::integer into v_count from public.subscriptions s
  where s.notes=('auto_one_off_from_attendance:'||p_attendance_id::text);
  if v_count=0 then return query select 'clear'::text,null::text,null::uuid; return; end if;
  if v_count>1 then return query select 'ambiguous'::text,'Multiple legacy payments require manual reconciliation'::text,null::uuid; return; end if;
  select * into v_legacy from public.subscriptions s where s.notes=('auto_one_off_from_attendance:'||p_attendance_id::text);
  v_type:=case when lower(coalesce(v_att.entry_type,v_att.guest_type,''))='trial' then 'trial' else 'single' end;
  if v_att.student_id is null or v_legacy.student_id is distinct from v_att.student_id
     or v_legacy.group_id is distinct from v_att.group_id or v_legacy.start_date is distinct from v_att.date
     or v_legacy.end_date is distinct from v_att.date or lower(coalesce(v_legacy.plan_type,''))<>v_type then
    return query select 'mismatch'::text,'Legacy payment does not match attendance and requires manual reconciliation'::text,null::uuid; return;
  end if;
  return query select 'legacy_unverified'::text,
    'Legacy auto-generated payment is not proof of receipt; explicit reconciliation is required'::text,v_legacy.id;
end $$;
revoke all on function public.crm_admin_inspect_attendance_payment(uuid) from public, anon;
grant execute on function public.crm_admin_inspect_attendance_payment(uuid) to authenticated;

-- Explicit administrator-only conversion of an attendance debt into a concrete
-- payment. Locking by source precedes every lookup, so independent connections
-- cannot both observe an absent payment.
drop function if exists public.crm_admin_confirm_attendance_payment(uuid,integer,text,uuid);
drop function if exists public.crm_admin_confirm_attendance_payment(uuid,integer,text,uuid,boolean);
create function public.crm_admin_confirm_attendance_payment(
  p_attendance_id uuid, p_amount integer, p_payment_method text, p_idempotency_key uuid,
  p_reconcile_legacy boolean default false,p_category text default 'other'
) returns table (
  id uuid, student_id uuid, group_id text, plan_type text, start_date date,
  end_date date, total_trainings integer, used_trainings integer, amount integer,
  base_price integer, discount_pct integer, discount_source text, paid boolean,
  pay_method text, created_at timestamptz, source_attendance_id uuid
) language plpgsql security definer set search_path = public as $$
declare
  v_att public.attendance%rowtype; v_att_probe public.attendance%rowtype; v_sub public.subscriptions%rowtype;
  v_key_sub public.subscriptions%rowtype; v_legacy public.subscriptions%rowtype;
  v_type text; v_plan_type text; v_request_hash text; v_legacy_count integer;
begin
  if auth.uid() is null or not public.rls_is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  if p_attendance_id is null or p_amount is null or p_amount <= 0 or p_idempotency_key is null
     or lower(coalesce(p_payment_method,'')) not in ('cash','card','transfer','other')
     or lower(coalesce(p_category,'')) not in ('trial','single','other') then
    raise exception 'Invalid payment input' using errcode='22023';
  end if;
  v_request_hash := md5(concat_ws('|',p_attendance_id::text,p_amount::text,lower(p_payment_method),lower(p_category)));

  -- Source lock must be first: retry remains possible even after attendance deletion.
  perform pg_advisory_xact_lock(hashtextextended('attendance-payment|'||p_attendance_id::text,0));
  select * into v_key_sub from public.subscriptions s where s.financial_idempotency_key=p_idempotency_key;
  if found and (v_key_sub.source_attendance_id is distinct from p_attendance_id
     or v_key_sub.financial_request_hash is distinct from v_request_hash) then
    raise exception 'Payment idempotency conflict' using errcode='23505';
  end if;
  select * into v_sub from public.subscriptions s where s.source_attendance_id=p_attendance_id;
  if found then
    if v_sub.financial_request_hash is distinct from v_request_hash then
      raise exception 'Payment payload conflict for attendance' using errcode='23505';
    end if;
    return query select v_sub.id,v_sub.student_id,v_sub.group_id,v_sub.plan_type,v_sub.start_date,v_sub.end_date,
      v_sub.total_trainings,v_sub.used_trainings,v_sub.amount,v_sub.base_price,v_sub.discount_pct,v_sub.discount_source,
      v_sub.paid,v_sub.pay_method,v_sub.created_at,v_sub.source_attendance_id; return;
  end if;
  if v_key_sub.id is not null then raise exception 'Payment idempotency conflict' using errcode='23505'; end if;

  select * into v_att_probe from public.attendance a where a.id=p_attendance_id;
  if not found or v_att_probe.student_id is null then raise exception 'Student attendance not found' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|','attendance',v_att_probe.group_id,v_att_probe.student_id::text),0));
  select * into v_att from public.attendance a where a.id=p_attendance_id for update;
  if not found or v_att.student_id is null then raise exception 'Student attendance not found' using errcode='P0002'; end if;
  if v_att.student_id is distinct from v_att_probe.student_id or v_att.group_id is distinct from v_att_probe.group_id
     or v_att.sub_id is distinct from v_att_probe.sub_id then
    raise exception 'Attendance changed during payment confirmation' using errcode='40001';
  end if;
  if coalesce(v_att.quantity,1)<>1 then
    raise exception 'Payment confirmation supports exactly one training; split or reconcile multi-unit attendance manually' using errcode='22023';
  end if;
  v_type := lower(coalesce(v_att.entry_type,v_att.guest_type,''));
  if v_type not in ('trial','single','debt','unpaid') then raise exception 'Attendance is not payable debt' using errcode='22023'; end if;
  v_plan_type:=case when lower(p_category) in ('trial','single') then lower(p_category) else 'single' end;

  select count(*)::integer into v_legacy_count from public.subscriptions s
  where s.notes=('auto_one_off_from_attendance:'||p_attendance_id::text);
  if v_legacy_count>1 then raise exception 'Multiple legacy payments require manual reconciliation' using errcode='22023'; end if;
  if v_legacy_count=1 then
    select * into v_legacy from public.subscriptions s where s.notes=('auto_one_off_from_attendance:'||p_attendance_id::text) for update;
    if v_legacy.student_id is distinct from v_att.student_id or v_legacy.group_id is distinct from v_att.group_id
       or v_legacy.start_date is distinct from v_att.date or v_legacy.end_date is distinct from v_att.date
       or lower(coalesce(v_legacy.plan_type,''))<>(case when v_type='trial' then 'trial' else 'single' end) then
      raise exception 'Legacy payment does not match attendance; manual reconciliation required' using errcode='22023';
    end if;
    if not p_reconcile_legacy then
      raise exception 'Legacy auto-generated payment requires explicit reconciliation' using errcode='22023';
    end if;
    update public.subscriptions s set amount=p_amount,base_price=p_amount,paid=true,pay_method=lower(p_payment_method),
      source_attendance_id=p_attendance_id,financial_idempotency_key=p_idempotency_key,
      financial_request_hash=v_request_hash,plan_type=v_plan_type,notes=s.notes||';admin_reconciled:'||lower(p_category)
    where s.id=v_legacy.id returning * into v_sub;
  else
    insert into public.subscriptions(student_id,group_id,plan_type,start_date,end_date,activation_date,original_end_date,
      total_trainings,used_trainings,amount,base_price,discount_pct,discount_source,paid,pay_method,notification_sent,
      notes,source_attendance_id,financial_idempotency_key,financial_request_hash)
    values(v_att.student_id,v_att.group_id,v_plan_type,v_att.date,v_att.date,v_att.date,v_att.date,1,1,p_amount,p_amount,
      0,'studio',true,lower(p_payment_method),false,'admin_confirmed_attendance_payment:'||lower(p_category),v_att.id,p_idempotency_key,v_request_hash)
    returning * into v_sub;
  end if;
  update public.attendance a set sub_id=v_sub.id,entry_type='subscription',guest_name=null,guest_type=null where a.id=v_att.id;
  return query select v_sub.id,v_sub.student_id,v_sub.group_id,v_sub.plan_type,v_sub.start_date,v_sub.end_date,
    v_sub.total_trainings,v_sub.used_trainings,v_sub.amount,v_sub.base_price,v_sub.discount_pct,v_sub.discount_source,
    v_sub.paid,v_sub.pay_method,v_sub.created_at,v_sub.source_attendance_id;
end $$;
revoke all on function public.crm_admin_confirm_attendance_payment(uuid,integer,text,uuid,boolean,text) from public, anon;
grant execute on function public.crm_admin_confirm_attendance_payment(uuid,integer,text,uuid,boolean,text) to authenticated;

commit;
