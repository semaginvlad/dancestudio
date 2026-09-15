-- Read-only Site Content V3 verification. Every row should return ok = true.
select 'page_and_direction_content_are_safe_objects' check_name,
  count(*) = 2 and bool_and(data_type = 'jsonb' and is_nullable = 'NO') as ok
from information_schema.columns
where table_schema = 'public' and
  (table_name, column_name) in (('site_pages', 'content'), ('site_direction_profiles', 'content'));

select 'empty_content_keeps_v1_shape' check_name,
  (public.fetch_public_site_config() ?& array['schema_version','pages','navigation','trainers','directions'])
  and public.fetch_public_site_config()->>'schema_version' = '1' as ok;

select 'public_content_has_no_unknown_or_private_keys' check_name,
  not exists (
    select 1 from (
      select page->'content' content from jsonb_array_elements(public.fetch_public_site_config()->'pages') page
      union all
      select direction->'content' from jsonb_array_elements(public.fetch_public_site_config()->'directions') direction
    ) rows
    cross join lateral jsonb_object_keys(rows.content) key
    where key not in ('eyebrow','title','subtitle','description','primary_cta_label','secondary_cta_label',
      'city','studio_label','city_studio_label','base_title','base_label','base_description',
      'mix_title','mix_label','mix_description','load_error_message','empty_schedule_message','logo_url')
  ) as ok;

select 'rpc_grants_remain_minimal' check_name,
  has_function_privilege('anon','public.fetch_public_site_config()','execute')
  and has_function_privilege('authenticated','public.fetch_public_site_config()','execute')
  and not has_table_privilege('anon','public.site_pages','select')
  and not has_table_privilege('anon','public.site_direction_profiles','select') as ok;

select 'home_logo_url_is_the_only_public_logo_key' check_name,
  not exists (
    select 1
    from jsonb_array_elements(public.fetch_public_site_config()->'pages') page
    cross join lateral jsonb_object_keys(page->'content') key
    where key like '%logo%' and key <> 'logo_url'
  ) as ok;

select 'site_logo_bucket_is_public_and_png_limited' check_name,
  exists (select 1 from storage.buckets where id = 'site-assets' and public = true
    and file_size_limit = 2097152 and allowed_mime_types = array['image/png']::text[]) as ok;
