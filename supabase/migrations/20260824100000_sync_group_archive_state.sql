-- Make CRM archive state and the public website use the same contract.
-- is_active is the canonical state for existing rows; archived_at is kept in sync
-- for legacy/admin code that still reads it.

begin;

update public.groups
set archived_at = case
  when coalesce(is_active, true) is false then coalesce(archived_at, pg_catalog.now())
  else null
end
where (coalesce(is_active, true) is false and archived_at is null)
   or (coalesce(is_active, true) is true and archived_at is not null);

create or replace function public.sync_group_archive_state()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    if new.archived_at is not null then
      new.is_active := false;
    elsif coalesce(new.is_active, true) is false then
      new.archived_at := pg_catalog.now();
    else
      new.is_active := true;
      new.archived_at := null;
    end if;
    return new;
  end if;

  if new.is_active is distinct from old.is_active then
    if coalesce(new.is_active, true) is false then
      new.archived_at := coalesce(new.archived_at, pg_catalog.now());
    else
      new.archived_at := null;
    end if;
  elsif new.archived_at is distinct from old.archived_at then
    new.is_active := new.archived_at is null;
  end if;

  return new;
end;
$function$;

drop trigger if exists groups_sync_archive_state on public.groups;
create trigger groups_sync_archive_state
before insert or update of is_active, archived_at on public.groups
for each row execute function public.sync_group_archive_state();

