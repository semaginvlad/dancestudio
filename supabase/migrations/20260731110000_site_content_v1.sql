begin;

create table public.site_pages (
  page_key text primary key,
  is_published boolean not null,
  show_in_navigation boolean not null,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint site_pages_page_key_check check (
    page_key in ('home', 'schedule', 'directions', 'coaches', 'about', 'join', 'directions_quiz')
  ),
  constraint site_pages_navigation_requires_publication_check check (
    not show_in_navigation or is_published
  )
);

create table public.site_direction_profiles (
  direction_id text primary key references public.directions(id),
  public_slug text not null unique,
  publication_status text not null default 'draft',
  show_on_public_site boolean not null default false,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint site_direction_profiles_publication_status_check check (
    publication_status in ('draft', 'published')
  ),
  constraint site_direction_profiles_public_slug_check check (
    public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  )
);

create table public.site_trainer_profiles (
  trainer_id uuid primary key references public.trainers(id),
  publication_status text not null default 'draft',
  show_on_public_site boolean not null default false,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint site_trainer_profiles_publication_status_check check (
    publication_status in ('draft', 'published')
  )
);

insert into public.site_pages (page_key, is_published, show_in_navigation, sort_order)
values
  ('home', true, false, 0),
  ('schedule', true, true, 10),
  ('directions', true, true, 20),
  ('coaches', true, true, 30),
  ('about', true, true, 40),
  ('join', true, false, 50),
  ('directions_quiz', true, false, 60)
on conflict do nothing;

insert into public.site_direction_profiles (
  direction_id, public_slug, publication_status, show_on_public_site, sort_order
)
values
  ('bachata', 'bachata', 'published', true, 10),
  ('dancehall', 'dancehall-female', 'published', true, 20),
  ('heels', 'high-heels', 'published', true, 30),
  ('jazzfunk', 'jazz-funk', 'published', true, 40),
  ('kpop', 'k-pop-cover-dance', 'published', true, 50),
  ('latina', 'latin', 'published', true, 60)
on conflict do nothing;

insert into public.site_trainer_profiles (
  trainer_id, publication_status, show_on_public_site, sort_order
)
values
  ('67c2f1cb-5741-444a-8b37-864800f4bf82', 'published', true, 10),
  ('8d33dcf6-7369-4767-8661-a227870ebf76', 'published', true, 20),
  ('1815b325-41cd-4b8d-b656-f204535ddee4', 'published', true, 30),
  ('f935c6cc-c4af-4053-9015-a09479a3e453', 'draft', false, 40),
  ('89bac4a7-5dd9-4318-85b0-785573aa659d', 'published', true, 50),
  ('78d27840-b703-44c8-b434-b6f1e861affb', 'published', true, 60)
on conflict do nothing;

create function public.set_site_content_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger site_pages_set_updated_at
before update on public.site_pages
for each row execute function public.set_site_content_updated_at();

create trigger site_direction_profiles_set_updated_at
before update on public.site_direction_profiles
for each row execute function public.set_site_content_updated_at();

create trigger site_trainer_profiles_set_updated_at
before update on public.site_trainer_profiles
for each row execute function public.set_site_content_updated_at();

alter table public.site_pages enable row level security;
alter table public.site_direction_profiles enable row level security;
alter table public.site_trainer_profiles enable row level security;

grant select, insert, update, delete on public.site_pages to authenticated;
grant select, insert, update, delete on public.site_direction_profiles to authenticated;
grant select, insert, update, delete on public.site_trainer_profiles to authenticated;

create policy site_pages_admin_select on public.site_pages
for select to authenticated using (public.rls_is_admin());
create policy site_pages_admin_insert on public.site_pages
for insert to authenticated with check (public.rls_is_admin());
create policy site_pages_admin_update on public.site_pages
for update to authenticated using (public.rls_is_admin()) with check (public.rls_is_admin());
create policy site_pages_admin_delete on public.site_pages
for delete to authenticated using (public.rls_is_admin());

