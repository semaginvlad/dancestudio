-- Execute after 20261005090000_harden_financial_attendance_boundary.sql against a
-- disposable Supabase database. All fixture changes are rolled back.
begin;

do $checks$
declare
  v_group text;
  v_student uuid := 'f1000000-0000-0000-0000-000000000001';
  v_trainer uuid := 'f1000000-0000-0000-0000-000000000002';
  v_trainer_user uuid := 'f1000000-0000-0000-0000-000000000003';
  v_admin_user uuid := 'f1000000-0000-0000-0000-000000000004';
  v_key uuid := 'f1000000-0000-0000-0000-000000000005';
  v_payment_key uuid := 'f1000000-0000-0000-0000-000000000006';
  v_attendance uuid;
  v_again uuid;
  v_payment uuid;
  v_count bigint;
  v_json text;
begin
  select id into v_group from public.groups where coalesce(archived_at, 'infinity'::timestamptz) > now() limit 1;
  if v_group is null then raise exception 'financial boundary test requires one group fixture'; end if;

  insert into public.students(id,name) values(v_student,'Financial boundary test') on conflict (id) do nothing;
  insert into public.student_groups(student_id,group_id) values(v_student,v_group) on conflict do nothing;
  insert into public.trainers(id,name,auth_user_id,is_active,archived_at,access_disabled_at)
    values(v_trainer,'Financial boundary trainer',v_trainer_user,true,null,null) on conflict (id) do update
    set auth_user_id=excluded.auth_user_id,is_active=true,archived_at=null,access_disabled_at=null;
  insert into public.trainer_groups(trainer_id,group_id,is_primary)
    values(v_trainer,v_group,true) on conflict (trainer_id,group_id) do nothing;

  -- anon cannot call either supported mutation RPC.
  execute 'set local role anon';
  perform set_config('request.jwt.claims','{}',true);
  begin
    perform public.crm_record_attendance(null,v_student,current_date,null,null,v_group,1,'trial',v_key);
    raise exception 'anon attendance RPC unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  execute 'reset role';

  -- An active trainer cannot mutate subscription finance directly and receives
  -- only the operational projection.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_trainer_user,'email','trainer@test.invalid')::text,true);
  update public.subscriptions set amount=999999 where false;
  select coalesce(jsonb_agg(x)::text,'[]') into v_json from public.crm_fetch_my_attendance_subscriptions() x;
  if v_json ~* 'amount|base_price|paid|pay_method|discount|notes' then raise exception 'trainer subscription RPC leaks finance'; end if;

  select id into v_attendance from public.crm_record_attendance(null,v_student,current_date,null,null,v_group,1,'trial',v_key);
  select id into v_again from public.crm_record_attendance(null,v_student,current_date,null,null,v_group,1,'trial',v_key);
  if v_attendance is distinct from v_again then raise exception 'attendance idempotency failed'; end if;
  select count(*) into v_count from public.subscriptions where source_attendance_id=v_attendance;
  if v_count <> 0 then raise exception 'trainer attendance manufactured a payment'; end if;
  begin
    perform public.crm_admin_confirm_attendance_payment(v_attendance,150,'card',v_payment_key);
    raise exception 'trainer payment confirmation unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  execute 'reset role';

  -- An inactive trainer loses the operational mutation immediately.
  update public.trainers set is_active=false where id=v_trainer;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_trainer_user,'email','trainer@test.invalid')::text,true);
  begin
    perform public.crm_record_attendance(null,v_student,current_date,null,null,v_group,1,'single',gen_random_uuid());
    raise exception 'inactive trainer attendance unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  update public.trainers set is_active=true where id=v_trainer;

  -- The canonical administrator helper, not metadata.role, authorizes payment.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin_user,'email','semagin.vlad@gmail.com','user_metadata',jsonb_build_object('role','trainer'))::text,true);
  if not public.rls_is_admin() then raise exception 'test admin is not recognized by canonical helper'; end if;
  select id into v_payment from public.crm_admin_confirm_attendance_payment(v_attendance,150,'cash',v_payment_key);
  perform public.crm_admin_confirm_attendance_payment(v_attendance,150,'cash',v_payment_key);
  select count(*) into v_count from public.subscriptions where source_attendance_id=v_attendance;
  if v_count <> 1 then raise exception 'concurrent/idempotent payment constraint failed'; end if;
  execute 'reset role';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_trainer_user,'email','trainer@test.invalid')::text,true);
  with changed as (update public.subscriptions set amount=999999 where id=v_payment returning 1)
  select count(*) into v_count from changed;
  if v_count <> 0 then raise exception 'trainer directly changed subscription finance'; end if;
  execute 'reset role';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin_user,'email','semagin.vlad@gmail.com')::text,true);
  perform public.crm_delete_attendance(v_attendance);
  if not exists(select 1 from public.subscriptions where id=v_payment) then raise exception 'attendance deletion removed confirmed payment'; end if;
  execute 'reset role';

  if not exists(select 1 from public.financial_change_audit where table_name='subscriptions' and row_id=v_payment::text and operation='INSERT') then
    raise exception 'financial audit row missing';
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.room_bookings'::regclass and tgname='room_bookings_financial_guard' and not tgisinternal) then
    raise exception 'booking financial guard missing';
  end if;
end $checks$;

rollback;