create or replace function public.fetch_public_schedule(
  p_date_from date,
  p_date_to date
)
returns table (
  id text,
  group_id text,
  group_name text,
  direction_id text,
  direction_name text,
  level text,
  age_category text,
  date date,
  weekday integer,
  start_time time,
  end_time time,
  join_status text,
  trainer_name text,
  substitute_trainer_name text,
  room_name text,
  title text,
  status text,
  change_type text,
  original_start_time time,
  original_end_time time
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_date_from is null or p_date_to is null then
    raise exception using
      errcode = '22004',
      message = 'p_date_from and p_date_to must not be null';
  end if;

  if p_date_from > p_date_to then
    raise exception using
      errcode = '22007',
      message = 'p_date_from must be on or before p_date_to';
  end if;

  if (p_date_to - p_date_from) > 30 then
    raise exception using
      errcode = '22023',
      message = 'date range must not exceed 31 calendar days';
  end if;

  return query
  with
  public_groups as (
    select
      g.id::text as group_id,
      g.name::text as group_name,
      g.direction_id::text as direction_id,
      coalesce(
        (
          select tg.trainer_id::text
          from public.trainer_groups as tg
          where tg.group_id::text = g.id::text
          order by coalesce(tg.is_primary, false) desc, tg.trainer_id::text
          limit 1
        ),
        nullif(g.trainer_id::text, '')
      ) as group_trainer_id,
      g.public_level::text as level,
      g.age_category::text as age_category,
      g.public_join_status::text as join_status,
      g.start_date,
      g.schedule
    from public.groups as g
    where g.show_on_public_site is true
      and coalesce(g.is_active, true) is true
      and g.archived_at is null
      and nullif(pg_catalog.btrim(g.public_level), '') is not null
      and nullif(pg_catalog.btrim(g.age_category), '') is not null
  ),
  raw_slots as (
    select
      g.*,
      slot.value as slot,
      (slot.ordinality - 1)::integer as slot_index,
      coalesce(
        slot.value ->> 'weekday',
        slot.value ->> 'dayOfWeek',
        slot.value ->> 'day',
        slot.value ->> 'dow',
        slot.value ->> 'weekDay'
      ) as weekday_raw,
      coalesce(
        nullif(slot.value ->> 'startTime', ''),
        nullif(slot.value ->> 'start', ''),
        nullif(pg_catalog.split_part(slot.value ->> 'time', '-', 1), '')
      ) as start_raw,
      coalesce(
        nullif(slot.value ->> 'endTime', ''),
        nullif(slot.value ->> 'end', ''),
        case when position('-' in coalesce(slot.value ->> 'time', '')) > 0
          then nullif(substring(slot.value ->> 'time' from position('-' in slot.value ->> 'time') + 1), '')
        end
      ) as end_raw,
      coalesce(
        nullif(pg_catalog.btrim(slot.value ->> 'trainerId'), ''),
        nullif(pg_catalog.btrim(slot.value ->> 'trainer_id'), ''),
        nullif(pg_catalog.btrim(slot.value ->> 'trainer'), ''),
        g.group_trainer_id
      ) as base_trainer_id
    from public_groups as g
    cross join lateral pg_catalog.jsonb_array_elements(
      case
        when pg_catalog.jsonb_typeof(g.schedule) = 'array' then g.schedule
        else '[]'::jsonb
      end
    ) with ordinality as slot(value, ordinality)
    where pg_catalog.jsonb_typeof(slot.value) = 'object'
  ),
  normalized_slot_text as (
    select
      r.*,
      pg_catalog.lower(pg_catalog.btrim(r.weekday_raw)) as weekday_key,
      pg_catalog.regexp_replace(pg_catalog.replace(pg_catalog.btrim(r.start_raw), '.', ':'), '\s+', '', 'g') as start_key,
      pg_catalog.regexp_replace(pg_catalog.replace(pg_catalog.btrim(r.end_raw), '.', ':'), '\s+', '', 'g') as end_key
    from raw_slots as r
  ),
  parsed_slots as (
    select
      n.*,
      case
        when n.weekday_key ~ '^\d+$' then
          case
            when n.weekday_key::integer between 0 and 6 then n.weekday_key::integer
            when n.weekday_key::integer = 7 then 0
          end
        when n.weekday_key in ('mon', 'monday', 'пн') then 1
        when n.weekday_key in ('tue', 'tuesday', 'вт') then 2
        when n.weekday_key in ('wed', 'wednesday', 'ср') then 3
        when n.weekday_key in ('thu', 'thursday', 'чт') then 4
        when n.weekday_key in ('fri', 'friday', 'пт') then 5
        when n.weekday_key in ('sat', 'saturday', 'сб') then 6
        when n.weekday_key in ('sun', 'sunday', 'нд') then 0
      end as js_weekday,
      case
        when n.start_key ~ '^\d{1,2}$' then
          case when n.start_key::integer between 0 and 23
            then n.start_key::integer * 60
          end
        when n.start_key ~ '^\d{1,2}:\d{1,2}$' then
          case
            when pg_catalog.split_part(n.start_key, ':', 1)::integer between 0 and 23
              and pg_catalog.split_part(n.start_key, ':', 2)::integer between 0 and 59
            then pg_catalog.split_part(n.start_key, ':', 1)::integer * 60
               + pg_catalog.split_part(n.start_key, ':', 2)::integer
          end
      end as start_minute,
      case
        when n.end_key ~ '^\d{1,2}$' then
          case when n.end_key::integer between 0 and 23
            then n.end_key::integer * 60
          end
        when n.end_key ~ '^\d{1,2}:\d{1,2}$' then
          case
            when pg_catalog.split_part(n.end_key, ':', 1)::integer between 0 and 23
              and pg_catalog.split_part(n.end_key, ':', 2)::integer between 0 and 59
            then pg_catalog.split_part(n.end_key, ':', 1)::integer * 60
               + pg_catalog.split_part(n.end_key, ':', 2)::integer
          end
      end as end_minute
    from normalized_slot_text as n
  ),
  concrete_lessons as (
    select
      s.*,
      (p_date_from + offsets.day_offset) as lesson_date,
      coalesce(s.end_minute, s.start_minute + 60) as effective_base_end_minute
    from parsed_slots as s
    cross join lateral pg_catalog.generate_series(0, p_date_to - p_date_from) as offsets(day_offset)
    where s.js_weekday is not null
      and s.start_minute is not null
      and (s.start_date is null or (p_date_from + offsets.day_offset) >= s.start_date)
      and s.js_weekday = case
        when extract(isodow from (p_date_from + offsets.day_offset))::integer = 7 then 0
        else extract(isodow from (p_date_from + offsets.day_offset))::integer
      end
  ),
  base_lessons as (
    select
      c.*,
      pg_catalog.make_time((c.start_minute / 60)::integer, (c.start_minute % 60)::integer, 0) as base_start_time,
      pg_catalog.make_time((c.effective_base_end_minute / 60)::integer, (c.effective_base_end_minute % 60)::integer, 0) as base_end_time,
      coalesce(
        nullif(pg_catalog.btrim(c.slot ->> 'title'), ''),
        nullif(pg_catalog.btrim(c.slot ->> 'name'), ''),
        nullif(pg_catalog.btrim(c.slot ->> 'label'), ''),
        c.group_name
      ) as base_title,
      coalesce(
        (
          select sr.name
          from public.studio_rooms as sr
          where sr.id::text = coalesce(
            nullif(pg_catalog.btrim(c.slot ->> 'roomId'), ''),
            nullif(pg_catalog.btrim(c.slot ->> 'room_id'), '')
          )
          limit 1
        ),
        nullif(pg_catalog.btrim(c.slot ->> 'roomName'), ''),
        nullif(pg_catalog.btrim(c.slot ->> 'room_name'), ''),
        nullif(pg_catalog.btrim(c.slot ->> 'room'), ''),
        nullif(pg_catalog.btrim(c.slot ->> 'location'), ''),
        nullif(pg_catalog.btrim(c.slot ->> 'hall'), '')
      ) as base_room_name
    from concrete_lessons as c
    where c.effective_base_end_minute > c.start_minute
      and c.effective_base_end_minute < 1440
  ),
  normalized_override_text as (
    select
      o.*,
      pg_catalog.regexp_replace(pg_catalog.replace(pg_catalog.btrim(o.start_time), '.', ':'), '\s+', '', 'g') as start_key,
      pg_catalog.regexp_replace(pg_catalog.replace(pg_catalog.btrim(o.end_time), '.', ':'), '\s+', '', 'g') as end_key
    from public.group_lesson_overrides as o
    where o.date between p_date_from and p_date_to
  ),
  parsed_overrides as (
    select
      o.*,
      case
        when o.start_key ~ '^\d{1,2}:\d{1,2}$' then
          case
            when pg_catalog.split_part(o.start_key, ':', 1)::integer between 0 and 23
              and pg_catalog.split_part(o.start_key, ':', 2)::integer between 0 and 59
            then pg_catalog.make_time(
              pg_catalog.split_part(o.start_key, ':', 1)::integer,
              pg_catalog.split_part(o.start_key, ':', 2)::integer,
              0
            )
          end
      end as normalized_start_time,
      case
        when o.end_key ~ '^\d{1,2}:\d{1,2}$' then
          case
            when pg_catalog.split_part(o.end_key, ':', 1)::integer between 0 and 23
              and pg_catalog.split_part(o.end_key, ':', 2)::integer between 0 and 59
            then pg_catalog.make_time(
              pg_catalog.split_part(o.end_key, ':', 1)::integer,
              pg_catalog.split_part(o.end_key, ':', 2)::integer,
              0
            )
          end
      end as normalized_end_time
    from normalized_override_text as o
  ),
  override_candidates as (
    select
      b.*,
      o.status as override_status,
      o.room_name as override_room_name,
      o.title as override_title,
      o.trainer_id as override_trainer_id,
      case when o.status = 'active'
        then coalesce(o.normalized_start_time, b.base_start_time)
        else b.base_start_time
      end as candidate_start_time,
      case when o.status = 'active'
        then coalesce(o.normalized_end_time, b.base_end_time)
        else b.base_end_time
      end as candidate_end_time
    from base_lessons as b
    left join parsed_overrides as o
      on o.group_id::text = b.group_id
      and o.date = b.lesson_date
      and o.slot_index = b.slot_index
  ),
  effective_lessons as (
    select
      c.*,
      case
        when c.candidate_end_time > c.candidate_start_time then c.candidate_start_time
        else c.base_start_time
      end as effective_start_time,
      case
        when c.candidate_end_time > c.candidate_start_time then c.candidate_end_time
        else c.base_end_time
      end as effective_end_time
    from override_candidates as c
  )
  select
    e.group_id || ':' || e.lesson_date::text || ':' || e.slot_index::text as id,
    e.group_id,
    e.group_name,
    e.direction_id,
    d.name::text as direction_name,
    e.level,
    e.age_category,
    e.lesson_date as date,
    extract(isodow from e.lesson_date)::integer as weekday,
    e.effective_start_time as start_time,
    e.effective_end_time as end_time,
    e.join_status,
    base_trainer.name::text as trainer_name,
    case
      when e.override_status = 'active'
        and e.override_trainer_id is not null
        and e.override_trainer_id::text is distinct from e.base_trainer_id
      then substitute_trainer.name::text
    end as substitute_trainer_name,
    case when e.override_status = 'active'
      then coalesce(nullif(pg_catalog.btrim(e.override_room_name), ''), e.base_room_name)
      else e.base_room_name
    end as room_name,
    case when e.override_status = 'active'
      then coalesce(nullif(pg_catalog.btrim(e.override_title), ''), e.base_title)
      else e.base_title
    end as title,
    case
      when e.override_status = 'cancelled' or cancellation.is_cancelled then 'cancelled'
      else 'active'
    end as status,
    case
      when e.override_status = 'cancelled' or cancellation.is_cancelled then 'cancelled'
      when e.override_status = 'active'
        and (e.effective_start_time is distinct from e.base_start_time
          or e.effective_end_time is distinct from e.base_end_time)
      then 'rescheduled'
    end as change_type,
    case
      when e.override_status = 'active'
        and (e.effective_start_time is distinct from e.base_start_time
          or e.effective_end_time is distinct from e.base_end_time)
      then e.base_start_time
    end as original_start_time,
    case
      when e.override_status = 'active'
        and (e.effective_start_time is distinct from e.base_start_time
          or e.effective_end_time is distinct from e.base_end_time)
      then e.base_end_time
    end as original_end_time
  from effective_lessons as e
  left join public.directions as d on d.id::text = e.direction_id
  left join public.trainers as base_trainer on base_trainer.id::text = e.base_trainer_id
  left join public.trainers as substitute_trainer on substitute_trainer.id = e.override_trainer_id
  left join lateral (
    select true as is_cancelled
    from public.cancelled_trainings as ct
    where ct.group_id::text = e.group_id
      and ct.date = e.lesson_date
      and (ct.slot_index is null or ct.slot_index = e.slot_index)
    limit 1
  ) as cancellation on true
  order by e.lesson_date, e.effective_start_time, e.group_name, e.slot_index;
end;
$function$;

revoke all on function public.fetch_public_schedule(date, date) from public;
grant execute on function public.fetch_public_schedule(date, date) to anon;
grant execute on function public.fetch_public_schedule(date, date) to authenticated;

comment on function public.fetch_public_schedule(date, date) is
  'Safe public projection of concrete group lessons for an inclusive range of at most 31 days.';


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
      'direction_ids', coalesce((select jsonb_agg(direction_row.direction_id order by direction_row.direction_id) from (select distinct vd.direction_id from public.trainer_groups tg join public.groups g on g.id = tg.group_id join visible_directions vd on vd.direction_id = g.direction_id where tg.trainer_id = vt.trainer_id and coalesce(g.is_active, true) is true and g.archived_at is null) direction_row), '[]'::jsonb),
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

