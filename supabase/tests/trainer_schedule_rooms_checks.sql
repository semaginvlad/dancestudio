-- Read-only catalog checks. Run after 20260917090000_fix_trainer_schedule_rooms.sql.
begin;

do $checks$
declare
  v_result text;
  v_definition text;
begin
  select pg_get_function_result('public.crm_fetch_schedule_room_bookings()'::regprocedure)
    into v_result;
  if position('room_name text' in v_result) = 0 then
    raise exception 'booking RPC does not return room_name: %', v_result;
  end if;

  select pg_get_functiondef('public.crm_fetch_schedule_room_bookings()'::regprocedure)
    into v_definition;
  if position('t.auth_user_id = auth.uid()' in v_definition) = 0 then
    raise exception 'booking ownership is not linked through trainers.auth_user_id';
  end if;
  if position('then v.price else null' in v_definition) = 0
     or position('then v.note else null' in v_definition) = 0
     or position('then v.description else null' in v_definition) = 0 then
    raise exception 'foreign booking private fields are not masked';
  end if;

  select pg_get_function_result('public.crm_fetch_active_studio_rooms()'::regprocedure)
    into v_result;
  if v_result <> 'TABLE(id uuid, name text, is_active boolean, sort_order integer, created_at timestamp with time zone)' then
    raise exception 'studio room RPC has an unexpected surface: %', v_result;
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'studio_rooms'
      and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ) then
    -- Grants may exist for admin operations, so the policy must remain canonical.
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'studio_rooms'
        and policyname = 'studio_rooms_admin_mutations'
        and coalesce(with_check, '') like '%crm_is_admin_session%'
    ) then
      raise exception 'studio room mutations are not restricted to admin sessions';
    end if;
  end if;
end;
$checks$;

rollback;
