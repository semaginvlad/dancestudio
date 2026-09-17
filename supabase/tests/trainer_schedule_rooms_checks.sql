-- Read-only catalog checks. Run after 20260917090000_fix_trainer_schedule_rooms.sql.
begin;

do $checks$
declare
  v_result text;
  v_definition text;
  v_owned_count integer;
  v_foreign_private_count integer;
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
  if position('rb.trainer_id::text = auth.uid()::text' in v_definition) = 0 then
    raise exception 'booking ownership does not support auth-user trainer_id values';
  end if;
  if position('t.id::text = rb.trainer_id::text' in v_definition) = 0 then
    raise exception 'booking ownership does not support trainer-profile trainer_id values';
  end if;
  if position('t.is_active is true' in v_definition) = 0
     or position('t.archived_at is null' in v_definition) = 0
     or position('t.access_disabled_at is null' in v_definition) = 0 then
    raise exception 'booking ownership is not restricted to an active trainer';
  end if;
  if position('then v.price else null' in v_definition) = 0
     or position('then v.note else null' in v_definition) = 0
     or position('then v.description else null' in v_definition) = 0 then
    raise exception 'foreign booking private fields are not masked';
  end if;

  -- Synthetic, read-only regression matrix for both historical trainer_id
  -- formats and a foreign booking. This mirrors the RPC ownership predicate
  -- without inserting or changing business data.
  with actor as (
    select '10000000-0000-0000-0000-000000000001'::uuid as auth_user_id
  ), trainers as (
    select
      '20000000-0000-0000-0000-000000000001'::uuid as id,
      actor.auth_user_id,
      true as is_active,
      null::timestamptz as archived_at,
      null::timestamptz as access_disabled_at
    from actor
  ), bookings as (
    select 'auth-id' as fixture, actor.auth_user_id::text as trainer_id, 100 as price, 'own auth note'::text as note from actor
    union all
    select 'profile-id', trainers.id::text, 200, 'own profile note' from trainers
    union all
    select 'foreign', '30000000-0000-0000-0000-000000000001', 300, 'foreign note'
  ), resolved as (
    select
      b.fixture,
      case when exists (
        select 1
        from trainers t cross join actor a
        where t.auth_user_id = a.auth_user_id
          and (b.trainer_id = a.auth_user_id::text or t.id::text = b.trainer_id)
          and t.is_active is true
          and t.archived_at is null
          and t.access_disabled_at is null
      ) then b.price else null end as visible_price,
      case when exists (
        select 1
        from trainers t cross join actor a
        where t.auth_user_id = a.auth_user_id
          and (b.trainer_id = a.auth_user_id::text or t.id::text = b.trainer_id)
          and t.is_active is true
          and t.archived_at is null
          and t.access_disabled_at is null
      ) then b.note else null end as visible_note
    from bookings b
  )
  select
    count(*) filter (where fixture in ('auth-id', 'profile-id') and visible_price is not null and visible_note is not null),
    count(*) filter (where fixture = 'foreign' and (visible_price is not null or visible_note is not null))
  into v_owned_count, v_foreign_private_count
  from resolved;

  if v_owned_count <> 2 then
    raise exception 'one or more supported trainer_id formats were not recognized as owned';
  end if;
  if v_foreign_private_count <> 0 then
    raise exception 'foreign booking private fields were exposed';
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
