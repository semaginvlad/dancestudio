begin;

-- Public, cacheable branding asset. This migration is additive and safe to re-run.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-assets', 'site-assets', true, 2097152, array['image/png']::text[])
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists site_assets_public_read on storage.objects;
create policy site_assets_public_read on storage.objects
for select to public
using (bucket_id = 'site-assets');

drop policy if exists site_assets_admin_insert on storage.objects;
create policy site_assets_admin_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'site-assets' and name = 'branding/header-logo.png' and public.rls_is_admin());

drop policy if exists site_assets_admin_update on storage.objects;
create policy site_assets_admin_update on storage.objects
for update to authenticated
using (bucket_id = 'site-assets' and name = 'branding/header-logo.png' and public.rls_is_admin())
with check (bucket_id = 'site-assets' and name = 'branding/header-logo.png' and public.rls_is_admin());

drop policy if exists site_assets_admin_delete on storage.objects;
create policy site_assets_admin_delete on storage.objects
for delete to authenticated
using (bucket_id = 'site-assets' and name = 'branding/header-logo.png' and public.rls_is_admin());

create or replace function public.fetch_public_site_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with visible_directions as (
    select d.id as direction_id, d.name, d.color, sdp.public_slug, sdp.sort_order,
      jsonb_strip_nulls(jsonb_build_object(
        'eyebrow', nullif(btrim(sdp.content->>'eyebrow'), ''),
        'title', nullif(btrim(sdp.content->>'title'), ''),
        'subtitle', nullif(btrim(sdp.content->>'subtitle'), ''),
        'description', nullif(btrim(sdp.content->>'description'), ''),
        'primary_cta_label', nullif(btrim(sdp.content->>'primaryCtaLabel'), ''),
        'secondary_cta_label', nullif(btrim(sdp.content->>'secondaryCtaLabel'), '')
      )) as content
    from public.site_direction_profiles sdp
    join public.directions d on d.id = sdp.direction_id
    where d.is_active = true and d.archived_at is null
      and sdp.publication_status = 'published' and sdp.show_on_public_site = true
  ),
  visible_trainers as (
    select t.id as trainer_id,
      coalesce(nullif(btrim(t.name), ''), nullif(btrim(concat_ws(' ', t.first_name, t.last_name)), ''), 'Trainer') as display_name,
      t.instagram_handle, stp.sort_order,
      stp.public_name, stp.role_label, stp.main_direction_name, stp.hero_label,
      stp.profile_eyebrow, stp.main_direction_eyebrow, stp.main_direction_detail_eyebrow,
      stp.profile_summary, stp.video_summary, stp.empty_portrait_summary,
      stp.primary_cta_label, stp.secondary_cta_label, stp.profile_sections
    from public.site_trainer_profiles stp
    join public.trainers t on t.id = stp.trainer_id
    where t.is_active = true and t.archived_at is null
      and stp.publication_status = 'published' and stp.show_on_public_site = true
  ),
  public_pages as (
    select sp.*,
      case sp.page_key
        when 'home' then jsonb_strip_nulls(jsonb_build_object(
          'eyebrow', nullif(btrim(sp.content->>'eyebrow'), ''), 'title', nullif(btrim(sp.content->>'title'), ''),
          'subtitle', nullif(btrim(sp.content->>'subtitle'), ''), 'description', nullif(btrim(sp.content->>'description'), ''),
          'primary_cta_label', nullif(btrim(sp.content->>'primaryCtaLabel'), ''),
          'secondary_cta_label', nullif(btrim(sp.content->>'secondaryCtaLabel'), ''),
          'logo_url', nullif(btrim(sp.content->>'logo_url'), '')
        ))
        when 'schedule' then jsonb_strip_nulls(jsonb_build_object(
          'eyebrow', nullif(btrim(sp.content->>'eyebrow'), ''), 'title', nullif(btrim(sp.content->>'title'), ''),
          'city', nullif(btrim(sp.content->>'city'), ''), 'studio_label', nullif(btrim(sp.content->>'studioLabel'), ''),
          'city_studio_label', nullif(btrim(sp.content->>'cityStudioLabel'), ''),
          'base_title', nullif(btrim(sp.content->>'baseTitle'), ''), 'base_label', nullif(btrim(sp.content->>'baseLabel'), ''),
          'base_description', nullif(btrim(sp.content->>'baseDescription'), ''),
          'mix_title', nullif(btrim(sp.content->>'mixTitle'), ''), 'mix_label', nullif(btrim(sp.content->>'mixLabel'), ''),
          'mix_description', nullif(btrim(sp.content->>'mixDescription'), ''),
          'load_error_message', nullif(btrim(sp.content->>'loadErrorMessage'), ''),
          'empty_schedule_message', nullif(btrim(sp.content->>'emptyScheduleMessage'), '')
        ))
        else jsonb_strip_nulls(jsonb_build_object(
          'eyebrow', nullif(btrim(sp.content->>'eyebrow'), ''), 'title', nullif(btrim(sp.content->>'title'), ''),
          'subtitle', nullif(btrim(sp.content->>'subtitle'), ''), 'description', nullif(btrim(sp.content->>'description'), ''),
          'primary_cta_label', nullif(btrim(sp.content->>'primaryCtaLabel'), ''),
          'secondary_cta_label', nullif(btrim(sp.content->>'secondaryCtaLabel'), '')
        ))
      end as public_content
    from public.site_pages sp
    where sp.is_published = true
  )
  select jsonb_build_object(
    'schema_version', 1,
    'pages', coalesce((select jsonb_agg(jsonb_build_object(
      'page_key', pp.page_key, 'show_in_navigation', pp.show_in_navigation,
      'sort_order', pp.sort_order, 'content', pp.public_content
    ) order by pp.sort_order, pp.page_key) from public_pages pp), '[]'::jsonb),
    'navigation', coalesce((select jsonb_agg(jsonb_build_object('page_key', pp.page_key, 'sort_order', pp.sort_order) order by pp.sort_order, pp.page_key) from public_pages pp where pp.show_in_navigation = true), '[]'::jsonb),
    'trainers', coalesce((select jsonb_agg(jsonb_build_object(
      'trainer_id', vt.trainer_id, 'display_name', vt.display_name, 'instagram_handle', vt.instagram_handle,
      'direction_ids', coalesce((select jsonb_agg(direction_row.direction_id order by direction_row.direction_id) from (select distinct vd.direction_id from public.trainer_groups tg join public.groups g on g.id = tg.group_id join visible_directions vd on vd.direction_id = g.direction_id where tg.trainer_id = vt.trainer_id and g.archived_at is null) direction_row), '[]'::jsonb),
      'sort_order', vt.sort_order,
      'content', jsonb_build_object(
        'public_name', vt.public_name, 'role_label', vt.role_label, 'main_direction_name', vt.main_direction_name,
        'hero_label', vt.hero_label, 'profile_eyebrow', vt.profile_eyebrow,
        'main_direction_eyebrow', vt.main_direction_eyebrow, 'main_direction_detail_eyebrow', vt.main_direction_detail_eyebrow,
        'profile_summary', vt.profile_summary, 'video_summary', vt.video_summary,
        'empty_portrait_summary', vt.empty_portrait_summary, 'primary_cta_label', vt.primary_cta_label,
        'secondary_cta_label', vt.secondary_cta_label, 'profile_sections', vt.profile_sections
      )
    ) order by vt.sort_order, vt.display_name, vt.trainer_id) from visible_trainers vt), '[]'::jsonb),
    'directions', coalesce((select jsonb_agg(jsonb_build_object(
      'direction_id', vd.direction_id, 'name', vd.name, 'color', vd.color,
      'public_slug', vd.public_slug, 'sort_order', vd.sort_order, 'content', vd.content
    ) order by vd.sort_order, vd.name, vd.direction_id) from visible_directions vd), '[]'::jsonb)
  );
$$;

revoke all on function public.fetch_public_site_config() from public;
grant execute on function public.fetch_public_site_config() to anon, authenticated;

commit;
