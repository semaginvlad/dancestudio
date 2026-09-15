-- Transactional regression check: no persisted page or branding data is changed.
begin;

update public.site_pages
set is_published = false,
    show_in_navigation = false,
    content = jsonb_set(content, '{logo_url}', '"https://example.test/unpublished-home-logo.png"')
where page_key = 'home';

select 'unpublished_home_is_excluded_but_branding_remains_public' check_name,
  not exists (
    select 1
    from jsonb_array_elements(public.fetch_public_site_config()->'pages') page
    where page->>'page_key' = 'home'
  )
  and public.fetch_public_site_config()->'branding'->>'logo_url'
      = 'https://example.test/unpublished-home-logo.png' as ok;

rollback;
