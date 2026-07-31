-- Read-only Site Content V2 verification. Every row should return ok = true.
select 'v2_columns_exist_and_are_nullable' check_name,
  count(*) = 13 and bool_and(is_nullable = 'YES') as ok
from information_schema.columns
where table_schema = 'public' and table_name = 'site_trainer_profiles'
  and column_name in ('public_name','role_label','main_direction_name','hero_label','profile_eyebrow','main_direction_eyebrow','main_direction_detail_eyebrow','profile_summary','video_summary','empty_portrait_summary','primary_cta_label','secondary_cta_label','profile_sections');

select 'profile_sections_array_check_exists' check_name, count(*) = 1 as ok
from pg_catalog.pg_constraint c
join pg_catalog.pg_class r on r.oid = c.conrelid
join pg_catalog.pg_namespace n on n.oid = r.relnamespace
where n.nspname = 'public' and r.relname = 'site_trainer_profiles'
  and c.conname = 'site_trainer_profiles_profile_sections_array_check'
  and pg_get_constraintdef(c.oid) like '%jsonb_typeof(profile_sections) = ''array''%';

select 'no_v2_demo_content_seeded' check_name,
  count(*) = 6 and bool_and(public_name is null and role_label is null and main_direction_name is null and hero_label is null and profile_eyebrow is null and main_direction_eyebrow is null and main_direction_detail_eyebrow is null and profile_summary is null and video_summary is null and empty_portrait_summary is null and primary_cta_label is null and secondary_cta_label is null and profile_sections is null) as ok
from public.site_trainer_profiles;

select 'trainer_profiles_rls_and_admin_policies_unchanged' check_name,
  c.relrowsecurity and (select count(*) = 4 and bool_and(qual like '%rls_is_admin%' or with_check like '%rls_is_admin%') from pg_policies where schemaname='public' and tablename='site_trainer_profiles') as ok
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='site_trainer_profiles';

select 'anon_table_select_revoked_rpc_execute_preserved' check_name,
  bool_and(not has_table_privilege('anon', format('public.%I', table_name), 'select'))
  and has_function_privilege('anon', 'public.fetch_public_site_config()', 'execute') as ok
from (values
  ('site_pages'),
  ('site_direction_profiles'),
  ('site_trainer_profiles')
) as site_tables(table_name);

with config as (select public.fetch_public_site_config() value), trainers as (
  select item from config cross join lateral jsonb_array_elements(value->'trainers') item
)
select 'rpc_v1_and_additive_content_shape' check_name,
  (select value->>'schema_version' = '1' and value ?& array['pages','navigation','trainers','directions'] from config)
  and coalesce(bool_and(item ?& array['trainer_id','display_name','instagram_handle','direction_ids','sort_order','content']
    and (item->'content') ?& array['public_name','role_label','main_direction_name','hero_label','profile_eyebrow','main_direction_eyebrow','main_direction_detail_eyebrow','profile_summary','video_summary','empty_portrait_summary','primary_cta_label','secondary_cta_label','profile_sections']), true) as ok
from trainers;

select 'rpc_has_no_private_contact_fields' check_name,
  not (public.fetch_public_site_config()::text ~* '"(phone|email|telegram|notes|auth_user_id|access_disabled_at|trainer_pct|amount|student_id)"') as ok;

select 'rpc_security_is_hardened' check_name,
  p.prosecdef and p.provolatile='s' and coalesce(array_to_string(p.proconfig,','),'') ~ '^search_path=(""|)$'
  and has_function_privilege('anon','public.fetch_public_site_config()','execute')
  and has_function_privilege('authenticated','public.fetch_public_site_config()','execute') as ok
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='fetch_public_site_config';
