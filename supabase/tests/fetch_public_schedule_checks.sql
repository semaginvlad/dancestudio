-- Read-only checks for public.fetch_public_schedule(). Run against a local database
-- after migrations. No statement in this file changes data, schema, roles, or policies.

-- Ordinary output and multiple slots. Results are observational and depend on the
-- existing local data; zero rows alone does not mean pass or fail.
select *
from public.fetch_public_schedule(current_date, current_date + 30)
order by date, start_time, id;

select group_id, date, count(*) as slot_count
from public.fetch_public_schedule(current_date, current_date + 30)
group by group_id, date
having count(*) > 1;

-- Override observations. Zero rows may simply mean that the local database has no
-- matching reschedule, substitution, or cancelled override in this date range.
select *
from public.fetch_public_schedule(current_date, current_date + 30)
where change_type = 'rescheduled'
  and original_start_time is not null
  and original_end_time is not null;

select *
from public.fetch_public_schedule(current_date, current_date + 30)
where substitute_trainer_name is not null;

select r.*
from public.fetch_public_schedule(current_date, current_date + 30) as r
join public.group_lesson_overrides as o
  on r.id = o.group_id::text || ':' || o.date::text || ':' || o.slot_index::text
where o.status = 'cancelled'
  and r.status = 'cancelled'
  and r.change_type = 'cancelled';

select r.*
from public.fetch_public_schedule(current_date, current_date + 30) as r
where r.status = 'cancelled'
  and r.change_type = 'cancelled'
  and exists (
    select 1
    from public.cancelled_trainings as ct
    where ct.group_id::text = r.group_id
      and ct.date = r.date
      and (
        ct.slot_index is null
        or r.id = ct.group_id::text || ':' || ct.date::text || ':' || ct.slot_index::text
      )
  );

-- Visibility regression: this query must return zero rows.
select r.*
from public.fetch_public_schedule(current_date, current_date + 30) as r
join public.groups as g on g.id::text = r.group_id
where g.show_on_public_site is not true
   or g.archived_at is not null
   or nullif(pg_catalog.btrim(g.public_level), '') is null
   or nullif(pg_catalog.btrim(g.age_category), '') is null;

-- Group launch regression: this query must return zero rows. Groups without a
-- start_date intentionally retain their historical recurring schedule.
select r.*
from public.fetch_public_schedule(current_date, current_date + 30) as r
join public.groups as g on g.id::text = r.group_id
where g.start_date is not null
  and r.date < g.start_date;

-- Grants and security metadata. These checks intentionally run before the expected
-- error statements at the bottom of the file.
select
  pg_catalog.has_function_privilege(
    'anon',
    'public.fetch_public_schedule(date,date)',
    'EXECUTE'
  ) as anon_can_execute_rpc;

select
  internal_tables.table_name,
  pg_catalog.has_table_privilege(
    'anon',
    pg_catalog.format('public.%I', internal_tables.table_name),
    'SELECT'
  ) as anon_can_select
from (values
  ('groups'),
  ('directions'),
  ('trainers'),
  ('group_lesson_overrides'),
  ('cancelled_trainings')
) as internal_tables(table_name);

select
  pg_catalog.pg_get_function_result(
    'public.fetch_public_schedule(date,date)'::pg_catalog.regprocedure
  ) as response_columns,
  p.prosecdef as security_definer,
  p.provolatile = 's' as stable,
  p.proconfig as function_settings,
  not exists (
    select 1
    from pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) as privilege
    where privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ) as public_execute_revoked,
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.fetch_public_schedule(date,date)',
    'EXECUTE'
  ) as authenticated_can_execute
from pg_catalog.pg_proc as p
where p.oid = 'public.fetch_public_schedule(date,date)'::pg_catalog.regprocedure;

-- EXPECTED ERROR; run this statement separately: inverted range must be rejected.
select * from public.fetch_public_schedule(current_date, current_date - 1);

-- EXPECTED ERROR; run this statement separately: 32 calendar days must be rejected.
select * from public.fetch_public_schedule(current_date, current_date + 31);
