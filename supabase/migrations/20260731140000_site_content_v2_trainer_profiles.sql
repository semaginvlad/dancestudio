begin;

alter table public.site_trainer_profiles
  add column public_name text,
  add column role_label text,
  add column main_direction_name text,
  add column hero_label text,
  add column profile_eyebrow text,
  add column main_direction_eyebrow text,
  add column main_direction_detail_eyebrow text,
  add column profile_summary text,
  add column video_summary text,
  add column empty_portrait_summary text,
  add column primary_cta_label text,
  add column secondary_cta_label text,
  add column profile_sections jsonb,
  add constraint site_trainer_profiles_profile_sections_array_check
    check (profile_sections is null or jsonb_typeof(profile_sections) = 'array');

create or replace function public.fetch_public_site_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with visible_directions as (
    select d.id as direction_id, d.name, d.color, sdp.public_slug, sdp.sort_order
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
  )
  select jsonb_build_object(
    'schema_version', 1,
    'pages', coalesce((select jsonb_agg(jsonb_build_object('page_key', sp.page_key, 'show_in_navigation', sp.show_in_navigation, 'sort_order', sp.sort_order) order by sp.sort_order, sp.page_key) from public.site_pages sp where sp.is_published = true), '[]'::jsonb),
    'navigation', coalesce((select jsonb_agg(jsonb_build_object('page_key', sp.page_key, 'sort_order', sp.sort_order) order by sp.sort_order, sp.page_key) from public.site_pages sp where sp.is_published = true and sp.show_in_navigation = true), '[]'::jsonb),
    'trainers', coalesce((select jsonb_agg(jsonb_build_object(
      'trainer_id', vt.trainer_id, 'display_name', vt.display_name, 'instagram_handle', vt.instagram_handle,
      'direction_ids', coalesce((select jsonb_agg(direction_row.direction_id order by direction_row.direction_id) from (select distinct vd.direction_id from public.trainer_groups tg join public.groups g on g.id = tg.group_id join visible_directions vd on vd.direction_id = g.direction_id where tg.trainer_id = vt.trainer_id and g.archived_at is null) direction_row), '[]'::jsonb),
      'sort_order', vt.sort_order,
      'content', jsonb_build_object(
        'public_name', vt.public_name, 'role_label', vt.role_label, 'main_direction_name', vt.main_direction_name,
        'hero_label', vt.hero_label, 'profile_eyebrow', vt.profile_eyebrow,
        'main_direction_eyebrow', vt.main_direction_eyebrow,
        'main_direction_detail_eyebrow', vt.main_direction_detail_eyebrow,
        'profile_summary', vt.profile_summary, 'video_summary', vt.video_summary,
        'empty_portrait_summary', vt.empty_portrait_summary, 'primary_cta_label', vt.primary_cta_label,
        'secondary_cta_label', vt.secondary_cta_label, 'profile_sections', vt.profile_sections
      )
    ) order by vt.sort_order, vt.display_name, vt.trainer_id) from visible_trainers vt), '[]'::jsonb),
    'directions', coalesce((select jsonb_agg(jsonb_build_object('direction_id', vd.direction_id, 'name', vd.name, 'color', vd.color, 'public_slug', vd.public_slug, 'sort_order', vd.sort_order) order by vd.sort_order, vd.name, vd.direction_id) from visible_directions vd), '[]'::jsonb)
  );
$$;

revoke all on function public.fetch_public_site_config() from public;
grant execute on function public.fetch_public_site_config() to anon, authenticated;

commit;