create policy site_direction_profiles_admin_select on public.site_direction_profiles
for select to authenticated using (public.rls_is_admin());
create policy site_direction_profiles_admin_insert on public.site_direction_profiles
for insert to authenticated with check (public.rls_is_admin());
create policy site_direction_profiles_admin_update on public.site_direction_profiles
for update to authenticated using (public.rls_is_admin()) with check (public.rls_is_admin());
create policy site_direction_profiles_admin_delete on public.site_direction_profiles
for delete to authenticated using (public.rls_is_admin());

create policy site_trainer_profiles_admin_select on public.site_trainer_profiles
for select to authenticated using (public.rls_is_admin());
create policy site_trainer_profiles_admin_insert on public.site_trainer_profiles
for insert to authenticated with check (public.rls_is_admin());
create policy site_trainer_profiles_admin_update on public.site_trainer_profiles
for update to authenticated using (public.rls_is_admin()) with check (public.rls_is_admin());
create policy site_trainer_profiles_admin_delete on public.site_trainer_profiles
for delete to authenticated using (public.rls_is_admin());

create function public.fetch_public_site_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with visible_directions as (
    select
      d.id as direction_id,
      d.name,
      d.color,
      sdp.public_slug,
      sdp.sort_order
    from public.site_direction_profiles sdp
    join public.directions d on d.id = sdp.direction_id
    where d.is_active = true
      and d.archived_at is null
      and sdp.publication_status = 'published'
      and sdp.show_on_public_site = true
  ),
  visible_trainers as (
    select
      t.id as trainer_id,
      coalesce(
        nullif(btrim(t.name), ''),
        nullif(btrim(concat_ws(' ', t.first_name, t.last_name)), ''),
        'Trainer'
      ) as display_name,
      t.instagram_handle,
      stp.sort_order
    from public.site_trainer_profiles stp
    join public.trainers t on t.id = stp.trainer_id
    where t.is_active = true
      and t.archived_at is null
      and stp.publication_status = 'published'
      and stp.show_on_public_site = true
  )
  select jsonb_build_object(
    'schema_version', 1,
    'pages', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'page_key', sp.page_key,
          'show_in_navigation', sp.show_in_navigation,
          'sort_order', sp.sort_order
        ) order by sp.sort_order, sp.page_key
      )
      from public.site_pages sp
      where sp.is_published = true
    ), '[]'::jsonb),
    'navigation', coalesce((
      select jsonb_agg(
        jsonb_build_object('page_key', sp.page_key, 'sort_order', sp.sort_order)
        order by sp.sort_order, sp.page_key
      )
      from public.site_pages sp
      where sp.is_published = true and sp.show_in_navigation = true
    ), '[]'::jsonb),
    'trainers', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'trainer_id', vt.trainer_id,
          'display_name', vt.display_name,
          'instagram_handle', vt.instagram_handle,
          'direction_ids', coalesce((
            select jsonb_agg(direction_row.direction_id order by direction_row.direction_id)
            from (
              select distinct vd.direction_id
              from public.trainer_groups tg
              join public.groups g on g.id = tg.group_id
              join visible_directions vd on vd.direction_id = g.direction_id
              where tg.trainer_id = vt.trainer_id
                and g.archived_at is null
            ) direction_row
          ), '[]'::jsonb),
          'sort_order', vt.sort_order
        ) order by vt.sort_order, vt.display_name, vt.trainer_id
      )
      from visible_trainers vt
    ), '[]'::jsonb),
    'directions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'direction_id', vd.direction_id,
          'name', vd.name,
          'color', vd.color,
          'public_slug', vd.public_slug,
          'sort_order', vd.sort_order
        ) order by vd.sort_order, vd.name, vd.direction_id
      )
      from visible_directions vd
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.set_site_content_updated_at() from public;
revoke all on function public.fetch_public_site_config() from public;
grant execute on function public.fetch_public_site_config() to anon, authenticated;

commit;
