begin;

-- Strict shared normalizer: public reads skip malformed sections, while admin writes reject them.
create or replace function public.normalize_home_section(
  p_section_id text,
  p_section_content jsonb,
  p_strict boolean default true
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_allowed_sections constant text[] := array['hero','directions','schedule','team','join_cta','brand_metrics','open_groups','week_pulse'];
  v_cta_keys constant text[] := array['schedule','directions','coaches','about','join','directions_quiz'];
  v_allowed_fields text[];
  v_text_fields constant text[] := array['eyebrow','title','description','primary_cta_label','secondary_cta_label'];
  v_field text;
  v_value text;
  v_result jsonb := '{}'::jsonb;
  v_limit numeric;
begin
  if not (p_section_id = any(v_allowed_sections)) then
    raise exception 'Unknown home section';
  end if;
  if p_section_content is null or jsonb_typeof(p_section_content) <> 'object' then
    raise exception 'Home section must be an object';
  end if;

  v_allowed_fields := case p_section_id
    when 'hero' then array['enabled','eyebrow','title','description','primary_cta_label','primary_cta_page_key','secondary_cta_label','secondary_cta_page_key']
    when 'directions' then array['enabled','eyebrow','title','description','primary_cta_label','primary_cta_page_key','featured_limit']
    when 'schedule' then array['enabled','eyebrow','title','description','primary_cta_label','primary_cta_page_key','secondary_cta_label','secondary_cta_page_key']
    when 'team' then array['enabled','eyebrow','title','description','primary_cta_label','primary_cta_page_key']
    when 'join_cta' then array['enabled','eyebrow','title','description','primary_cta_label','primary_cta_page_key','secondary_cta_label','secondary_cta_page_key']
    when 'brand_metrics' then array['enabled','title']
    when 'open_groups' then array['enabled','title','description']
    when 'week_pulse' then array['enabled','title']
  end;

  if p_section_content ? 'enabled' then
    if jsonb_typeof(p_section_content->'enabled') <> 'boolean' then raise exception 'enabled must be boolean'; end if;
    v_result := jsonb_set(v_result, '{enabled}', p_section_content->'enabled');
  end if;

  foreach v_field in array v_text_fields loop
    if v_field = any(v_allowed_fields) and p_section_content ? v_field then
      if jsonb_typeof(p_section_content->v_field) not in ('string','null') then raise exception '% must be text', v_field; end if;
      v_value := nullif(btrim(p_section_content->>v_field), '');
      if v_value is not null then v_result := jsonb_set(v_result, array[v_field], to_jsonb(v_value)); end if;
    end if;
  end loop;

  foreach v_field in array array['primary_cta_page_key','secondary_cta_page_key'] loop
    if v_field = any(v_allowed_fields) and p_section_content ? v_field then
      if jsonb_typeof(p_section_content->v_field) not in ('string','null') then raise exception '% must be text', v_field; end if;
      v_value := nullif(btrim(p_section_content->>v_field), '');
      if v_value is not null and not (v_value = any(v_cta_keys)) then raise exception 'Unknown CTA page key'; end if;
      if v_value is not null then v_result := jsonb_set(v_result, array[v_field], to_jsonb(v_value)); end if;
    end if;
  end loop;

  if 'featured_limit' = any(v_allowed_fields) and p_section_content ? 'featured_limit' then
    if jsonb_typeof(p_section_content->'featured_limit') = 'null' then
      null;
    elsif jsonb_typeof(p_section_content->'featured_limit') <> 'number' then
      raise exception 'featured_limit must be an integer';
    else
      v_limit := (p_section_content->>'featured_limit')::numeric;
      if v_limit <> trunc(v_limit) or v_limit < 1 or v_limit > 6 then raise exception 'featured_limit must be between 1 and 6'; end if;
      v_result := jsonb_set(v_result, '{featured_limit}', to_jsonb(v_limit::integer));
    end if;
  end if;
  return v_result;
exception when others then
  if p_strict then raise; end if;
  return null;
end;
$$;

create or replace function public.admin_update_home_section(p_section_id text, p_section_content jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_content jsonb;
  v_sections jsonb;
  v_section jsonb;
begin
  if auth.uid() is null or not public.rls_is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  v_section := public.normalize_home_section(p_section_id, p_section_content, true);
  select content into v_content from public.site_pages where page_key = 'home' for update;
  if not found then raise exception 'Home page is not configured'; end if;
  v_sections := case when jsonb_typeof(v_content->'sections') = 'object' then v_content->'sections' else '{}'::jsonb end;
  v_sections := case when v_section = '{}'::jsonb then v_sections - p_section_id else jsonb_set(v_sections, array[p_section_id], v_section, true) end;
  v_content := case when v_sections = '{}'::jsonb then v_content - 'sections' else jsonb_set(v_content, '{sections}', v_sections, true) end;
  update public.site_pages set content = v_content where page_key = 'home' returning content into v_content;
  return v_content;
end;
$$;

create or replace function public.admin_update_home_logo(p_logo_url text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_content jsonb;
begin
  if auth.uid() is null or not public.rls_is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  select content into v_content from public.site_pages where page_key = 'home' for update;
  if not found then raise exception 'Home page is not configured'; end if;
  v_content := case when nullif(btrim(p_logo_url), '') is null then v_content - 'logo_url' else jsonb_set(v_content, '{logo_url}', to_jsonb(btrim(p_logo_url)), true) end;
  update public.site_pages set content = v_content where page_key = 'home' returning content into v_content;
  return v_content;
end;
$$;

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
          'logo_url', nullif(btrim(sp.content->>'logo_url'), ''),
          'sections', jsonb_strip_nulls(jsonb_build_object(
            'hero', public.normalize_home_section('hero', sp.content->'sections'->'hero', false),
            'directions', public.normalize_home_section('directions', sp.content->'sections'->'directions', false),
            'schedule', public.normalize_home_section('schedule', sp.content->'sections'->'schedule', false),
            'team', public.normalize_home_section('team', sp.content->'sections'->'team', false),
            'join_cta', public.normalize_home_section('join_cta', sp.content->'sections'->'join_cta', false),
            'brand_metrics', public.normalize_home_section('brand_metrics', sp.content->'sections'->'brand_metrics', false),
            'open_groups', public.normalize_home_section('open_groups', sp.content->'sections'->'open_groups', false),
            'week_pulse', public.normalize_home_section('week_pulse', sp.content->'sections'->'week_pulse', false)
          ))
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
    'branding', jsonb_build_object(
      'logo_url', (select nullif(btrim(sp.content->>'logo_url'), '')
                   from public.site_pages sp where sp.page_key = 'home')
    ),
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

revoke all on function public.normalize_home_section(text, jsonb, boolean) from public;
revoke all on function public.admin_update_home_section(text, jsonb) from public;
revoke all on function public.admin_update_home_logo(text) from public;
revoke all on function public.fetch_public_site_config() from public;
grant execute on function public.admin_update_home_section(text, jsonb) to authenticated;
grant execute on function public.admin_update_home_logo(text) to authenticated;
grant execute on function public.fetch_public_site_config() to anon, authenticated;

commit;
