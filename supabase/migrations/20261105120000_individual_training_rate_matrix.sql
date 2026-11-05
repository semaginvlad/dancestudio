begin;

create table public.individual_training_room_rates (
  room_id uuid not null references public.studio_rooms(id) on delete cascade,
  people_range_code text not null check (people_range_code in ('individual_1_2', 'small_group_3_9', 'group_10_plus')),
  hourly_rate_uah integer not null check (hourly_rate_uah >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (room_id, people_range_code)
);

alter table public.individual_training_room_rates enable row level security;
revoke all on public.individual_training_room_rates from public, anon, authenticated;

-- The existing room-specific hourly rate becomes the 1–2 rate. The other two
-- starting rates are derived from that existing room record, never its name or
-- position. After this seed every cell is independent and keyed by room UUID.
insert into public.individual_training_room_rates(room_id, people_range_code, hourly_rate_uah)
select room.id, ranges.code,
  case ranges.code
    when 'individual_1_2' then room.hourly_rate_uah
    when 'small_group_3_9' then case room.hourly_rate_uah when 500 then 650 when 250 then 350 else room.hourly_rate_uah end
    when 'group_10_plus' then case room.hourly_rate_uah when 500 then 800 when 250 then 500 else room.hourly_rate_uah end
  end
from public.studio_rooms room
cross join (values ('individual_1_2'), ('small_group_3_9'), ('group_10_plus')) ranges(code)
on conflict (room_id, people_range_code) do nothing;

create or replace function public.crm_seed_individual_training_rates_for_room()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.individual_training_room_rates(room_id, people_range_code, hourly_rate_uah)
  values
    (new.id, 'individual_1_2', new.hourly_rate_uah),
    (new.id, 'small_group_3_9', case new.hourly_rate_uah when 500 then 650 when 250 then 350 else new.hourly_rate_uah end),
    (new.id, 'group_10_plus', case new.hourly_rate_uah when 500 then 800 when 250 then 500 else new.hourly_rate_uah end)
  on conflict (room_id, people_range_code) do nothing;
  return new;
end $$;
drop trigger if exists studio_rooms_seed_individual_training_rates on public.studio_rooms;
create trigger studio_rooms_seed_individual_training_rates
after insert on public.studio_rooms for each row execute function public.crm_seed_individual_training_rates_for_room();

-- Legacy booking-type prices remain stored for historical display, but are no
-- longer a selectable source for new trainer events.
update public.room_booking_tariffs set is_active = false, updated_at = now() where is_active is true;

create or replace function public.crm_fetch_individual_training_rate_matrix()
returns table (
  room_id uuid, room_name text, room_is_active boolean,
  people_range_code text, people_range_label text,
  people_min integer, people_max integer, hourly_rate_uah integer
)
language sql stable security definer set search_path = public as $function$
  select room.id, room.name, room.is_active,
    rate.people_range_code,
    case rate.people_range_code
      when 'individual_1_2' then '1–2'
      when 'small_group_3_9' then '3–9'
      when 'group_10_plus' then '10+'
    end,
    case rate.people_range_code when 'individual_1_2' then 1 when 'small_group_3_9' then 3 else 10 end,
    case rate.people_range_code when 'individual_1_2' then 2 when 'small_group_3_9' then 9 else null end,
    case when public.crm_is_admin_session() then rate.hourly_rate_uah else null end
  from public.individual_training_room_rates rate
  join public.studio_rooms room on room.id = rate.room_id
  where (public.crm_is_admin_session() or public.crm_is_active_trainer_session())
    and (room.is_active or public.crm_is_admin_session())
  order by
    case rate.people_range_code when 'individual_1_2' then 1 when 'small_group_3_9' then 2 else 3 end,
    room.sort_order, room.created_at, room.id;
$function$;
revoke execute on function public.crm_fetch_individual_training_rate_matrix() from public, anon;
grant execute on function public.crm_fetch_individual_training_rate_matrix() to authenticated;

create or replace function public.crm_admin_update_individual_training_room_rate(
  p_room_id uuid, p_people_range_code text, p_hourly_rate_uah integer
)
returns integer language plpgsql security definer set search_path = public as $$
begin
  if not public.crm_is_admin_session() then
    raise exception 'Only an administrator may update individual training rates' using errcode = '42501';
  end if;
  if p_people_range_code not in ('individual_1_2', 'small_group_3_9', 'group_10_plus') then
    raise exception 'Unknown people range' using errcode = '22023';
  end if;
  if p_hourly_rate_uah is null or p_hourly_rate_uah < 0 then
    raise exception 'Hourly rate must be a non-negative integer' using errcode = '22023';
  end if;
  if not exists (select 1 from public.studio_rooms where id = p_room_id) then
    raise exception 'Studio room not found' using errcode = 'P0002';
  end if;
  insert into public.individual_training_room_rates(room_id, people_range_code, hourly_rate_uah, updated_at, updated_by)
  values (p_room_id, p_people_range_code, p_hourly_rate_uah, now(), auth.uid())
  on conflict (room_id, people_range_code) do update
    set hourly_rate_uah = excluded.hourly_rate_uah, updated_at = now(), updated_by = auth.uid();
  return p_hourly_rate_uah;
end $$;
revoke execute on function public.crm_admin_update_individual_training_room_rate(uuid, text, integer) from public, anon;
grant execute on function public.crm_admin_update_individual_training_room_rate(uuid, text, integer) to authenticated;

create or replace function public.crm_snapshot_room_booking_hourly_price()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_room_id uuid;
  v_rate integer;
  v_minutes integer;
begin
  if tg_op = 'UPDATE' then
    -- An existing event owns an immutable historical snapshot. Editing its
    -- schedule or changing today's matrix never recalculates that amount.
    new.price := old.price;
    return new;
  end if;

  if current_setting('crm.occurrence_removal_continuation', true) = 'on'
     and public.crm_occurrence_removal_signature(
       new.date, new.start_time, new.end_time, new.room_name, new.recurrence,
       new.recurrence_until, new.status, new.trainer_id::text
     ) = current_setting('crm.occurrence_removal_signature', true)
  then return new; end if;

  if coalesce(new.event_type, '') = 'room_booking' then
    new.booking_type := null;
    new.people_count := null;
    new.price := null;
    return new;
  end if;
  if coalesce(new.event_type, '') <> 'individual_training' then return new; end if;

  new.booking_type := coalesce(nullif(new.booking_type, ''), 'individual_1_2');
  if new.booking_type not in ('individual_1_2', 'small_group_3_9', 'group_10_plus') then
    raise exception 'Unsupported people range for a new individual training' using errcode = '23514';
  end if;

  select room.id into v_room_id
  from public.studio_rooms room
  where public.crm_canonical_room_name(room.name) = public.crm_canonical_room_name(new.room_name)
    and room.is_active is true;
  if v_room_id is null then raise exception 'Active studio room not found' using errcode = '23514'; end if;

  select rate.hourly_rate_uah into v_rate
  from public.individual_training_room_rates rate
  where rate.room_id = v_room_id and rate.people_range_code = new.booking_type;
  if v_rate is null then raise exception 'Individual training rate is not configured' using errcode = '23514'; end if;

  v_minutes := extract(epoch from (new.end_time::time - new.start_time::time))::integer / 60;
  if v_minutes <= 0 then raise exception 'Booking duration must be positive' using errcode = '23514'; end if;
  new.price := round(v_rate::numeric * v_minutes / 60)::integer;
  new.people_count := coalesce(new.people_count,
    case new.booking_type when 'individual_1_2' then 1 when 'small_group_3_9' then 3 else 10 end);
  return new;
end $$;

drop trigger if exists room_bookings_snapshot_hourly_price on public.room_bookings;
create trigger room_bookings_snapshot_hourly_price
before insert or update on public.room_bookings
for each row execute function public.crm_snapshot_room_booking_hourly_price();

commit;
