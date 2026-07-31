-- Read-only V1 verification. Every row should return ok = true after applying
-- 20260801091000_site_inquiries_v1.sql in a non-production verification DB.

select 'site_inquiries_columns_and_types' as check_name,
  count(*) = 37
  and bool_and(
    case column_name
      when 'id' then data_type = 'uuid'
      when 'direction_id' then data_type = 'text'
      when 'group_id' then data_type = 'text'
      when 'trainer_id' then data_type = 'uuid'
      when 'converted_waitlist_id' then data_type = 'uuid'
      when 'converted_trial_booking_id' then data_type = 'uuid'
      when 'converted_student_id' then data_type = 'uuid'
      else true
    end
  ) as ok
from information_schema.columns
where table_schema = 'public' and table_name = 'site_inquiries';

select 'site_inquiries_rls_enabled_and_no_direct_api_privileges' as check_name,
  c.relrowsecurity
  and not has_table_privilege('anon', 'public.site_inquiries', 'select')
  and not has_table_privilege('anon', 'public.site_inquiries', 'insert')
  and not has_table_privilege('anon', 'public.site_inquiries', 'update')
  and not has_table_privilege('anon', 'public.site_inquiries', 'delete')
  and not has_table_privilege('authenticated', 'public.site_inquiries', 'select')
  and not has_table_privilege('authenticated', 'public.site_inquiries', 'insert')
  and not has_table_privilege('authenticated', 'public.site_inquiries', 'update')
  and not has_table_privilege('authenticated', 'public.site_inquiries', 'delete') as ok
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'site_inquiries';

select 'site_inquiries_admin_rpc_only' as check_name,
  not has_function_privilege('anon', 'public.crm_fetch_site_inquiries(text,text)', 'execute')
  and not has_function_privilege('anon', 'public.crm_update_site_inquiry(uuid,text,text,boolean,boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.crm_fetch_site_inquiries(text,text)', 'execute')
  and has_function_privilege('authenticated', 'public.crm_update_site_inquiry(uuid,text,text,boolean,boolean)', 'execute')
  and pg_get_functiondef('public.crm_fetch_site_inquiries(text,text)'::regprocedure) like '%public.rls_is_admin()%'
  and pg_get_functiondef('public.crm_update_site_inquiry(uuid,text,text,boolean,boolean)'::regprocedure) like '%public.rls_is_admin()%'
  as ok;

select 'site_inquiries_constraints_present' as check_name,
  count(*) = 11 as ok
from pg_catalog.pg_constraint c
join pg_catalog.pg_class r on r.oid = c.conrelid
join pg_catalog.pg_namespace n on n.oid = r.relnamespace
where n.nspname = 'public' and r.relname = 'site_inquiries'
  and c.conname in (
    'site_inquiries_status_check',
    'site_inquiries_preferred_contact_check',
    'site_inquiries_name_check',
    'site_inquiries_contact_required_check',
    'site_inquiries_lengths_check',
    'site_inquiries_utm_object_check',
    'site_inquiries_submission_count_check',
    'site_inquiries_single_conversion_check',
    'site_inquiries_conversion_status_check',
    'site_inquiries_converted_at_check',
    'site_inquiries_duplicate_not_self_check'
  );

select 'site_inquiries_has_no_sensitive_submission_fields' as check_name,
  count(*) = 0 as ok
from information_schema.columns
where table_schema = 'public' and table_name = 'site_inquiries'
  and column_name in ('ip', 'ip_address', 'turnstile_token', 'service_role_key', 'secret', 'api_key');

select 'site_inquiries_conversion_foreign_keys' as check_name,
  count(*) = 3 as ok
from pg_catalog.pg_constraint c
join pg_catalog.pg_class child on child.oid = c.conrelid
join pg_catalog.pg_namespace n on n.oid = child.relnamespace
join pg_catalog.pg_class parent on parent.oid = c.confrelid
where n.nspname = 'public' and child.relname = 'site_inquiries' and c.contype = 'f'
  and parent.relname in ('waitlist', 'trial_bookings', 'students');
