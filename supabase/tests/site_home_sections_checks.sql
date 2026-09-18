-- Transactional regression checks for fixed home-page sections. No content is persisted.
begin;

select 'home_sections_contract_and_grants' check_name,
  public.fetch_public_site_config()->>'schema_version' = '1'
  and has_function_privilege('authenticated', 'public.admin_update_home_section(text,jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.admin_update_home_section(text,jsonb)', 'execute')
  and not has_table_privilege('anon', 'public.site_pages', 'select') as ok;

select 'normalizer_accepts_all_fixed_sections' check_name,
  bool_and(public.normalize_home_section(section_id, '{"enabled":false}'::jsonb, true) = '{"enabled":false}'::jsonb) as ok
from unnest(array['hero','directions','schedule','team','join_cta','brand_metrics','open_groups','week_pulse']) section_id;

select 'normalizer_strips_unknown_fields_and_empty_text' check_name,
  public.normalize_home_section('hero', '{"title":"  Dance  ","description":" ","url":"https://example.test","brand_notes":{}}', true)
    = '{"title":"Dance"}'::jsonb as ok;

select 'public_sections_only_have_whitelisted_ids_and_fields' check_name,
  not exists (
    select 1
    from jsonb_array_elements(public.fetch_public_site_config()->'pages') page
    cross join lateral jsonb_each(coalesce(page->'content'->'sections', '{}'::jsonb)) section
    cross join lateral jsonb_object_keys(section.value) field
    where page->>'page_key' = 'home'
      and (section.key not in ('hero','directions','schedule','team','join_cta','brand_metrics','open_groups','week_pulse')
        or field not in ('enabled','eyebrow','title','description','primary_cta_label','primary_cta_page_key','secondary_cta_label','secondary_cta_page_key','featured_limit'))
  ) as ok;

-- Exercise the same atomic JSONB expression used by the RPC without requiring an authenticated session.
with original as materialized (
  select content from public.site_pages where page_key = 'home'
), changed as (
  update public.site_pages
  set content = jsonb_set(
    content,
    '{sections}',
    jsonb_set(coalesce(content->'sections', '{}'::jsonb), '{hero}', '{"enabled":false,"title":"Test"}'::jsonb, true),
    true
  )
  where page_key = 'home'
  returning content
)
select 'atomic_section_patch_preserves_sibling_and_legacy_content' check_name,
  changed.content->>'logo_url' is not distinct from original.content->>'logo_url'
  and changed.content->>'title' is not distinct from original.content->>'title'
  and (changed.content->'sections' - 'hero') is not distinct from (original.content->'sections' - 'hero')
  and changed.content->'sections'->'hero'->>'enabled' = 'false' as ok
from original, changed;

update public.site_pages
set content = jsonb_set(content, '{sections}', '{"hero":{"enabled":"false"},"team":{"enabled":true,"title":" Team "},"brand_notes":{"title":"private"}}'::jsonb, true)
where page_key = 'home';

select 'malformed_section_does_not_break_public_config' check_name,
  coalesce(home.content->'sections'->'team'->>'title', '') = 'Team'
  and not (home.content->'sections' ? 'hero')
  and not (home.content->'sections' ? 'brand_notes') as ok
from (
  select page->'content' content
  from jsonb_array_elements(public.fetch_public_site_config()->'pages') page
  where page->>'page_key' = 'home'
) home;

rollback;
