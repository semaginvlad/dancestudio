-- Read-only verification queries. Each row should return ok = true.

select 'three_site_tables_exist' as check_name,
       count(*) = 3 as ok
from information_schema.tables
where table_schema = 'public'
  and table_name in ('site_pages', 'site_direction_profiles', 'site_trainer_profiles');

select 'seven_page_seeds_are_exact' as check_name,
       count(*) = 7
       and array_agg(page_key order by page_key) = array[
         'about', 'coaches', 'directions', 'directions_quiz', 'home', 'join', 'schedule'
       ]::text[] as ok
from public.site_pages;

select 'page_seed_values_are_exact' as check_name,
       bool_and(actual = expected) and count(*) = 7 as ok
from (
  select row(page_key, is_published, show_in_navigation, sort_order) as actual,
         row(expected.page_key, expected.is_published, expected.show_in_navigation, expected.sort_order) as expected
  from public.site_pages
  full join (values
    ('home', true, false, 0), ('schedule', true, true, 10),
    ('directions', true, true, 20), ('coaches', true, true, 30),
    ('about', true, true, 40), ('join', true, false, 50),
    ('directions_quiz', true, false, 60)
  ) expected(page_key, is_published, show_in_navigation, sort_order) using (page_key)
) rows_to_check;

select 'six_direction_seeds_and_slugs_are_exact' as check_name,
       count(*) = 6 and bool_and(actual_slug = expected_slug) as ok
from (
  select sdp.direction_id, sdp.public_slug as actual_slug, expected.public_slug as expected_slug
  from public.site_direction_profiles sdp
  full join (values
    ('bachata', 'bachata'), ('dancehall', 'dancehall-female'),
    ('heels', 'high-heels'), ('jazzfunk', 'jazz-funk'),
    ('kpop', 'k-pop-cover-dance'), ('latina', 'latin')
  ) expected(direction_id, public_slug) using (direction_id)
) rows_to_check;

select 'six_trainer_profiles_are_seeded' as check_name,
       count(*) = 6
       and count(*) filter (where trainer_id in (
         '67c2f1cb-5741-444a-8b37-864800f4bf82',
         '8d33dcf6-7369-4767-8661-a227870ebf76',
         '1815b325-41cd-4b8d-b656-f204535ddee4',
         'f935c6cc-c4af-4053-9015-a09479a3e453',
         '89bac4a7-5dd9-4318-85b0-785573aa659d',
         '78d27840-b703-44c8-b434-b6f1e861affb'
       )) = 6 as ok
from public.site_trainer_profiles;

select 'archived_alina_is_not_effectively_visible' as check_name,
       not exists (
         select 1
         from public.site_trainer_profiles stp
         join public.trainers t on t.id = stp.trainer_id
         where stp.trainer_id = 'f935c6cc-c4af-4053-9015-a09479a3e453'
           and t.is_active = true
           and t.archived_at is null
           and stp.publication_status = 'published'
           and stp.show_on_public_site = true
       ) as ok;

select 'navigation_requires_publication' as check_name,
       not exists (
         select 1 from public.site_pages
         where show_in_navigation and not is_published
       ) as ok;

select 'direction_effective_visibility_is_enforced' as check_name,
       not exists (
         select 1
         from jsonb_array_elements(public.fetch_public_site_config() -> 'directions') item
         left join public.site_direction_profiles sdp on sdp.direction_id = item ->> 'direction_id'
         left join public.directions d on d.id = sdp.direction_id
         where d.is_active is not true
            or d.archived_at is not null
            or sdp.publication_status <> 'published'
            or sdp.show_on_public_site is not true
       ) as ok;

select 'trainer_effective_visibility_is_enforced' as check_name,
       not exists (
         select 1
         from jsonb_array_elements(public.fetch_public_site_config() -> 'trainers') item
         left join public.site_trainer_profiles stp on stp.trainer_id = (item ->> 'trainer_id')::uuid
         left join public.trainers t on t.id = stp.trainer_id
         where t.is_active is not true
            or t.archived_at is not null
            or stp.publication_status <> 'published'
            or stp.show_on_public_site is not true
       ) as ok;

select 'public_slugs_are_unique' as check_name,
       count(*) = count(distinct public_slug) as ok
from public.site_direction_profiles;

select 'rls_is_enabled_on_site_tables' as check_name,
       count(*) = 3 and bool_and(relrowsecurity) as ok
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('site_pages', 'site_direction_profiles', 'site_trainer_profiles');

select 'anon_has_no_direct_select' as check_name,
       bool_and(not has_table_privilege('anon', format('public.%I', table_name), 'select')) as ok
from (values ('site_pages'), ('site_direction_profiles'), ('site_trainer_profiles')) tables(table_name);

select 'rpc_execute_roles_are_correct' as check_name,
       has_function_privilege('anon', 'public.fetch_public_site_config()', 'execute')
       and has_function_privilege('authenticated', 'public.fetch_public_site_config()', 'execute') as ok;

select 'rpc_metadata_is_hardened' as check_name,
       p.prosecdef
       and p.provolatile = 's'
       and coalesce(array_to_string(p.proconfig, ','), '') ~ '^search_path=(""|)$' as ok
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fetch_public_site_config';

select 'rpc_has_no_forbidden_fields' as check_name,
       not (public.fetch_public_site_config()::text ~* '"(phone|email|telegram|notes|auth_user_id|access_disabled_at|trainer_pct|amount|student_id)"') as ok;

select 'rpc_arrays_have_deterministic_sort_order' as check_name,
       bool_and(coalesce(current_sort, -2147483648) <= coalesce(next_sort, 2147483647)) as ok
from (
  select section,
         (item ->> 'sort_order')::integer as current_sort,
         lead((item ->> 'sort_order')::integer) over (partition by section order by ordinal) as next_sort
  from (values ('pages'), ('navigation'), ('trainers'), ('directions')) sections(section)
  cross join lateral jsonb_array_elements(public.fetch_public_site_config() -> section) with ordinality rows(item, ordinal)
) ordered_rows;

select 'trainer_direction_ids_are_visible_and_not_archived' as check_name,
       not exists (
         select 1
         from jsonb_array_elements(public.fetch_public_site_config() -> 'trainers') trainer
         cross join lateral jsonb_array_elements_text(trainer -> 'direction_ids') direction_id
         left join public.site_direction_profiles sdp on sdp.direction_id = direction_id
         left join public.directions d on d.id = direction_id
         where sdp.publication_status <> 'published'
            or sdp.show_on_public_site is not true
            or d.is_active is not true
            or d.archived_at is not null
            or not exists (
              select 1
              from public.trainer_groups tg
              join public.groups g on g.id = tg.group_id
              where tg.trainer_id = (trainer ->> 'trainer_id')::uuid
                and g.direction_id = direction_id
                and g.archived_at is null
            )
       ) as ok;
