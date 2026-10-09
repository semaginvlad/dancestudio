-- STAGING ONLY — manual bootstrap for a brand-new, empty Supabase project.
-- Never run against production. This file contains schema and non-personal
-- reference seeds only. It intentionally contains no users, students, contacts,
-- payments, secrets, API keys, or passwords.
--
-- Source order (snapshot generated 2026-10-09):
--   1. normalized empty core from schema.sql + current client-required columns
--   2. historical foundations/RPCs listed in STAGING_RUNBOOK.md
--   3. every supabase/migrations migration in filename order
-- The final section is the unmodified current financial hardening migration.

DO $staging_empty_guard$
BEGIN
  IF to_regclass('public.students') IS NOT NULL
     OR to_regclass('public.subscriptions') IS NOT NULL
     OR to_regclass('public.attendance') IS NOT NULL THEN
    RAISE EXCEPTION 'STAGING bootstrap requires a new empty project; core tables already exist';
  END IF;
END $staging_empty_guard$;

create extension if not exists pgcrypto;

create table public.directions(id text primary key,name text not null,color text,is_active boolean not null default true,archived_at timestamptz,created_at timestamptz not null default now());
create table public.trainers(id uuid primary key default gen_random_uuid(),name text not null,first_name text,last_name text,phone text,telegram text,instagram text,instagram_handle text,auth_user_id uuid unique,is_active boolean not null default true,archived_at timestamptz,access_disabled_at timestamptz,created_at timestamptz not null default now());
create table public.groups(id text primary key,name text not null,direction_id text not null references public.directions(id),schedule jsonb not null default '[]',trainer_id uuid references public.trainers(id),trainer_pct numeric not null default 50,created_at timestamptz not null default now(),archived_at timestamptz);
create table public.trainer_groups(id uuid primary key default gen_random_uuid(),trainer_id uuid not null references public.trainers(id) on delete cascade,group_id text not null references public.groups(id) on delete cascade,is_primary boolean not null default false,unique(trainer_id,group_id));
create table public.students(id uuid primary key default gen_random_uuid(),name text not null,first_name text,last_name text,phone text,telegram text,notes text,message_template text,created_at timestamptz not null default now());
create table public.student_groups(id uuid primary key default gen_random_uuid(),student_id uuid not null references public.students(id) on delete cascade,group_id text not null references public.groups(id) on delete cascade,created_at timestamptz not null default now(),unique(student_id,group_id));
create table public.subscriptions(id uuid primary key default gen_random_uuid(),student_id uuid references public.students(id) on delete cascade,group_id text references public.groups(id) on delete cascade,plan_type text not null default '8pack',start_date date not null,end_date date not null,activation_date date,original_end_date date,total_trainings integer not null default 8,used_trainings integer not null default 0,amount integer not null default 0,base_price integer default 0,discount_pct integer default 0,discount_source text default 'studio',paid boolean default false,pay_method text default 'card',notification_sent boolean default false,notes text,created_at timestamptz not null default now());
create table public.attendance(id uuid primary key default gen_random_uuid(),sub_id uuid references public.subscriptions(id) on delete set null,student_id uuid references public.students(id) on delete set null,date date not null,guest_name text,guest_type text,group_id text references public.groups(id) on delete set null,quantity integer default 1,entry_type text,created_at timestamptz not null default now());
create table public.cancelled_trainings(id uuid primary key default gen_random_uuid(),group_id text references public.groups(id) on delete cascade,date date not null,reason text,created_at timestamptz not null default now());
create table public.mod_log(id uuid primary key default gen_random_uuid(),sub_id uuid references public.subscriptions(id) on delete set null,date date not null,action text not null,details text,reason text,created_at timestamptz not null default now());
create table public.custom_orders(id uuid primary key default gen_random_uuid(),group_id text not null references public.groups(id) on delete cascade,student_id uuid not null references public.students(id) on delete cascade,sort_order integer not null default 0,created_at timestamptz not null default now(),unique(group_id,student_id));
create table public.waitlist(id uuid primary key default gen_random_uuid(),name text not null,phone text,telegram text,instagram text,contact text,direction_id text references public.directions(id),group_id text references public.groups(id),status text not null default 'new',notes text,created_at timestamptz not null default now());
create table public.room_bookings(id uuid primary key default gen_random_uuid(),date date not null,start_time text not null,end_time text not null,trainer_id text,trainer_name text,title text not null,type text not null default 'individual',booking_type text,people_count integer,price integer,payment_method text,event_type text,note text,color text,recurrence text,recurrence_until date,description text,status text default 'active',created_at timestamptz not null default now());

create index idx_subs_student on public.subscriptions(student_id);
create index idx_subs_group on public.subscriptions(group_id);
create index idx_subs_dates on public.subscriptions(start_date,end_date);
create index idx_attn_date on public.attendance(date);
create index idx_attn_sub on public.attendance(sub_id);

alter table public.students enable row level security;
alter table public.groups enable row level security;
alter table public.subscriptions enable row level security;
alter table public.attendance enable row level security;
alter table public.cancelled_trainings enable row level security;
alter table public.mod_log enable row level security;
alter table public.student_groups enable row level security;
alter table public.room_bookings enable row level security;
create policy "Allow all on students" on public.students for all to authenticated using(true) with check(true);
create policy "Allow all on groups" on public.groups for all to authenticated using(true) with check(true);
create policy "Allow all on subscriptions" on public.subscriptions for all to authenticated using(true) with check(true);
create policy "Allow all on attendance" on public.attendance for all to authenticated using(true) with check(true);
create policy "Allow all on student_groups" on public.student_groups for all to authenticated using(true) with check(true);
create policy "Allow all on room_bookings" on public.room_bookings for all to authenticated using(true) with check(true);

-- Canonical authorization prerequisites. Later repository migrations replace
-- these with the current definitions before financial hardening runs.
create or replace function public.rls_is_admin() returns boolean language sql stable security definer set search_path=public as $$
  select auth.uid() is not null and lower(coalesce(auth.jwt()->>'email',''))=lower('semagin.vlad@gmail.com')
$$;
create or replace function public.rls_owns_group(p_group_id text) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.trainers t join public.trainer_groups tg on tg.trainer_id=t.id where t.auth_user_id=auth.uid() and t.is_active and t.archived_at is null and t.access_disabled_at is null and tg.group_id=p_group_id)
$$;
create or replace function public.crm_is_admin_session() returns boolean language sql stable security definer set search_path=public as $$ select public.rls_is_admin() $$;
create or replace function public.crm_is_active_trainer_session() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.trainers t where t.auth_user_id=auth.uid() and t.is_active and t.archived_at is null and t.access_disabled_at is null)
$$;


-- BEGIN SOURCE: sql/trial_bookings_foundation.sql
-- SQL-only foundation for future CRM trial lesson bookings.
-- Reserve/waitlist and trial bookings are intentionally separate domains:
-- - waitlist/reserve: potential contact waiting for a place, may not have a lesson date;
-- - trial booking: contact booked for a concrete group and trial_date.

create table if not exists public.trial_bookings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  student_id uuid null references public.students(id) on delete set null,
  name text not null,
  phone text null,
  telegram text null,
  instagram text null,
  contact text null,

  direction_id text null,
  group_id text not null,
  trial_date date not null,

  status text not null default 'new',
  note text null,
  source text null,

  converted_student_id uuid null references public.students(id) on delete set null,

  constraint trial_bookings_status_check check (
    status in (
      'new',
      'contacted',
      'confirmed',
      'came',
      'no_show',
      'became_student',
      'declined',
      'cancelled'
    )
  )
);

create index if not exists trial_bookings_trial_date_group_id_idx
  on public.trial_bookings (trial_date, group_id);

create index if not exists trial_bookings_status_trial_date_idx
  on public.trial_bookings (status, trial_date);

create index if not exists trial_bookings_student_id_idx
  on public.trial_bookings (student_id);

create index if not exists trial_bookings_converted_student_id_idx
  on public.trial_bookings (converted_student_id);

-- END SOURCE: sql/trial_bookings_foundation.sql

-- BEGIN SOURCE: sql/crm_create_student_for_group.sql
-- Draft only. Do NOT run automatically from the app.
-- Pre-RLS helper for creating a student from Attendance and linking her to a group atomically.
-- Confirm production students columns before applying: name, first_name, last_name, phone,
-- telegram, notes, message_template. The current frontend/db layer already reads/writes them.

create or replace function public.crm_create_student_for_group(
  p_group_id text,
  p_name text,
  p_first_name text default null,
  p_last_name text default null,
  p_phone text default null,
  p_telegram text default null,
  p_notes text default null,
  p_message_template text default null
)
returns public.students
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_is_admin boolean;
  v_has_group_access boolean;
  v_full_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_group_id is null or btrim(p_group_id) = '' then
    raise exception 'group_id is required' using errcode = '22023';
  end if;

  v_is_admin := lower(coalesce(auth.jwt() ->> 'email', '')) = lower('semagin.vlad@gmail.com');

  select exists (
    select 1
    from public.groups g
    where g.id = p_group_id
      and g.trainer_id = auth.uid()
  ) into v_has_group_access;

  if not (v_is_admin or v_has_group_access) then
    raise exception 'Not allowed to create student for group %', p_group_id using errcode = '42501';
  end if;

  v_full_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_full_name is null then
    v_full_name := nullif(btrim(concat_ws(' ', nullif(p_last_name, ''), nullif(p_first_name, ''))), '');
  end if;

  if v_full_name is null then
    raise exception 'student name is required' using errcode = '22023';
  end if;

  insert into public.students (
    name,
    first_name,
    last_name,
    phone,
    telegram,
    notes,
    message_template
  ) values (
    v_full_name,
    nullif(p_first_name, ''),
    nullif(p_last_name, ''),
    nullif(p_phone, ''),
    nullif(p_telegram, ''),
    nullif(p_notes, ''),
    nullif(p_message_template, '')
  )
  returning * into v_student;

  insert into public.student_groups (student_id, group_id)
  values (v_student.id, p_group_id)
  on conflict (student_id, group_id) do nothing;

  return v_student;
end;
$$;

revoke all on function public.crm_create_student_for_group(
  text, text, text, text, text, text, text, text
) from public;

grant execute on function public.crm_create_student_for_group(
  text, text, text, text, text, text, text, text
) to authenticated;

-- END SOURCE: sql/crm_create_student_for_group.sql

-- BEGIN SOURCE: sql/attendance_restore_candidates_rpc.sql
-- Safe restore-candidate RPC for AttendanceTab.
-- Apply manually in Supabase SQL Editor.

create or replace function public.crm_fetch_restore_candidates_for_group(p_group_id text)
returns table (
  student_id uuid,
  name text,
  first_name text,
  last_name text,
  has_history boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with allowed_group as (
    select g.id
    from public.groups g
    where g.id = p_group_id
      and (
        public.rls_is_admin()
        or g.trainer_id::text = auth.uid()::text
      )
  ),
  history_students as (
    select s.student_id
    from public.subscriptions s
    join allowed_group ag on ag.id = s.group_id
    where s.student_id is not null

    union

    select a.student_id
    from public.attendance a
    join allowed_group ag on ag.id = a.group_id
    where a.student_id is not null
  ),
  current_links as (
    select sg.student_id
    from public.student_groups sg
    join allowed_group ag on ag.id = sg.group_id
  )
  select
    st.id as student_id,
    st.name,
    st.first_name,
    st.last_name,
    true as has_history
  from history_students hs
  join public.students st on st.id = hs.student_id
  where not exists (
    select 1
    from current_links cl
    where cl.student_id = hs.student_id
  )
  order by lower(coalesce(nullif(st.name, ''), concat_ws(' ', st.first_name, st.last_name), st.id::text));
$$;

revoke execute on function public.crm_fetch_restore_candidates_for_group(text) from public, anon;
grant execute on function public.crm_fetch_restore_candidates_for_group(text) to authenticated;

create or replace function public.crm_restore_student_to_group(
  p_group_id text,
  p_student_id uuid
)
returns table (
  id uuid,
  student_id uuid,
  group_id text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.student_groups%rowtype;
  v_inserted public.student_groups%rowtype;
  v_allowed boolean;
  v_has_history boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_group_id is null or btrim(p_group_id) = '' then
    raise exception 'group_id is required' using errcode = '22023';
  end if;

  if p_student_id is null then
    raise exception 'student_id is required' using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.groups g
    where g.id = p_group_id
      and (
        public.rls_is_admin()
        or g.trainer_id::text = auth.uid()::text
      )
  ) into v_allowed;

  if not v_allowed then
    raise exception 'Not allowed to restore student to group %', p_group_id using errcode = '42501';
  end if;

  select *
  into v_existing
  from public.student_groups sg
  where sg.group_id = p_group_id
    and sg.student_id = p_student_id
  limit 1;

  if found then
    id := v_existing.id;
    student_id := v_existing.student_id;
    group_id := v_existing.group_id;
    return next;
    return;
  end if;

  select exists (
    select 1
    from public.subscriptions s
    where s.group_id = p_group_id
      and s.student_id = p_student_id

    union all

    select 1
    from public.attendance a
    where a.group_id = p_group_id
      and a.student_id = p_student_id
  ) into v_has_history;

  if not v_has_history then
    raise exception 'Student % has no restore history in group %', p_student_id, p_group_id using errcode = '42501';
  end if;

  insert into public.student_groups (student_id, group_id)
  values (p_student_id, p_group_id)
  returning * into v_inserted;

  id := v_inserted.id;
  student_id := v_inserted.student_id;
  group_id := v_inserted.group_id;
  return next;
end;
$$;

revoke execute on function public.crm_restore_student_to_group(text, uuid) from public, anon;
grant execute on function public.crm_restore_student_to_group(text, uuid) to authenticated;

-- END SOURCE: sql/attendance_restore_candidates_rpc.sql

-- BEGIN SOURCE: sql/trial_booking_convert_to_student_rpc.sql
-- Scoped conversion RPC: confirmed trial booking -> student + student_groups link.
-- Review/apply manually in Supabase.

begin;

create or replace function public.crm_convert_trial_booking_to_student(p_trial_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.trial_bookings%rowtype;
  v_student public.students%rowtype;
  v_student_id uuid;
  v_link public.student_groups%rowtype;
  v_phone text;
  v_tg text;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_trial_booking_id is null then
    raise exception 'trial_booking_id is required' using errcode = '22023';
  end if;

  select * into v_booking
  from public.trial_bookings
  where id = p_trial_booking_id;

  if not found then
    raise exception 'Trial booking not found: %', p_trial_booking_id using errcode = 'P0002';
  end if;

  if coalesce(v_booking.status, '') <> 'confirmed' then
    raise exception 'Trial booking status must be confirmed' using errcode = '22023';
  end if;

  if not (public.rls_is_admin() or public.rls_owns_group(v_booking.group_id)) then
    raise exception 'Not allowed to convert this trial booking' using errcode = '42501';
  end if;

  v_student_id := coalesce(v_booking.converted_student_id, v_booking.student_id);

  if v_student_id is not null then
    select * into v_student from public.students where id = v_student_id;
  end if;

  if v_student.id is null then
    v_phone := nullif(btrim(coalesce(v_booking.phone, '')), '');
    if v_phone is not null then
      select * into v_student from public.students s where btrim(coalesce(s.phone, '')) = v_phone order by s.created_at asc limit 1;
    end if;
  end if;

  if v_student.id is null then
    v_tg := lower(nullif(btrim(coalesce(v_booking.telegram, '')), ''));
    if v_tg is not null then
      select * into v_student from public.students s where lower(btrim(coalesce(s.telegram, ''))) = v_tg order by s.created_at asc limit 1;
    end if;
  end if;

  if v_student.id is null then
    v_name := nullif(btrim(coalesce(v_booking.name, '')), '');
    if v_name is null then
      raise exception 'Student name is required for creation' using errcode = '22023';
    end if;

    insert into public.students(name, first_name, last_name, phone, telegram, notes, message_template)
    values (v_name, '', '', v_phone, nullif(btrim(coalesce(v_booking.telegram, '')), ''), nullif(btrim(coalesce(v_booking.note, '')), ''), null)
    returning * into v_student;
  end if;

  v_student_id := v_student.id;

  select * into v_link
  from public.student_groups
  where student_id = v_student_id and group_id = v_booking.group_id
  limit 1;

  if v_link.id is null then
    begin
      insert into public.student_groups(student_id, group_id)
      values (v_student_id, v_booking.group_id)
      returning * into v_link;
    exception
      when unique_violation then
        select * into v_link
        from public.student_groups
        where student_id = v_student_id and group_id = v_booking.group_id
        limit 1;
    end;
  end if;

  update public.trial_bookings
  set status = 'became_student',
      student_id = v_student_id,
      converted_student_id = v_student_id,
      updated_at = now()
  where id = v_booking.id
  returning * into v_booking;

  return jsonb_build_object(
    'student', to_jsonb(v_student),
    'student_group', jsonb_build_object('id', v_link.id, 'student_id', v_link.student_id, 'group_id', v_link.group_id),
    'trial_booking', to_jsonb(v_booking)
  );
end;
$$;

revoke all on function public.crm_convert_trial_booking_to_student(uuid) from public, anon;
grant execute on function public.crm_convert_trial_booking_to_student(uuid) to authenticated;

commit;

-- END SOURCE: sql/trial_booking_convert_to_student_rpc.sql

-- BEGIN SOURCE: supabase/migrations/20260526090000_studio_rooms.sql
create table if not exists public.studio_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists studio_rooms_name_unique_idx
  on public.studio_rooms (lower(btrim(name)));

alter table public.studio_rooms enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'studio_rooms' and policyname = 'studio_rooms_select_authenticated') then
    create policy "studio_rooms_select_authenticated"
      on public.studio_rooms
      for select
      to authenticated
      using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'studio_rooms' and policyname = 'studio_rooms_admin_mutations') then
    create policy "studio_rooms_admin_mutations"
      on public.studio_rooms
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

insert into public.studio_rooms (name, is_active, sort_order)
values ('Основна зала', true, 0)
on conflict (lower(btrim(name)))
do update set is_active = true;

alter table public.room_bookings
  add column if not exists room_name text;

update public.room_bookings
set room_name = coalesce(nullif(btrim(room_name), ''), 'Основна зала')
where room_name is null or btrim(room_name) = '';

-- END SOURCE: supabase/migrations/20260526090000_studio_rooms.sql

-- BEGIN SOURCE: supabase/migrations/20260529090000_group_lesson_overrides.sql
create table if not exists public.group_lesson_overrides (
  id uuid primary key default gen_random_uuid(),
  group_id text not null,
  date date not null,
  slot_index integer not null,
  original_start_time text,
  original_end_time text,
  start_time text not null,
  end_time text not null,
  room_name text,
  trainer_id uuid null,
  title text null,
  note text null,
  status text not null default 'active',
  created_by uuid null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint group_lesson_overrides_unique_slot unique (group_id, date, slot_index)
);

create index if not exists group_lesson_overrides_group_id_idx
  on public.group_lesson_overrides (group_id);

create index if not exists group_lesson_overrides_date_idx
  on public.group_lesson_overrides (date);

create index if not exists group_lesson_overrides_group_id_date_idx
  on public.group_lesson_overrides (group_id, date);

create or replace function public.set_group_lesson_overrides_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_group_lesson_overrides_updated_at on public.group_lesson_overrides;
create trigger set_group_lesson_overrides_updated_at
before update on public.group_lesson_overrides
for each row
execute function public.set_group_lesson_overrides_updated_at();

alter table public.group_lesson_overrides enable row level security;

-- Phase 1 compatibility policy: current schema does not expose a reliable SQL helper
-- for the frontend admin role or trainer/group ownership checks. Keep authenticated
-- schedule users unblocked for preview environments; Phase 2 must replace this with
-- ownership-aware RLS or RPC checks before expanding override usage beyond ScheduleTab.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'group_lesson_overrides'
      and policyname = 'group_lesson_overrides_authenticated_select'
  ) then
    create policy "group_lesson_overrides_authenticated_select"
      on public.group_lesson_overrides
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'group_lesson_overrides'
      and policyname = 'group_lesson_overrides_authenticated_mutations'
  ) then
    create policy "group_lesson_overrides_authenticated_mutations"
      on public.group_lesson_overrides
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

-- END SOURCE: supabase/migrations/20260529090000_group_lesson_overrides.sql

-- BEGIN SOURCE: supabase/migrations/20260530090000_group_lesson_overrides_phase2_read_wide_write_owned.sql
-- Phase 2 security for public.group_lesson_overrides: read-wide / write-owned.
--
-- Business rule protected by this migration:
-- - authenticated schedule users may read all single-date group lesson overrides
--   so the shared schedule shows the real state of occupied/cancelled slots;
-- - admins may create/update/delete any override;
-- - trainers may create/update/delete overrides only for groups they own through
--   public.groups.trainer_id = auth.uid();
-- - direct API calls cannot mutate another trainer's group_id/override.

begin;

-- Remove the temporary Phase 1 allow-authenticated mutation policy and any
-- earlier Phase 2 policy names before recreating the read-wide/write-owned set.
-- Data is intentionally preserved.
drop policy if exists group_lesson_overrides_authenticated_select on public.group_lesson_overrides;
drop policy if exists group_lesson_overrides_authenticated_mutations on public.group_lesson_overrides;
drop policy if exists group_lesson_overrides_admin_all on public.group_lesson_overrides;
drop policy if exists group_lesson_overrides_schedule_select_authenticated on public.group_lesson_overrides;
drop policy if exists group_lesson_overrides_trainer_select_own_groups on public.group_lesson_overrides;
drop policy if exists group_lesson_overrides_trainer_insert_own_groups on public.group_lesson_overrides;
drop policy if exists group_lesson_overrides_trainer_update_own_groups on public.group_lesson_overrides;
drop policy if exists group_lesson_overrides_trainer_delete_own_groups on public.group_lesson_overrides;

-- Existing project admin pattern: the SQL helper mirrors the frontend admin
-- allow-list and other RLS drafts.
create or replace function public.rls_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'semagin.vlad@gmail.com';
$$;

-- Existing project ownership pattern: a trainer owns a group when groups.trainer_id
-- maps to the authenticated Supabase auth user id.
create or replace function public.rls_owns_group(p_group_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.groups g
    where g.id::text = p_group_id::text
      and g.trainer_id::text = auth.uid()::text
  );
$$;

-- Helper for UPDATE checks on created_by. Trainers may keep the existing value
-- or set it only to null/their own auth.uid(); they cannot spoof another actor
-- through a direct API PATCH. The SECURITY DEFINER function reads the stored row
-- without relying on the table's SELECT policy semantics.
create or replace function public.rls_group_lesson_override_created_by_allowed(
  p_override_id uuid,
  p_created_by uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_created_by is null
    or p_created_by::text = auth.uid()::text
    or exists (
      select 1
      from public.group_lesson_overrides glo
      where glo.id = p_override_id
        and glo.created_by is not distinct from p_created_by
    );
$$;

revoke execute on function public.rls_is_admin() from public, anon;
revoke execute on function public.rls_owns_group(text) from public, anon;
revoke execute on function public.rls_group_lesson_override_created_by_allowed(uuid, uuid) from public, anon;
grant execute on function public.rls_is_admin() to authenticated;
grant execute on function public.rls_owns_group(text) to authenticated;
grant execute on function public.rls_group_lesson_override_created_by_allowed(uuid, uuid) to authenticated;

alter table public.group_lesson_overrides enable row level security;

-- Read-wide: authenticated schedule users can read all overrides so generated
-- lessons, active overrides, and cancelled overrides render consistently in the
-- shared schedule. Write access is restricted by the policies below.
create policy group_lesson_overrides_schedule_select_authenticated
on public.group_lesson_overrides
for select
to authenticated
using (true);

-- Admins can manage every override. This policy intentionally covers all write
-- paths, while SELECT is also covered by the read-wide policy above.
create policy group_lesson_overrides_admin_all
on public.group_lesson_overrides
for all
to authenticated
using (public.rls_is_admin())
with check (public.rls_is_admin());

-- Trainers can create overrides only for their own groups. If the client sends
-- created_by, it must be null or the current auth.uid(), not a spoofed user id.
create policy group_lesson_overrides_trainer_insert_own_groups
on public.group_lesson_overrides
for insert
to authenticated
with check (
  group_id is not null
  and public.rls_owns_group(group_id)
  and (created_by is null or created_by::text = auth.uid()::text)
);

-- Trainers can update only rows that currently belong to their groups, and the
-- resulting row must still belong to one of their groups. This prevents direct
-- API payloads from moving an override onto another trainer's group_id.
create policy group_lesson_overrides_trainer_update_own_groups
on public.group_lesson_overrides
for update
to authenticated
using (group_id is not null and public.rls_owns_group(group_id))
with check (
  group_id is not null
  and public.rls_owns_group(group_id)
  and public.rls_group_lesson_override_created_by_allowed(id, created_by)
);

-- Trainers can delete only overrides for their own groups.
create policy group_lesson_overrides_trainer_delete_own_groups
on public.group_lesson_overrides
for delete
to authenticated
using (group_id is not null and public.rls_owns_group(group_id));

commit;

-- END SOURCE: supabase/migrations/20260530090000_group_lesson_overrides_phase2_read_wide_write_owned.sql

-- BEGIN SOURCE: supabase/migrations/20260601090000_training_lesson_evidence.sql
begin;

create table if not exists public.training_lesson_plans (
  id uuid primary key default gen_random_uuid(),
  group_id text not null references public.groups(id) on delete cascade,
  trainer_id uuid not null,
  lesson_date date not null,
  schedule_slot_index integer not null default 0,
  plan_type text not null default 'other',
  goal text,
  planned_content text,
  planned_difficulty text,
  planned_outcome text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_lesson_plans_plan_type_check check (
    plan_type in (
      'choreography',
      'technique',
      'routine',
      'practice',
      'review',
      'filming',
      'performance_prep',
      'other'
    )
  ),
  constraint training_lesson_plans_planned_difficulty_check check (
    planned_difficulty is null
    or planned_difficulty in ('easy', 'medium', 'hard')
  ),
  constraint training_lesson_plans_unique_lesson unique (
    group_id,
    trainer_id,
    lesson_date,
    schedule_slot_index
  )
);

create index if not exists training_lesson_plans_group_date_idx
  on public.training_lesson_plans (group_id, lesson_date);

create index if not exists training_lesson_plans_trainer_date_idx
  on public.training_lesson_plans (trainer_id, lesson_date);

create index if not exists training_lesson_plans_lesson_date_idx
  on public.training_lesson_plans (lesson_date);

create table if not exists public.training_lesson_reports (
  id uuid primary key default gen_random_uuid(),
  group_id text not null references public.groups(id) on delete cascade,
  trainer_id uuid not null,
  lesson_date date not null,
  schedule_slot_index integer not null default 0,
  mood_score integer,
  difficulty_actual text,
  pace_actual text,
  plan_progress text,
  completed_content text,
  missed_content text,
  student_feedback text,
  trainer_notes text,
  next_adjustment text,
  risk_flags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_lesson_reports_mood_score_check check (
    mood_score is null
    or mood_score between 1 and 5
  ),
  constraint training_lesson_reports_difficulty_actual_check check (
    difficulty_actual is null
    or difficulty_actual in ('too_easy', 'ok', 'too_hard')
  ),
  constraint training_lesson_reports_pace_actual_check check (
    pace_actual is null
    or pace_actual in ('slow', 'ok', 'fast')
  ),
  constraint training_lesson_reports_plan_progress_check check (
    plan_progress is null
    or plan_progress in ('ahead', 'on_track', 'behind')
  ),
  constraint training_lesson_reports_risk_flags_check check (
    risk_flags <@ array[
      'low_energy',
      'too_hard',
      'too_easy',
      'conflict',
      'low_attendance',
      'behind_plan',
      'ready_for_filming',
      'needs_revision'
    ]::text[]
  ),
  constraint training_lesson_reports_unique_lesson unique (
    group_id,
    trainer_id,
    lesson_date,
    schedule_slot_index
  )
);

create index if not exists training_lesson_reports_group_date_idx
  on public.training_lesson_reports (group_id, lesson_date);

create index if not exists training_lesson_reports_trainer_date_idx
  on public.training_lesson_reports (trainer_id, lesson_date);

create index if not exists training_lesson_reports_lesson_date_idx
  on public.training_lesson_reports (lesson_date);

create index if not exists training_lesson_reports_risk_flags_gin_idx
  on public.training_lesson_reports using gin (risk_flags);

create or replace function public.set_training_lesson_evidence_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_training_lesson_plans_updated_at
  on public.training_lesson_plans;

create trigger set_training_lesson_plans_updated_at
before update on public.training_lesson_plans
for each row
execute function public.set_training_lesson_evidence_updated_at();

drop trigger if exists set_training_lesson_reports_updated_at
  on public.training_lesson_reports;

create trigger set_training_lesson_reports_updated_at
before update on public.training_lesson_reports
for each row
execute function public.set_training_lesson_evidence_updated_at();

alter table public.training_lesson_plans enable row level security;
alter table public.training_lesson_reports enable row level security;

drop policy if exists training_lesson_plans_admin_all
  on public.training_lesson_plans;
drop policy if exists training_lesson_plans_trainer_select_own_groups
  on public.training_lesson_plans;
drop policy if exists training_lesson_plans_trainer_insert_own_groups
  on public.training_lesson_plans;
drop policy if exists training_lesson_plans_trainer_update_own_groups
  on public.training_lesson_plans;
drop policy if exists training_lesson_plans_trainer_delete_own_groups
  on public.training_lesson_plans;

create policy training_lesson_plans_admin_all
on public.training_lesson_plans
for all
to authenticated
using (public.rls_is_admin())
with check (public.rls_is_admin());

create policy training_lesson_plans_trainer_select_own_groups
on public.training_lesson_plans
for select
to authenticated
using (
  group_id is not null
  and public.rls_owns_group(group_id)
);

create policy training_lesson_plans_trainer_insert_own_groups
on public.training_lesson_plans
for insert
to authenticated
with check (
  group_id is not null
  and public.rls_owns_group(group_id)
  and trainer_id::text = auth.uid()::text
);

create policy training_lesson_plans_trainer_update_own_groups
on public.training_lesson_plans
for update
to authenticated
using (
  group_id is not null
  and public.rls_owns_group(group_id)
)
with check (
  group_id is not null
  and public.rls_owns_group(group_id)
  and trainer_id::text = auth.uid()::text
);

create policy training_lesson_plans_trainer_delete_own_groups
on public.training_lesson_plans
for delete
to authenticated
using (
  group_id is not null
  and public.rls_owns_group(group_id)
);

drop policy if exists training_lesson_reports_admin_all
  on public.training_lesson_reports;
drop policy if exists training_lesson_reports_trainer_select_own_groups
  on public.training_lesson_reports;
drop policy if exists training_lesson_reports_trainer_insert_own_groups
  on public.training_lesson_reports;
drop policy if exists training_lesson_reports_trainer_update_own_groups
  on public.training_lesson_reports;
drop policy if exists training_lesson_reports_trainer_delete_own_groups
  on public.training_lesson_reports;

create policy training_lesson_reports_admin_all
on public.training_lesson_reports
for all
to authenticated
using (public.rls_is_admin())
with check (public.rls_is_admin());

create policy training_lesson_reports_trainer_select_own_groups
on public.training_lesson_reports
for select
to authenticated
using (
  group_id is not null
  and public.rls_owns_group(group_id)
);

create policy training_lesson_reports_trainer_insert_own_groups
on public.training_lesson_reports
for insert
to authenticated
with check (
  group_id is not null
  and public.rls_owns_group(group_id)
  and trainer_id::text = auth.uid()::text
);

create policy training_lesson_reports_trainer_update_own_groups
on public.training_lesson_reports
for update
to authenticated
using (
  group_id is not null
  and public.rls_owns_group(group_id)
)
with check (
  group_id is not null
  and public.rls_owns_group(group_id)
  and trainer_id::text = auth.uid()::text
);

create policy training_lesson_reports_trainer_delete_own_groups
on public.training_lesson_reports
for delete
to authenticated
using (
  group_id is not null
  and public.rls_owns_group(group_id)
);

commit;

-- END SOURCE: supabase/migrations/20260601090000_training_lesson_evidence.sql

-- BEGIN SOURCE: supabase/migrations/20260706090000_group_merge_operations.sql
create table if not exists public.group_merge_operations (
  id text primary key,
  created_at timestamptz not null default now(),
  source_group_id text not null,
  target_group_id text not null,
  selected_student_ids jsonb not null default '[]'::jsonb,
  new_target_links_student_ids jsonb not null default '[]'::jsonb,
  removed_source_links_student_ids jsonb not null default '[]'::jsonb,
  moved_subscription_ids jsonb not null default '[]'::jsonb,
  previous_subscription_group_ids jsonb not null default '{}'::jsonb,
  previous_target_schedule jsonb not null default '[]'::jsonb,
  new_target_schedule jsonb not null default '[]'::jsonb,
  previous_source_archive_state jsonb,
  source_was_archived_before boolean not null default false,
  schedule_mode text not null default 'keep_target',
  executed_by text,
  undone_at timestamptz,
  undone_by text
);

create index if not exists group_merge_operations_created_at_idx
  on public.group_merge_operations (created_at desc);

create index if not exists group_merge_operations_active_idx
  on public.group_merge_operations (undone_at)
  where undone_at is null;

-- END SOURCE: supabase/migrations/20260706090000_group_merge_operations.sql

-- BEGIN SOURCE: supabase/migrations/20260706100000_group_merge_operations_status.sql
alter table public.group_merge_operations
  add column if not exists status text not null default 'completed',
  add column if not exists completed_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists error_message text;

update public.group_merge_operations
set status = case
    when undone_at is not null then 'undone'
    when failed_at is not null then 'failed'
    when completed_at is not null then 'completed'
    else status
  end;

create index if not exists group_merge_operations_status_idx
  on public.group_merge_operations (status, created_at desc);

-- END SOURCE: supabase/migrations/20260706100000_group_merge_operations_status.sql

-- BEGIN SOURCE: supabase/migrations/20260717090000_groups_public_display_settings.sql
alter table public.groups
  add column if not exists public_level text null,
  add column if not exists public_join_status text not null default 'open',
  add column if not exists show_on_public_site boolean not null default false,
  add column if not exists age_category text null;

comment on column public.groups.public_level is 'Public website group level: base or mix; null when not shown publicly.';
comment on column public.groups.public_join_status is 'Public website join status: open, experience_only, or closed.';
comment on column public.groups.show_on_public_site is 'Controls whether the group can be exposed by future public schedule APIs.';
comment on column public.groups.age_category is 'Public website age category: teens_under_16 or adults_16_plus; null when not shown publicly.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'groups_public_level_check'
      and conrelid = 'public.groups'::regclass
  ) then
    alter table public.groups
      add constraint groups_public_level_check
      check (public_level is null or public_level in ('base', 'mix'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'groups_public_join_status_check'
      and conrelid = 'public.groups'::regclass
  ) then
    alter table public.groups
      add constraint groups_public_join_status_check
      check (public_join_status in ('open', 'experience_only', 'closed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'groups_age_category_check'
      and conrelid = 'public.groups'::regclass
  ) then
    alter table public.groups
      add constraint groups_age_category_check
      check (age_category is null or age_category in ('teens_under_16', 'adults_16_plus'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'groups_public_required_fields_check'
      and conrelid = 'public.groups'::regclass
  ) then
    alter table public.groups
      add constraint groups_public_required_fields_check
      check (
        show_on_public_site = false
        or (public_level is not null and age_category is not null)
      );
  end if;
end $$;

-- END SOURCE: supabase/migrations/20260717090000_groups_public_display_settings.sql

-- BEGIN SOURCE: supabase/migrations/20260731090000_fetch_public_schedule.sql
-- Public, read-only schedule projection. CRM tables remain private and are read
-- only through this deliberately narrow SECURITY DEFINER function.

-- New cancellations can target one recurring slot. Existing rows remain null,
-- which preserves the CRM's legacy "cancel the whole group/date" behaviour.
alter table public.cancelled_trainings
  add column if not exists slot_index integer null;

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
      g.trainer_id::text as group_trainer_id,
      g.public_level::text as level,
      g.age_category::text as age_category,
      g.public_join_status::text as join_status,
      g.schedule
    from public.groups as g
    where g.show_on_public_site is true
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

-- END SOURCE: supabase/migrations/20260731090000_fetch_public_schedule.sql

-- BEGIN SOURCE: supabase/migrations/20260731100000_seed_directions.sql
-- Seed the persistent directions dictionary from the existing CRM constants.
-- Existing records are never overwritten.

insert into public.directions (
  id,
  name,
  color,
  is_active
)
values
  ('bachata',   'Bachata Lady Style', '#FF9500', true),
  ('dancehall', 'Dancehall Female',   '#34C759', true),
  ('heels',     'High Heels',         '#AF52DE', true),
  ('jazzfunk',  'Jazz Funk',          '#FF2D55', true),
  ('kpop',      'K-pop Cover Dance',   '#5A81FA', true),
  ('latina',    'Latina Solo',         '#FF453A', true)
on conflict (id) do nothing;

-- END SOURCE: supabase/migrations/20260731100000_seed_directions.sql

-- BEGIN SOURCE: supabase/migrations/20260731110000_group_rooms_and_start_date.sql
-- Stable room references for group slots and the first calendar date for a group.
-- Renaming is explicit and atomic; this migration performs no automatic data backfill.

begin;

-- Production-schema preflight. Abort before any DDL if a relation or column used
-- below is absent. This intentionally does not assume public.groups.is_active.
do $preflight$
declare
  v_missing text;
  v_rpc_result text;
begin
  with required_columns(table_name, column_name) as (
    values
      ('groups', 'id'), ('groups', 'name'), ('groups', 'direction_id'),
      ('groups', 'schedule'), ('groups', 'trainer_id'),
      ('groups', 'created_at'), ('groups', 'archived_at'),
      ('groups', 'public_level'), ('groups', 'age_category'),
      ('groups', 'public_join_status'), ('groups', 'show_on_public_site'),
      ('studio_rooms', 'id'), ('studio_rooms', 'name'),
      ('studio_rooms', 'is_active'), ('studio_rooms', 'sort_order'),
      ('studio_rooms', 'created_at'),
      ('room_bookings', 'room_name'),
      ('group_lesson_overrides', 'group_id'),
      ('group_lesson_overrides', 'date'),
      ('group_lesson_overrides', 'slot_index'),
      ('group_lesson_overrides', 'start_time'),
      ('group_lesson_overrides', 'end_time'),
      ('group_lesson_overrides', 'room_name'),
      ('group_lesson_overrides', 'trainer_id'),
      ('group_lesson_overrides', 'title'),
      ('group_lesson_overrides', 'status'),
      ('cancelled_trainings', 'group_id'),
      ('cancelled_trainings', 'date'),
      ('directions', 'id'), ('directions', 'name'),
      ('trainers', 'id'), ('trainers', 'name')
  )
  select pg_catalog.string_agg(r.table_name || '.' || r.column_name, ', ' order by r.table_name, r.column_name)
  into v_missing
  from required_columns as r
  where not exists (
    select 1
    from pg_catalog.pg_attribute as a
    join pg_catalog.pg_class as c on c.oid = a.attrelid
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = r.table_name
      and a.attname = r.column_name
      and a.attnum > 0
      and not a.attisdropped
  );

  if v_missing is not null then
    raise exception using
      errcode = '42703',
      message = 'Production schema mismatch; missing required columns: ' || v_missing;
  end if;

  if pg_catalog.to_regprocedure('public.crm_fetch_schedule_groups()') is not null then
    select pg_catalog.pg_get_function_result('public.crm_fetch_schedule_groups()'::pg_catalog.regprocedure)
    into v_rpc_result;

    if pg_catalog.regexp_replace(
      pg_catalog.lower(pg_catalog.replace(v_rpc_result, 'timestamptz', 'timestamp with time zone')),
      '\s+', ' ', 'g'
    ) <> 'table(id text, name text, direction_id text, schedule jsonb, trainer_id text, trainer_pct numeric, created_at timestamp with time zone, archived_at timestamp with time zone, is_active boolean)' then
      raise exception using
        errcode = '42P13',
        message = 'Unexpected crm_fetch_schedule_groups() return shape: ' || v_rpc_result;
    end if;
  end if;
end;
$preflight$;

alter table public.groups
  add column if not exists start_date date null;

-- PostgreSQL cannot change a RETURNS TABLE row type with CREATE OR REPLACE.
-- Drop only the verified zero-argument overload; no CASCADE is used, so an
-- unexpected dependent object aborts and rolls back the whole transaction.
drop function if exists public.crm_fetch_schedule_groups();

create function public.crm_fetch_schedule_groups()
returns table (
  id text,
  name text,
  direction_id text,
  schedule jsonb,
  trainer_id text,
  trainer_pct numeric,
  created_at timestamptz,
  archived_at timestamptz,
  is_active boolean,
  start_date date
)
language sql
stable
security definer
set search_path = public
as $function$
  select
    g.id,
    g.name,
    g.direction_id,
    g.schedule,
    g.trainer_id::text as trainer_id,
    null::numeric as trainer_pct,
    g.created_at,
    g.archived_at,
    true::boolean as is_active,
    g.start_date
  from public.groups as g
  where (public.crm_is_admin_session() or public.crm_is_active_trainer_session())
    and g.archived_at is null
  order by g.name asc;
$function$;

revoke execute on function public.crm_fetch_schedule_groups() from public, anon;
grant execute on function public.crm_fetch_schedule_groups() to authenticated;

create or replace function public.rename_studio_room(
  p_room_id uuid,
  p_new_name text
)
returns public.studio_rooms
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_room public.studio_rooms;
  v_old_name text;
begin
  if p_room_id is null or nullif(pg_catalog.btrim(p_new_name), '') is null then
    raise exception using errcode = '22023', message = 'room id and name are required';
  end if;

  select sr.name into v_old_name
  from public.studio_rooms as sr
  where sr.id = p_room_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'studio room not found';
  end if;

  update public.studio_rooms
  set name = pg_catalog.btrim(p_new_name)
  where id = p_room_id
  returning * into v_room;

  update public.room_bookings
  set room_name = v_room.name
  where pg_catalog.lower(pg_catalog.btrim(room_name)) = pg_catalog.lower(pg_catalog.btrim(v_old_name));

  update public.group_lesson_overrides
  set room_name = v_room.name
  where pg_catalog.lower(pg_catalog.btrim(room_name)) = pg_catalog.lower(pg_catalog.btrim(v_old_name));

  with rewritten as (
    select
      g.id,
      pg_catalog.jsonb_agg(
        case
          when pg_catalog.jsonb_typeof(slot.value) = 'object'
            and (
              coalesce(slot.value ->> 'roomId', slot.value ->> 'room_id') = p_room_id::text
              or (
                nullif(pg_catalog.btrim(coalesce(slot.value ->> 'roomId', slot.value ->> 'room_id')), '') is null
                and pg_catalog.lower(pg_catalog.btrim(coalesce(
                  slot.value ->> 'roomName', slot.value ->> 'room_name', slot.value ->> 'room',
                  slot.value ->> 'location', slot.value ->> 'hall', ''
                ))) = pg_catalog.lower(pg_catalog.btrim(v_old_name))
              )
            )
          then (slot.value - 'room_id' - 'room_name' - 'room' - 'location' - 'hall')
            || pg_catalog.jsonb_build_object('roomId', p_room_id::text, 'roomName', v_room.name)
          else slot.value
        end
        order by slot.ordinality
      ) as schedule
    from public.groups as g
    cross join lateral pg_catalog.jsonb_array_elements(
      case when pg_catalog.jsonb_typeof(g.schedule) = 'array' then g.schedule else '[]'::jsonb end
    ) with ordinality as slot(value, ordinality)
    where pg_catalog.jsonb_typeof(g.schedule) = 'array'
    group by g.id
  )
  update public.groups as g
  set schedule = rewritten.schedule
  from rewritten
  where g.id = rewritten.id
    and rewritten.schedule is distinct from g.schedule;

  return v_room;
end;
$function$;

revoke all on function public.rename_studio_room(uuid, text) from public;
grant execute on function public.rename_studio_room(uuid, text) to authenticated;

-- Public, read-only schedule projection. CRM tables remain private and are read
-- only through this deliberately narrow SECURITY DEFINER function.

-- New cancellations can target one recurring slot. Existing rows remain null,
-- which preserves the CRM's legacy "cancel the whole group/date" behaviour.
alter table public.cancelled_trainings
  add column if not exists slot_index integer null;

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
      g.trainer_id::text as group_trainer_id,
      g.public_level::text as level,
      g.age_category::text as age_category,
      g.public_join_status::text as join_status,
      g.start_date,
      g.schedule
    from public.groups as g
    where g.show_on_public_site is true
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

commit;

-- END SOURCE: supabase/migrations/20260731110000_group_rooms_and_start_date.sql

-- BEGIN SOURCE: supabase/migrations/20260731110000_site_content_v1.sql
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

-- STAGING REDACTION: production trainer-profile UUID seeds intentionally omitted.
-- Create test Auth users and trainer rows manually using STAGING_RUNBOOK.md.

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

-- END SOURCE: supabase/migrations/20260731110000_site_content_v1.sql

-- BEGIN SOURCE: supabase/migrations/20260731120000_delete_archived_group.sql
-- Permanently delete only an archived, dependency-free group. The function is
-- SECURITY DEFINER so the whole check/cleanup/delete is one transaction, but it
-- performs an explicit admin check before touching data.
create or replace function public.delete_archived_group(p_group_id text)
returns table(deleted_id text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_group public.groups%rowtype;
  v_dependency record;
  v_count bigint;
  v_reasons text[] := array[]::text[];
  v_label text;
begin
  if not public.rls_is_admin() then
    raise exception 'Лише адміністратор може остаточно видаляти групи.' using errcode = '42501';
  end if;

  select * into v_group
  from public.groups
  where id::text = p_group_id::text
  for update;

  if not found then
    raise exception 'Групу не знайдено.' using errcode = 'P0002';
  end if;

  if v_group.archived_at is null then
    raise exception 'Активну групу не можна видалити. Спочатку перемістіть її в архів.' using errcode = '55000';
  end if;

  -- Audit both conventional group columns (including legacy "groupId") and
  -- every actual FK to groups(id). Anything not explicitly classified as
  -- disposable technical metadata blocks deletion, even when its FK says
  -- CASCADE: historical data must never disappear implicitly.
  for v_dependency in
    with candidate_columns as (
      select c.table_name, c.column_name
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name <> 'groups'
        and lower(c.column_name) in ('group_id', 'groupid', 'source_group_id', 'target_group_id')
      union
      select child.relname, child_col.attname
      from pg_constraint fk
      join pg_class child on child.oid = fk.conrelid
      join pg_namespace child_ns on child_ns.oid = child.relnamespace
      join pg_class parent on parent.oid = fk.confrelid
      join pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
      join lateral unnest(fk.conkey) with ordinality child_key(attnum, ord) on true
      join pg_attribute child_col on child_col.attrelid = child.oid and child_col.attnum = child_key.attnum
      where fk.contype = 'f'
        and child_ns.nspname = 'public'
        and parent_ns.nspname = 'public'
        and parent.relname = 'groups'
    )
    select distinct table_name, column_name
    from candidate_columns
    where table_name not in (
      'trainer_groups',
      'group_lesson_overrides',
      'cancelled_trainings',
      'group_merge_operations'
    )
    order by table_name, column_name
  loop
    execute format('select count(*) from public.%I where %I::text = $1', v_dependency.table_name, v_dependency.column_name)
      into v_count using p_group_id;

    if v_count > 0 then
      v_label := case v_dependency.table_name
        when 'attendance' then 'відвідувань'
        when 'subscriptions' then 'абонементів / оплат'
        when 'trial_bookings' then 'пробних записів'
        when 'waitlist' then 'записів резерву'
        when 'student_groups' then 'прив’язок учениць'
        when 'training_lesson_plans' then 'планів тренувань'
        when 'training_lesson_reports' then 'звітів тренувань'
        when 'attendance_change_log' then 'записів історії відвідувань'
        when 'subscription_change_log' then 'записів історії абонементів'
        when 'trainer_dispatch_history' then 'записів історії повідомлень'
        when 'notification_schedule_rules' then 'правил повідомлень'
        when 'trainer_notification_state' then 'налаштувань повідомлень'
        else format('записів у %I', v_dependency.table_name)
      end;
      v_reasons := array_append(v_reasons, format('%s — %s', v_label, v_count));
    end if;
  end loop;

  if cardinality(v_reasons) > 0 then
    raise exception 'Групу не можна видалити, бо до неї прив’язані:%', E'\n• ' || array_to_string(v_reasons, E'\n• ')
      using errcode = '23503';
  end if;

  -- Only disposable group-specific metadata is removed automatically.
  if to_regclass('public.trainer_groups') is not null then
    delete from public.trainer_groups where group_id::text = p_group_id::text;
  end if;
  if to_regclass('public.group_lesson_overrides') is not null then
    delete from public.group_lesson_overrides where group_id::text = p_group_id::text;
  end if;
  if to_regclass('public.cancelled_trainings') is not null then
    delete from public.cancelled_trainings where group_id::text = p_group_id::text;
  end if;
  if to_regclass('public.group_merge_operations') is not null then
    delete from public.group_merge_operations
    where source_group_id::text = p_group_id::text
       or target_group_id::text = p_group_id::text;
  end if;

  delete from public.groups where id::text = p_group_id::text;
  deleted_id := p_group_id;
  return next;
end;
$$;

revoke all on function public.delete_archived_group(text) from public, anon;
grant execute on function public.delete_archived_group(text) to authenticated;

-- END SOURCE: supabase/migrations/20260731120000_delete_archived_group.sql

-- BEGIN SOURCE: supabase/migrations/20260731130000_delete_archived_trainer.sql
-- Permanently delete an archived trainer only when no business/history rows refer
-- to them. Unknown conventional columns and every real FK are fail-closed.
create or replace function public.delete_archived_trainer(p_trainer_id text)
returns table(deleted_id text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trainer public.trainers%rowtype;
  v_dependency record;
  v_count bigint;
  v_reasons text[] := array[]::text[];
  v_label text;
begin
  if not public.rls_is_admin() then
    raise exception 'Лише адміністратор може остаточно видаляти тренерів.' using errcode = '42501';
  end if;

  select * into v_trainer
  from public.trainers
  where id::text = p_trainer_id::text
  for update;

  if not found then
    raise exception 'Тренера не знайдено.' using errcode = 'P0002';
  end if;

  -- archived_at is the canonical archive marker. is_active alone is deliberately
  -- insufficient, so a disabled active row cannot be deleted by a direct call.
  if v_trainer.archived_at is null then
    raise exception 'Активного тренера не можна видалити. Спочатку перемістіть його в архів.' using errcode = '55000';
  end if;

  for v_dependency in
    with candidate_columns as (
      select c.table_name, c.column_name
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name <> 'trainers'
        and lower(c.column_name) in (
          'trainer_id', 'trainerid', 'trainer_tg_id', 'source_trainer_id',
          'target_trainer_id', 'actor_trainer_id'
        )
      union
      select child.relname, child_col.attname
      from pg_constraint fk
      join pg_class child on child.oid = fk.conrelid
      join pg_namespace child_ns on child_ns.oid = child.relnamespace
      join pg_class parent on parent.oid = fk.confrelid
      join pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
      join lateral unnest(fk.conkey) with ordinality child_key(attnum, ord) on true
      join pg_attribute child_col on child_col.attrelid = child.oid and child_col.attnum = child_key.attnum
      where fk.contype = 'f'
        and child_ns.nspname = 'public'
        and parent_ns.nspname = 'public'
        and parent.relname = 'trainers'
    )
    select distinct table_name, column_name
    from candidate_columns
    where table_name <> 'trainer_groups'
    order by table_name, column_name
  loop
    execute format('select count(*) from public.%I where %I::text = $1', v_dependency.table_name, v_dependency.column_name)
      into v_count using p_trainer_id;

    if v_count > 0 then
      v_label := case v_dependency.table_name
        when 'groups' then 'груп'
        when 'attendance' then 'відвідувань'
        when 'subscriptions' then 'абонементів'
        when 'payments' then 'платежів'
        when 'training_lesson_plans' then 'планів тренувань'
        when 'training_lesson_reports' then 'звітів тренувань'
        when 'room_bookings' then 'бронювань залів'
        when 'group_lesson_overrides' then 'замін у заняттях'
        when 'trial_bookings' then 'пробних записів'
        when 'trainer_dispatch_history' then 'записів історії повідомлень'
        when 'attendance_change_log' then 'записів історії відвідувань'
        when 'subscription_change_log' then 'записів історії абонементів'
        when 'payroll' then 'нарахувань зарплати'
        when 'trainer_payroll' then 'нарахувань зарплати'
        when 'payouts' then 'виплат'
        when 'trainer_payouts' then 'виплат'
        when 'trainer_percentages' then 'налаштувань відсотків'
        when 'trainer_merge_history' then 'записів історії об’єднань'
        when 'trainer_merge_operations' then 'операцій об’єднання'
        when 'audit_logs' then 'записів аудиту'
        when 'mod_log' then 'записів історії змін'
        else format('записів у %I', v_dependency.table_name)
      end;
      v_reasons := array_append(v_reasons, format('%s — %s', v_label, v_count));
    end if;
  end loop;

  if cardinality(v_reasons) > 0 then
    raise exception 'Тренера не можна видалити, бо до нього прив’язані:%', E'\n• ' || array_to_string(v_reasons, E'\n• ')
      using errcode = '23503';
  end if;

  -- The sole allowlisted cleanup is the disposable access mapping. No groups,
  -- finance, lessons, bookings, messages, or history are modified.
  if to_regclass('public.trainer_groups') is not null then
    delete from public.trainer_groups where trainer_id::text = p_trainer_id::text;
  end if;

  delete from public.trainers where id::text = p_trainer_id::text;
  deleted_id := p_trainer_id;
  return next;
end;
$$;

revoke all on function public.delete_archived_trainer(text) from public, anon;
grant execute on function public.delete_archived_trainer(text) to authenticated;

-- END SOURCE: supabase/migrations/20260731130000_delete_archived_trainer.sql

-- BEGIN SOURCE: supabase/migrations/20260731140000_site_content_v2_trainer_profiles.sql
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

-- END SOURCE: supabase/migrations/20260731140000_site_content_v2_trainer_profiles.sql

-- BEGIN SOURCE: supabase/migrations/20260801090000_harden_site_content_table_grants.sql
begin;

revoke all privileges on table public.site_pages
from anon, public;

revoke all privileges on table public.site_direction_profiles
from anon, public;

revoke all privileges on table public.site_trainer_profiles
from anon, public;

commit;

-- END SOURCE: supabase/migrations/20260801090000_harden_site_content_table_grants.sql

-- BEGIN SOURCE: supabase/migrations/20260801091000_site_inquiries_v1.sql
-- CRM inbox for future public-site submissions. The public site is deliberately
-- not connected in V1: table access is denied and only admin-checked CRM RPCs
-- are exposed to authenticated users.

begin;

do $preflight$
declare
  v_mismatch text;
begin
  with expected(table_name, column_name, data_type) as (
    values
      ('directions', 'id', 'text'),
      ('groups', 'id', 'text'),
      ('trainers', 'id', 'uuid'),
      ('waitlist', 'id', 'uuid'),
      ('trial_bookings', 'id', 'uuid'),
      ('students', 'id', 'uuid')
  ), actual as (
    select
      e.*,
      pg_catalog.format_type(a.atttypid, a.atttypmod) as actual_type
    from expected e
    left join pg_catalog.pg_namespace n on n.nspname = 'public'
    left join pg_catalog.pg_class c on c.relnamespace = n.oid and c.relname = e.table_name
    left join pg_catalog.pg_attribute a on a.attrelid = c.oid
      and a.attname = e.column_name and a.attnum > 0 and not a.attisdropped
  )
  select pg_catalog.string_agg(
    table_name || '.' || column_name || ' expected ' || data_type || ', got ' || coalesce(actual_type, 'missing'),
    '; ' order by table_name
  )
  into v_mismatch
  from actual
  where actual_type is distinct from data_type;

  if v_mismatch is not null then
    raise exception using
      errcode = '42804',
      message = 'site_inquiries type preflight failed: ' || v_mismatch;
  end if;

  if pg_catalog.to_regprocedure('public.rls_is_admin()') is null then
    raise exception using errcode = '42883', message = 'public.rls_is_admin() is required';
  end if;
end;
$preflight$;

create table public.site_inquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'new',
  status_changed_at timestamptz not null default now(),
  name text not null,
  phone text,
  phone_normalized text,
  telegram text,
  telegram_normalized text,
  instagram text,
  instagram_normalized text,
  email text,
  email_normalized text,
  preferred_contact text not null default 'any',
  direction_id text references public.directions(id) on update cascade on delete set null,
  direction_name_snapshot text,
  group_id text references public.groups(id) on update cascade on delete set null,
  group_name_snapshot text,
  trainer_id uuid references public.trainers(id) on update cascade on delete set null,
  trainer_name_snapshot text,
  comment text,
  source text not null default 'public_site',
  source_page text,
  referrer text,
  utm_data jsonb not null default '{}'::jsonb,
  privacy_consent_at timestamptz,
  payload_fingerprint text,
  possible_duplicate_of_id uuid references public.site_inquiries(id) on delete set null,
  submission_count integer not null default 1,
  last_submitted_at timestamptz not null default now(),
  admin_note text,
  processed_by uuid references auth.users(id) on delete set null,
  converted_waitlist_id uuid references public.waitlist(id) on delete restrict,
  converted_trial_booking_id uuid references public.trial_bookings(id) on delete restrict,
  converted_student_id uuid references public.students(id) on delete restrict,
  converted_at timestamptz,

  constraint site_inquiries_status_check check (status in (
    'new', 'in_progress', 'converted_to_reserve', 'converted_to_trial',
    'converted_to_student', 'closed', 'spam'
  )),
  constraint site_inquiries_preferred_contact_check check (
    preferred_contact in ('phone', 'telegram', 'instagram', 'email', 'any')
  ),
  constraint site_inquiries_name_check check (
    length(btrim(name)) between 1 and 160
  ),
  constraint site_inquiries_contact_required_check check (
    nullif(btrim(phone), '') is not null
    or nullif(btrim(telegram), '') is not null
    or nullif(btrim(instagram), '') is not null
    or nullif(btrim(email), '') is not null
  ),
  constraint site_inquiries_lengths_check check (
    length(coalesce(phone, '')) <= 80
    and length(coalesce(phone_normalized, '')) <= 40
    and length(coalesce(telegram, '')) <= 120
    and length(coalesce(telegram_normalized, '')) <= 100
    and length(coalesce(instagram, '')) <= 120
    and length(coalesce(instagram_normalized, '')) <= 100
    and length(coalesce(email, '')) <= 254
    and length(coalesce(email_normalized, '')) <= 254
    and length(coalesce(direction_name_snapshot, '')) <= 160
    and length(coalesce(group_name_snapshot, '')) <= 160
    and length(coalesce(trainer_name_snapshot, '')) <= 160
    and length(coalesce(comment, '')) <= 4000
    and length(source) between 1 and 80
    and length(coalesce(source_page, '')) <= 500
    and length(coalesce(referrer, '')) <= 1000
    and length(coalesce(payload_fingerprint, '')) <= 128
    and length(coalesce(admin_note, '')) <= 4000
  ),
  constraint site_inquiries_utm_object_check check (jsonb_typeof(utm_data) = 'object'),
  constraint site_inquiries_submission_count_check check (submission_count >= 1),
  constraint site_inquiries_single_conversion_check check (
    num_nonnulls(converted_waitlist_id, converted_trial_booking_id, converted_student_id) <= 1
  ),
  constraint site_inquiries_conversion_status_check check (
    (status = 'converted_to_reserve' and converted_waitlist_id is not null
      and converted_trial_booking_id is null and converted_student_id is null)
    or (status = 'converted_to_trial' and converted_trial_booking_id is not null
      and converted_waitlist_id is null and converted_student_id is null)
    or (status = 'converted_to_student' and converted_student_id is not null
      and converted_waitlist_id is null and converted_trial_booking_id is null)
    or (status in ('new', 'in_progress', 'closed', 'spam')
      and converted_waitlist_id is null and converted_trial_booking_id is null and converted_student_id is null)
  ),
  constraint site_inquiries_converted_at_check check (
    (num_nonnulls(converted_waitlist_id, converted_trial_booking_id, converted_student_id) = 1)
      = (converted_at is not null)
  ),
  constraint site_inquiries_duplicate_not_self_check check (possible_duplicate_of_id is distinct from id)
);

create index site_inquiries_status_created_at_idx
  on public.site_inquiries(status, created_at desc);
create index site_inquiries_phone_normalized_idx
  on public.site_inquiries(phone_normalized) where phone_normalized is not null;
create index site_inquiries_email_normalized_idx
  on public.site_inquiries(email_normalized) where email_normalized is not null;
create index site_inquiries_payload_fingerprint_idx
  on public.site_inquiries(payload_fingerprint) where payload_fingerprint is not null;

create function public.set_site_inquiry_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := now();
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end;
$function$;

create trigger site_inquiries_set_timestamps
before update on public.site_inquiries
for each row execute function public.set_site_inquiry_timestamps();

alter table public.site_inquiries enable row level security;
revoke all on table public.site_inquiries from public, anon, authenticated;

create function public.crm_fetch_site_inquiries(
  p_status text default null,
  p_search text default null
)
returns setof public.site_inquiries
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.rls_is_admin() then
    raise exception 'Лише адміністратор може переглядати запити з сайту.' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in (
    'new', 'in_progress', 'converted_to_reserve', 'converted_to_trial',
    'converted_to_student', 'closed', 'spam'
  ) then
    raise exception 'Невідомий статус запиту.' using errcode = '22023';
  end if;

  return query
  select si.*
  from public.site_inquiries si
  where (p_status is null or si.status = p_status)
    and (
      nullif(btrim(p_search), '') is null
      or concat_ws(' ', si.name, si.phone, si.telegram, si.instagram, si.email,
        si.direction_name_snapshot, si.group_name_snapshot, si.trainer_name_snapshot,
        si.comment, si.admin_note) ilike '%' || btrim(p_search) || '%'
    )
  order by si.created_at desc;
end;
$function$;

create function public.crm_update_site_inquiry(
  p_inquiry_id uuid,
  p_status text default null,
  p_admin_note text default null,
  p_update_status boolean default false,
  p_update_admin_note boolean default false
)
returns public.site_inquiries
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_current public.site_inquiries;
  v_updated public.site_inquiries;
begin
  if not public.rls_is_admin() then
    raise exception 'Лише адміністратор може змінювати запити з сайту.' using errcode = '42501';
  end if;

  select * into v_current from public.site_inquiries where id = p_inquiry_id for update;
  if not found then
    raise exception 'Запит не знайдено.' using errcode = 'P0002';
  end if;
  if v_current.status not in ('new', 'in_progress', 'closed', 'spam') then
    raise exception 'Конвертований запит доступний лише для перегляду.' using errcode = '55000';
  end if;
  if p_update_status and p_status not in ('new', 'in_progress', 'closed', 'spam') then
    raise exception 'Цей статус недоступний у V1.' using errcode = '22023';
  end if;
  if p_update_admin_note and length(coalesce(p_admin_note, '')) > 4000 then
    raise exception 'Нотатка адміністратора задовга.' using errcode = '22001';
  end if;

  update public.site_inquiries
  set status = case when p_update_status then p_status else status end,
      admin_note = case when p_update_admin_note then nullif(btrim(p_admin_note), '') else admin_note end,
      processed_by = auth.uid()
  where id = p_inquiry_id
  returning * into v_updated;

  return v_updated;
end;
$function$;

revoke all on function public.crm_fetch_site_inquiries(text, text) from public, anon;
revoke all on function public.crm_update_site_inquiry(uuid, text, text, boolean, boolean) from public, anon;
grant execute on function public.crm_fetch_site_inquiries(text, text) to authenticated;
grant execute on function public.crm_update_site_inquiry(uuid, text, text, boolean, boolean) to authenticated;

commit;

-- END SOURCE: supabase/migrations/20260801091000_site_inquiries_v1.sql

-- BEGIN SOURCE: supabase/migrations/20260824090000_align_public_schedule_trainer_source.sql
-- Align the public calendar with the CRM's canonical trainer resolution.
-- The CRM stores primary group assignments in trainer_groups; groups.trainer_id
-- is only a legacy/direct fallback. Slot-level trainers and lesson overrides
-- continue to take precedence.

begin;

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

commit;

-- END SOURCE: supabase/migrations/20260824090000_align_public_schedule_trainer_source.sql

-- BEGIN SOURCE: supabase/migrations/20260914090000_enforce_active_public_schedule_groups.sql
-- Keep inactive or merged groups out of the public calendar.
-- The CRM uses groups.is_active as an operational visibility flag while
-- archived_at remains a separate lifecycle marker. Public groups must satisfy
-- both predicates in addition to their explicit publication setting.

begin;

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
      and g.is_active is true
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

commit;

-- END SOURCE: supabase/migrations/20260914090000_enforce_active_public_schedule_groups.sql

-- BEGIN SOURCE: supabase/migrations/20260914100000_restore_public_schedule_group_filter.sql
-- Restore the public calendar function for the production groups schema.
-- Public visibility is controlled by show_on_public_site, while archived_at
-- excludes archived groups. The production table has no is_active column.

begin;

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

commit;

-- END SOURCE: supabase/migrations/20260914100000_restore_public_schedule_group_filter.sql

-- BEGIN SOURCE: supabase/migrations/20260915090000_site_page_and_direction_content.sql
begin;

-- Add content to the existing site-content model. Empty objects preserve all V1 defaults.
alter table public.site_pages
  add column content jsonb not null default '{}'::jsonb,
  add constraint site_pages_content_object_check check (jsonb_typeof(content) = 'object');

alter table public.site_direction_profiles
  add column content jsonb not null default '{}'::jsonb,
  add constraint site_direction_profiles_content_object_check check (jsonb_typeof(content) = 'object');

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

-- END SOURCE: supabase/migrations/20260915090000_site_page_and_direction_content.sql

-- BEGIN SOURCE: supabase/migrations/20260915120000_site_header_logo.sql
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

-- END SOURCE: supabase/migrations/20260915120000_site_header_logo.sql

-- BEGIN SOURCE: supabase/migrations/20260915150000_site_branding_independent_of_home_publication.sql
begin;

-- Keep global branding available even when the home page itself is unpublished.
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

revoke all on function public.fetch_public_site_config() from public;
grant execute on function public.fetch_public_site_config() to anon, authenticated;

commit;

-- END SOURCE: supabase/migrations/20260915150000_site_branding_independent_of_home_publication.sql

-- BEGIN SOURCE: supabase/migrations/20260916090000_fix_attendance_trainer_group_rls.sql
-- Make Attendance authorization use the CRM's canonical many-to-many trainer
-- assignment. This migration deliberately does not backfill groups.trainer_id.

begin;

create or replace function public.rls_owns_group(p_group_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trainers as t
    join public.trainer_groups as tg on tg.trainer_id = t.id
    where t.auth_user_id = auth.uid()
      and t.is_active is true
      and t.archived_at is null
      and t.access_disabled_at is null
      and tg.group_id = p_group_id
  );
$$;

create or replace function public.rls_can_access_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trainers as t
    join public.trainer_groups as tg on tg.trainer_id = t.id
    join public.student_groups as sg on sg.group_id = tg.group_id
    where t.auth_user_id = auth.uid()
      and t.is_active is true
      and t.archived_at is null
      and t.access_disabled_at is null
      and sg.student_id = p_student_id
  );
$$;

-- Attendance needs a stricter predicate than general roster visibility: the
-- student must belong to the group written on this particular attendance row.
create or replace function public.rls_can_record_attendance(
  p_student_id uuid,
  p_group_id text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_student_id is not null
    and p_group_id is not null
    and exists (
      select 1
      from public.trainers as t
      join public.trainer_groups as tg on tg.trainer_id = t.id
      join public.student_groups as sg
        on sg.group_id = tg.group_id
       and sg.student_id = p_student_id
      where t.auth_user_id = auth.uid()
        and t.is_active is true
        and t.archived_at is null
        and t.access_disabled_at is null
        and tg.group_id = p_group_id
    );
$$;

create or replace function public.rls_can_access_subscription(
  p_sub_id uuid,
  p_student_id uuid,
  p_group_id text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_sub_id is not null
    and p_student_id is not null
    and p_group_id is not null
    and public.rls_can_record_attendance(p_student_id, p_group_id)
    and exists (
      select 1
      from public.subscriptions as s
      where s.id = p_sub_id
        and s.student_id = p_student_id
        and s.group_id = p_group_id
    );
$$;

revoke execute on function public.rls_owns_group(text) from public, anon;
revoke execute on function public.rls_can_access_student(uuid) from public, anon;
revoke execute on function public.rls_can_record_attendance(uuid, text) from public, anon;
revoke execute on function public.rls_can_access_subscription(uuid, uuid, text) from public, anon;
grant execute on function public.rls_owns_group(text) to authenticated;
grant execute on function public.rls_can_access_student(uuid) to authenticated;
grant execute on function public.rls_can_record_attendance(uuid, text) to authenticated;
grant execute on function public.rls_can_access_subscription(uuid, uuid, text) to authenticated;

-- Keep the administrator policy untouched. Rebuild only trainer write policies
-- so repeated migration execution has the same result.
drop policy if exists attendance_trainer_insert_own_groups on public.attendance;
create policy attendance_trainer_insert_own_groups
on public.attendance
for insert
to authenticated
with check (
  group_id is not null
  and public.rls_owns_group(group_id)
  and (
    (student_id is null and sub_id is null)
    or (
      public.rls_can_record_attendance(student_id, group_id)
      and (
        sub_id is null
        or public.rls_can_access_subscription(sub_id, student_id, group_id)
      )
    )
  )
);

drop policy if exists attendance_trainer_update_own_groups on public.attendance;
create policy attendance_trainer_update_own_groups
on public.attendance
for update
to authenticated
using (group_id is not null and public.rls_owns_group(group_id))
with check (
  group_id is not null
  and public.rls_owns_group(group_id)
  and (
    (student_id is null and sub_id is null)
    or (
      public.rls_can_record_attendance(student_id, group_id)
      and (
        sub_id is null
        or public.rls_can_access_subscription(sub_id, student_id, group_id)
      )
    )
  )
);

commit;

-- END SOURCE: supabase/migrations/20260916090000_fix_attendance_trainer_group_rls.sql

-- BEGIN SOURCE: supabase/migrations/20260917090000_fix_trainer_schedule_rooms.sql
-- Keep trainer Schedule room labels accurate without exposing booking-private data.
begin;

do $preflight$
declare
  v_missing text;
  v_args integer;
begin
  select string_agg(required.name, ', ' order by required.name)
    into v_missing
  from (values
    ('room_bookings'), ('studio_rooms'), ('trainers')
  ) as required(name)
  where to_regclass('public.' || required.name) is null;

  if v_missing is not null then
    raise exception 'schedule room migration requires tables: %', v_missing;
  end if;

  if to_regprocedure('public.crm_is_admin_session()') is null
     or to_regprocedure('public.crm_is_active_trainer_session()') is null then
    raise exception 'canonical CRM session helpers are required';
  end if;

  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.room_bookings'::regclass
      and attname = 'room_name' and atttypid = 'text'::regtype and not attisdropped
  ) then
    raise exception 'room_bookings.room_name text is required';
  end if;

  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.trainers'::regclass
      and attname = 'auth_user_id' and atttypid = 'uuid'::regtype and not attisdropped
  ) then
    raise exception 'trainers.auth_user_id uuid is required';
  end if;

  select count(*) into v_args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'crm_fetch_schedule_room_bookings'
    and p.pronargs <> 0;
  if v_args > 0 then
    raise exception 'unexpected parameterized crm_fetch_schedule_room_bookings overload';
  end if;
end;
$preflight$;

-- RETURNS TABLE gains room_name, so CREATE OR REPLACE is not valid here.
-- Deliberately omit CASCADE: unexpected dependencies must abort the transaction.
drop function if exists public.crm_fetch_schedule_room_bookings();

create function public.crm_fetch_schedule_room_bookings()
returns table (
  id uuid,
  date date,
  start_time text,
  end_time text,
  trainer_id text,
  trainer_name text,
  title text,
  type text,
  booking_type text,
  people_count integer,
  price integer,
  payment_method text,
  event_type text,
  note text,
  color text,
  recurrence text,
  recurrence_until date,
  description text,
  status text,
  created_at timestamptz,
  room_name text
)
language sql
stable
security definer
set search_path = public
as $function$
  with visible as (
    select
      rb.*,
      public.crm_is_admin_session() as is_admin,
      exists (
        select 1
        from public.trainers t
        where t.auth_user_id = auth.uid()
          and (
            rb.trainer_id::text = auth.uid()::text
            or t.id::text = rb.trainer_id::text
          )
          and t.is_active is true
          and t.archived_at is null
          and t.access_disabled_at is null
      ) as is_owner
    from public.room_bookings rb
    where public.crm_is_admin_session() or public.crm_is_active_trainer_session()
  )
  select
    v.id, v.date, v.start_time, v.end_time, v.trainer_id::text, v.trainer_name,
    v.title, v.type, v.booking_type,
    case when v.is_admin or v.is_owner then v.people_count else null end,
    case when v.is_admin or v.is_owner then v.price else null end,
    case when v.is_admin or v.is_owner then v.payment_method else null end,
    v.event_type,
    case when v.is_admin or v.is_owner then v.note else null end,
    v.color, v.recurrence, v.recurrence_until,
    case when v.is_admin or v.is_owner then v.description else null end,
    v.status, v.created_at, v.room_name
  from visible v
  order by v.date asc, v.start_time asc;
$function$;

revoke execute on function public.crm_fetch_schedule_room_bookings() from public, anon;
grant execute on function public.crm_fetch_schedule_room_bookings() to authenticated;

create or replace function public.crm_fetch_active_studio_rooms()
returns table (
  id uuid,
  name text,
  is_active boolean,
  sort_order integer,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $function$
  select sr.id, sr.name, sr.is_active, sr.sort_order, sr.created_at
  from public.studio_rooms sr
  where sr.is_active is true
    and (public.crm_is_admin_session() or public.crm_is_active_trainer_session())
  order by sr.sort_order asc, sr.created_at asc, sr.name asc;
$function$;

revoke execute on function public.crm_fetch_active_studio_rooms() from public, anon;
grant execute on function public.crm_fetch_active_studio_rooms() to authenticated;

-- Preserve a narrow read surface even if columns are added later. RLS still
-- gates rows, while room management remains admin-only.
revoke select on table public.studio_rooms from authenticated;
grant select (id, name, is_active, sort_order, created_at) on public.studio_rooms to authenticated;

drop policy if exists studio_rooms_select_authenticated on public.studio_rooms;
create policy studio_rooms_select_authenticated
on public.studio_rooms for select to authenticated
using (public.crm_is_admin_session() or public.crm_is_active_trainer_session());

drop policy if exists studio_rooms_admin_mutations on public.studio_rooms;
create policy studio_rooms_admin_mutations
on public.studio_rooms for all to authenticated
using (public.crm_is_admin_session())
with check (public.crm_is_admin_session());

commit;

-- END SOURCE: supabase/migrations/20260917090000_fix_trainer_schedule_rooms.sql

-- BEGIN SOURCE: supabase/migrations/20260918120000_home_page_sections.sql
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

-- END SOURCE: supabase/migrations/20260918120000_home_page_sections.sql

-- BEGIN SOURCE: supabase/migrations/20261002090000_schedule_booking_blocks.sql
begin;

do $preflight$
begin
  if to_regclass('public.studio_rooms') is null or to_regclass('public.room_bookings') is null then
    raise exception 'schedule booking blocks require studio_rooms and room_bookings';
  end if;
  if to_regprocedure('public.crm_is_admin_session()') is null or to_regprocedure('public.crm_is_active_trainer_session()') is null then
    raise exception 'canonical CRM session helpers are required';
  end if;
end $preflight$;

create or replace function public.crm_valid_iso_weekdays(p_days smallint[])
returns boolean language sql immutable set search_path=public as $$
  select coalesce(cardinality(p_days)>0 and p_days <@ array[1,2,3,4,5,6,7]::smallint[] and cardinality(p_days)=(select count(distinct d) from unnest(p_days)d),false)
$$;

create table if not exists public.schedule_booking_blocks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  note text,
  starts_on date not null,
  ends_on date not null,
  start_time time not null,
  end_time time not null,
  all_rooms boolean not null default false,
  weekdays smallint[] not null,
  is_active boolean not null default true,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_booking_blocks_title_check check (length(btrim(title)) between 1 and 120),
  constraint schedule_booking_blocks_note_check check (note is null or length(note) <= 2000),
  constraint schedule_booking_blocks_dates_check check (starts_on <= ends_on),
  constraint schedule_booking_blocks_times_check check (start_time < end_time),
  constraint schedule_booking_blocks_weekdays_check check (public.crm_valid_iso_weekdays(weekdays))
);

create table if not exists public.schedule_booking_block_rooms (
  block_id uuid not null references public.schedule_booking_blocks(id) on delete cascade,
  room_id uuid not null references public.studio_rooms(id),
  primary key (block_id, room_id)
);

alter table public.schedule_booking_blocks enable row level security;
alter table public.schedule_booking_block_rooms enable row level security;
revoke all on public.schedule_booking_blocks, public.schedule_booking_block_rooms from public, anon, authenticated;

drop policy if exists schedule_booking_blocks_read on public.schedule_booking_blocks;
create policy schedule_booking_blocks_read on public.schedule_booking_blocks for select to authenticated
using (public.crm_is_admin_session() or public.crm_is_active_trainer_session());
drop policy if exists schedule_booking_block_rooms_read on public.schedule_booking_block_rooms;
create policy schedule_booking_block_rooms_read on public.schedule_booking_block_rooms for select to authenticated
using (public.crm_is_admin_session() or public.crm_is_active_trainer_session());

create or replace function public.crm_validate_booking_block_input(
  p_title text, p_note text, p_starts_on date, p_ends_on date, p_start_time time,
  p_end_time time, p_all_rooms boolean, p_weekdays smallint[], p_room_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.crm_is_admin_session() then raise exception 'Лише адміністратор може змінювати закриті години' using errcode='42501'; end if;
  if p_title is null or length(btrim(p_title)) not between 1 and 120 then raise exception 'Назва повинна містити 1–120 символів'; end if;
  if length(coalesce(p_note,'')) > 2000 then raise exception 'Нотатка задовга'; end if;
  if p_starts_on is null or p_ends_on is null or p_starts_on > p_ends_on then raise exception 'Некоректний діапазон дат'; end if;
  if p_start_time is null or p_end_time is null or p_start_time >= p_end_time then raise exception 'Некоректний діапазон часу'; end if;
  if cardinality(p_weekdays) is null or cardinality(p_weekdays)=0 or exists(select 1 from unnest(p_weekdays) d where d not between 1 and 7) or cardinality(p_weekdays)<>(select count(distinct d) from unnest(p_weekdays)d) then raise exception 'Дні тижня мають бути унікальними ISO 1–7'; end if;
  if coalesce(p_all_rooms,false)=false and coalesce(cardinality(p_room_ids),0)=0 then raise exception 'Оберіть хоча б одну залу'; end if;
  if coalesce(p_all_rooms,false) and coalesce(cardinality(p_room_ids),0)>0 then raise exception 'Для всіх зал room links не передаються'; end if;
  if exists(select 1 from unnest(coalesce(p_room_ids,'{}')) id left join public.studio_rooms r on r.id=id where r.id is null) then raise exception 'Невідома зала'; end if;
end $$;

create or replace function public.crm_admin_create_schedule_booking_block(p_title text,p_note text,p_starts_on date,p_ends_on date,p_start_time time,p_end_time time,p_all_rooms boolean,p_weekdays smallint[],p_room_ids uuid[] default '{}',p_is_active boolean default true)
returns public.schedule_booking_blocks language plpgsql security definer set search_path=public as $$
declare v_row public.schedule_booking_blocks;
begin
  perform public.crm_validate_booking_block_input(p_title,p_note,p_starts_on,p_ends_on,p_start_time,p_end_time,p_all_rooms,p_weekdays,p_room_ids);
  insert into public.schedule_booking_blocks(title,note,starts_on,ends_on,start_time,end_time,all_rooms,weekdays,is_active,created_by)
  values(btrim(p_title),nullif(p_note,''),p_starts_on,p_ends_on,p_start_time,p_end_time,p_all_rooms,p_weekdays,coalesce(p_is_active,true),auth.uid()) returning * into v_row;
  if not p_all_rooms then insert into public.schedule_booking_block_rooms select v_row.id, id from unnest(p_room_ids) id; end if;
  return v_row;
end $$;

create or replace function public.crm_admin_update_schedule_booking_block(p_id uuid,p_title text,p_note text,p_starts_on date,p_ends_on date,p_start_time time,p_end_time time,p_all_rooms boolean,p_weekdays smallint[],p_room_ids uuid[] default '{}',p_is_active boolean default true)
returns public.schedule_booking_blocks language plpgsql security definer set search_path=public as $$
declare v_row public.schedule_booking_blocks;
begin
  perform public.crm_validate_booking_block_input(p_title,p_note,p_starts_on,p_ends_on,p_start_time,p_end_time,p_all_rooms,p_weekdays,p_room_ids);
  update public.schedule_booking_blocks set title=btrim(p_title),note=nullif(p_note,''),starts_on=p_starts_on,ends_on=p_ends_on,start_time=p_start_time,end_time=p_end_time,all_rooms=p_all_rooms,weekdays=p_weekdays,is_active=coalesce(p_is_active,true),updated_at=now() where id=p_id returning * into v_row;
  if v_row.id is null then raise exception 'Правило не знайдено'; end if;
  delete from public.schedule_booking_block_rooms where block_id=p_id;
  if not p_all_rooms then insert into public.schedule_booking_block_rooms select p_id,id from unnest(p_room_ids)id; end if;
  return v_row;
end $$;

create or replace function public.crm_admin_delete_schedule_booking_block(p_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
begin
  if not public.crm_is_admin_session() then raise exception 'Лише адміністратор може видаляти закриті години' using errcode='42501'; end if;
  delete from public.schedule_booking_blocks where id=p_id;
  if not found then raise exception 'Правило не знайдено'; end if;
  return p_id;
end $$;

create or replace function public.crm_fetch_schedule_booking_blocks()
returns table(id uuid,title text,note text,starts_on date,ends_on date,start_time time,end_time time,all_rooms boolean,weekdays smallint[],is_active boolean,created_by uuid,created_at timestamptz,updated_at timestamptz,room_ids uuid[],room_names text[])
language sql stable security definer set search_path=public as $$
 select b.id,b.title,b.note,b.starts_on,b.ends_on,b.start_time,b.end_time,b.all_rooms,b.weekdays,b.is_active,b.created_by,b.created_at,b.updated_at,
 coalesce(array_agg(r.id order by r.name) filter(where r.id is not null),'{}'),coalesce(array_agg(r.name order by r.name) filter(where r.id is not null),'{}')
 from public.schedule_booking_blocks b left join public.schedule_booking_block_rooms br on br.block_id=b.id left join public.studio_rooms r on r.id=br.room_id
 where public.crm_is_admin_session() or public.crm_is_active_trainer_session() group by b.id order by b.starts_on,b.start_time;
$$;

-- Candidate dates are generated only inside a block's finite date range. This
-- keeps open-ended recurrences safe and makes monthly recurrence skip months
-- that do not contain the original day (for example, January 31 -> March 31).
create or replace function public.crm_schedule_booking_occurs_on(p_start date,p_candidate date,p_recurrence text)
returns boolean language sql immutable set search_path=public as $$
  select case lower(coalesce(p_recurrence,'none'))
    when 'none' then p_candidate=p_start
    when 'daily' then p_candidate>=p_start
    when 'weekly' then p_candidate>=p_start and (p_candidate-p_start)%7=0
    when 'monthly' then p_candidate>=p_start and extract(day from p_candidate)=extract(day from p_start)
    else p_candidate=p_start
  end
$$;

create or replace function public.crm_schedule_booking_recurrence_hits_block(
  p_start date,p_until date,p_recurrence text,p_block_start date,p_block_end date,p_weekdays smallint[])
returns boolean language plpgsql immutable set search_path=public as $$
declare
  v_mode text := lower(coalesce(p_recurrence,'none'));
  v_from date := greatest(p_start,p_block_start);
  v_to date;
  v_candidate date;
  v_month date;
  v_offset integer;
  i integer;
begin
  if v_mode not in ('daily','weekly','monthly') then
    return p_start between p_block_start and p_block_end
      and extract(isodow from p_start)::smallint=any(p_weekdays);
  end if;
  v_to := least(coalesce(p_until,p_block_end),p_block_end);
  if v_from > v_to then return false; end if;
  if v_mode='daily' then
    -- Seven dates cover every possible ISO weekday, regardless of rule length.
    for i in 0..least(6,v_to-v_from) loop
      if extract(isodow from (v_from+i))::smallint=any(p_weekdays) then return true; end if;
    end loop;
    return false;
  elsif v_mode='weekly' then
    v_offset := v_from-p_start;
    v_candidate := p_start + (((v_offset+6)/7)*7);
    return v_candidate <= v_to and extract(isodow from v_candidate)::smallint=any(p_weekdays);
  end if;

  -- Monthly work scales by months, never days; invalid dates such as February
  -- 31 roll forward and are rejected by the day equality check.
  v_month := date_trunc('month',v_from)::date;
  while v_month <= date_trunc('month',v_to)::date loop
    v_candidate := (v_month + (extract(day from p_start)::integer-1))::date;
    if extract(day from v_candidate)=extract(day from p_start)
       and v_candidate between v_from and v_to
       and extract(isodow from v_candidate)::smallint=any(p_weekdays) then return true; end if;
    v_month := (v_month+interval '1 month')::date;
  end loop;
  return false;
end $$;

create or replace function public.crm_schedule_booking_step_date(p_date date,p_recurrence text,p_direction integer)
returns date language plpgsql immutable set search_path=public as $$
declare v_month date; v_candidate date; i integer;
begin
  if p_direction not in (-1,1) then raise exception 'direction must be -1 or 1'; end if;
  if lower(coalesce(p_recurrence,''))='daily' then return p_date+p_direction; end if;
  if lower(coalesce(p_recurrence,''))='weekly' then return p_date+(7*p_direction); end if;
  if lower(coalesce(p_recurrence,''))<>'monthly' then return null; end if;
  v_month:=date_trunc('month',p_date)::date;
  for i in 1..12 loop
    v_month:=(v_month+(p_direction*interval '1 month'))::date;
    v_candidate:=(v_month+(extract(day from p_date)::integer-1))::date;
    if extract(day from v_candidate)=extract(day from p_date) then return v_candidate; end if;
  end loop;
  return null;
end $$;

create or replace function public.crm_schedule_booking_update_only_shrinks(old_start date,old_until date,new_start date,new_until date,p_recurrence text)
returns boolean language sql immutable set search_path=public as $$
  select lower(coalesce(p_recurrence,'')) in ('daily','weekly','monthly')
    and new_start>=old_start
    and public.crm_schedule_booking_occurs_on(old_start,new_start,p_recurrence)
    and (old_until is null or (new_until is not null and new_until<=old_until))
    and (new_until is null or new_start<=new_until)
    and (new_start>old_start or (new_until is not null and (old_until is null or new_until<old_until)))
$$;

create or replace function public.crm_canonical_room_name(p_name text)
returns text language sql immutable set search_path=public as $$
  select lower(btrim(regexp_replace(coalesce(p_name,''),'[[:space:]]+',' ','g')))
$$;

create or replace function public.crm_occurrence_removal_signature(p_date date,p_start text,p_end text,p_room text,p_recurrence text,p_until date,p_status text,p_trainer text)
returns text language sql immutable set search_path=public as $$
  select concat_ws('|',p_date::text,coalesce(p_start,''),coalesce(p_end,''),public.crm_canonical_room_name(p_room),lower(coalesce(p_recurrence,'none')),coalesce(p_until::text,''),coalesce(p_status,'active'),coalesce(p_trainer,''))
$$;

-- Replace the canonical rename RPC so its room-booking metadata cascade can
-- cross existing blocks without opening a general room_name bypass.
create or replace function public.rename_studio_room(p_room_id uuid,p_new_name text)
returns public.studio_rooms language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_room public.studio_rooms;
  v_old_name text;
  v_previous_old text := current_setting('crm.room_rename_old_name',true);
  v_previous_new text := current_setting('crm.room_rename_new_name',true);
begin
  if not public.crm_is_admin_session() then raise exception 'Лише адміністратор може перейменовувати зали' using errcode='42501'; end if;
  if p_room_id is null or nullif(btrim(p_new_name),'') is null then raise exception 'room id and name are required' using errcode='22023'; end if;
  select name into v_old_name from public.studio_rooms where id=p_room_id for update;
  if not found then raise exception 'studio room not found' using errcode='P0002'; end if;
  update public.studio_rooms set name=btrim(p_new_name) where id=p_room_id returning * into v_room;

  perform set_config('crm.room_rename_old_name',public.crm_canonical_room_name(v_old_name),true);
  perform set_config('crm.room_rename_new_name',public.crm_canonical_room_name(v_room.name),true);
  begin
    update public.room_bookings set room_name=v_room.name
    where public.crm_canonical_room_name(room_name)=public.crm_canonical_room_name(v_old_name);
  exception when others then
    perform set_config('crm.room_rename_old_name',coalesce(v_previous_old,''),true);
    perform set_config('crm.room_rename_new_name',coalesce(v_previous_new,''),true);
    raise;
  end;
  perform set_config('crm.room_rename_old_name',coalesce(v_previous_old,''),true);
  perform set_config('crm.room_rename_new_name',coalesce(v_previous_new,''),true);

  update public.group_lesson_overrides set room_name=v_room.name
  where public.crm_canonical_room_name(room_name)=public.crm_canonical_room_name(v_old_name);
  with rewritten as (
    select g.id,jsonb_agg(case when jsonb_typeof(slot.value)='object' and
      (coalesce(slot.value->>'roomId',slot.value->>'room_id')=p_room_id::text or
       (nullif(btrim(coalesce(slot.value->>'roomId',slot.value->>'room_id')),'') is null and
        public.crm_canonical_room_name(coalesce(slot.value->>'roomName',slot.value->>'room_name',slot.value->>'room',slot.value->>'location',slot.value->>'hall',''))=public.crm_canonical_room_name(v_old_name)))
      then (slot.value-'room_id'-'room_name'-'room'-'location'-'hall')||jsonb_build_object('roomId',p_room_id::text,'roomName',v_room.name)
      else slot.value end order by slot.ordinality) schedule
    from public.groups g cross join lateral jsonb_array_elements(case when jsonb_typeof(g.schedule)='array' then g.schedule else '[]'::jsonb end) with ordinality slot(value,ordinality)
    where jsonb_typeof(g.schedule)='array' group by g.id)
  update public.groups g set schedule=rewritten.schedule from rewritten where g.id=rewritten.id and rewritten.schedule is distinct from g.schedule;
  return v_room;
end $$;

create or replace function public.crm_enforce_schedule_booking_blocks()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_title text;
begin
  if coalesce(new.status,'active')='cancelled' then return new; end if;
  if tg_op='INSERT' and current_setting('crm.occurrence_removal_continuation',true)='on'
     and public.crm_occurrence_removal_signature(new.date,new.start_time,new.end_time,new.room_name,new.recurrence,new.recurrence_until,new.status,new.trainer_id::text)=current_setting('crm.occurrence_removal_signature',true)
  then return new; end if;
  if tg_op='UPDATE'
     and new.start_time is not distinct from old.start_time
     and new.end_time is not distinct from old.end_time
     and public.crm_canonical_room_name(new.room_name)=public.crm_canonical_room_name(old.room_name)
     and new.status is not distinct from old.status
     and new.recurrence is not distinct from old.recurrence
     and public.crm_schedule_booking_update_only_shrinks(old.date,old.recurrence_until,new.date,new.recurrence_until,new.recurrence)
  then return new; end if;
  if tg_op='UPDATE' and public.crm_is_admin_session()
     and new.date is not distinct from old.date
     and new.start_time is not distinct from old.start_time
     and new.end_time is not distinct from old.end_time
     and new.recurrence is not distinct from old.recurrence
     and new.recurrence_until is not distinct from old.recurrence_until
     and new.status is not distinct from old.status
     and coalesce(current_setting('crm.room_rename_old_name',true),'')<>''
     and coalesce(current_setting('crm.room_rename_new_name',true),'')<>''
     and public.crm_canonical_room_name(old.room_name)=current_setting('crm.room_rename_old_name',true)
     and public.crm_canonical_room_name(new.room_name)=current_setting('crm.room_rename_new_name',true)
  then return new; end if;
  select b.title into v_title
  from public.schedule_booking_blocks b
  where b.is_active
    and public.crm_schedule_booking_recurrence_hits_block(new.date,new.recurrence_until,new.recurrence,b.starts_on,b.ends_on,b.weekdays)
    and new.start_time::time < b.end_time and b.start_time < new.end_time::time
    and (b.all_rooms or exists(select 1 from public.schedule_booking_block_rooms br join public.studio_rooms r on r.id=br.room_id where br.block_id=b.id and public.crm_canonical_room_name(r.name)=public.crm_canonical_room_name(new.room_name)))
  limit 1;
  if v_title is not null then
    if public.crm_is_admin_session()
       and current_setting('crm.booking_block_override',true)='on' then return new; end if;
    raise exception 'Цей час закритий адміністратором: %',v_title using errcode='P0001';
  end if;
  return new;
end $$;

drop trigger if exists trg_enforce_schedule_booking_blocks on public.room_bookings;
create trigger trg_enforce_schedule_booking_blocks before insert or update of date,start_time,end_time,room_name,status,recurrence,recurrence_until on public.room_bookings for each row execute function public.crm_enforce_schedule_booking_blocks();

create or replace function public.crm_remove_room_booking_occurrence(p_id uuid,p_occurrence_date date)
returns boolean language plpgsql security definer set search_path=public as $$
declare
  v_old public.room_bookings;
  v_next date;
  v_prev date;
  v_previous_context text:=current_setting('crm.occurrence_removal_continuation',true);
  v_previous_signature text:=current_setting('crm.occurrence_removal_signature',true);
begin
  select * into v_old from public.room_bookings where id=p_id for update;
  if v_old.id is null then raise exception 'Бронювання не знайдено'; end if;
  if not public.crm_is_admin_session() then
    if not public.crm_is_active_trainer_session() or not exists(
      select 1 from public.trainers t where t.auth_user_id=auth.uid() and t.is_active is true
        and t.archived_at is null and t.access_disabled_at is null
        and (v_old.trainer_id::text=auth.uid()::text or v_old.trainer_id::text=t.id::text)
    ) then raise exception 'Немає права змінювати це бронювання' using errcode='42501'; end if;
  end if;
  if lower(coalesce(v_old.recurrence,'none')) not in ('daily','weekly','monthly')
     or not public.crm_schedule_booking_occurs_on(v_old.date,p_occurrence_date,v_old.recurrence)
     or p_occurrence_date<v_old.date
     or (v_old.recurrence_until is not null and p_occurrence_date>v_old.recurrence_until)
  then raise exception 'Occurrence не належить серії' using errcode='22023'; end if;
  v_next:=public.crm_schedule_booking_step_date(p_occurrence_date,v_old.recurrence,1);
  v_prev:=public.crm_schedule_booking_step_date(p_occurrence_date,v_old.recurrence,-1);
  if p_occurrence_date=v_old.date then
    if v_old.recurrence_until is not null and v_next>v_old.recurrence_until then delete from public.room_bookings where id=p_id;
    else update public.room_bookings set date=v_next where id=p_id; end if;
  elsif v_old.recurrence_until is not null and (v_next is null or v_next>v_old.recurrence_until) then
    update public.room_bookings set recurrence_until=v_prev where id=p_id;
  else
    update public.room_bookings set recurrence_until=v_prev where id=p_id;
    perform set_config('crm.occurrence_removal_continuation','on',true);
    perform set_config('crm.occurrence_removal_signature',public.crm_occurrence_removal_signature(v_next,v_old.start_time,v_old.end_time,v_old.room_name,v_old.recurrence,v_old.recurrence_until,v_old.status,v_old.trainer_id::text),true);
    begin
      insert into public.room_bookings(date,start_time,end_time,trainer_id,trainer_name,title,type,booking_type,people_count,price,payment_method,event_type,note,color,recurrence,recurrence_until,description,status,room_name)
      values(v_next,v_old.start_time,v_old.end_time,v_old.trainer_id,v_old.trainer_name,v_old.title,v_old.type,v_old.booking_type,v_old.people_count,v_old.price,v_old.payment_method,v_old.event_type,v_old.note,v_old.color,v_old.recurrence,v_old.recurrence_until,v_old.description,v_old.status,v_old.room_name);
    exception when others then
      perform set_config('crm.occurrence_removal_continuation',coalesce(v_previous_context,''),true);
      perform set_config('crm.occurrence_removal_signature',coalesce(v_previous_signature,''),true);
      raise;
    end;
    perform set_config('crm.occurrence_removal_continuation',coalesce(v_previous_context,''),true);
    perform set_config('crm.occurrence_removal_signature',coalesce(v_previous_signature,''),true);
  end if;
  return true;
end $$;

-- The override is deliberately available only through these whitelisted,
-- admin-checked writes. set_config(..., true) scopes the flag to this RPC's
-- transaction, so a later ordinary request must pass the trigger again.
create or replace function public.crm_admin_override_create_room_booking(
  p_date date,p_start_time text,p_end_time text,p_trainer_id text,p_trainer_name text,
  p_title text,p_type text,p_booking_type text,p_people_count integer,p_price integer,
  p_payment_method text,p_event_type text,p_note text,p_color text,p_recurrence text,
  p_recurrence_until date,p_description text,p_status text,p_room_name text)
returns public.room_bookings language plpgsql security definer set search_path=public as $$
declare v_row public.room_bookings;
begin
  if not public.crm_is_admin_session() then raise exception 'Лише адміністратор може підтвердити обхід закритих годин' using errcode='42501'; end if;
  perform set_config('crm.booking_block_override','on',true);
  insert into public.room_bookings(date,start_time,end_time,trainer_id,trainer_name,title,type,booking_type,people_count,price,payment_method,event_type,note,color,recurrence,recurrence_until,description,status,room_name)
  values(p_date,p_start_time,p_end_time,p_trainer_id,p_trainer_name,p_title,coalesce(p_type,'individual'),p_booking_type,p_people_count,p_price,p_payment_method,p_event_type,p_note,p_color,coalesce(p_recurrence,'none'),p_recurrence_until,p_description,coalesce(p_status,'active'),p_room_name)
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.crm_admin_override_update_room_booking(
  p_id uuid,p_date date,p_start_time text,p_end_time text,p_trainer_id text,p_trainer_name text,
  p_title text,p_type text,p_booking_type text,p_people_count integer,p_price integer,
  p_payment_method text,p_event_type text,p_note text,p_color text,p_recurrence text,
  p_recurrence_until date,p_description text,p_status text,p_room_name text)
returns public.room_bookings language plpgsql security definer set search_path=public as $$
declare v_row public.room_bookings;
begin
  if not public.crm_is_admin_session() then raise exception 'Лише адміністратор може підтвердити обхід закритих годин' using errcode='42501'; end if;
  perform set_config('crm.booking_block_override','on',true);
  update public.room_bookings set date=p_date,start_time=p_start_time,end_time=p_end_time,
    trainer_id=p_trainer_id,trainer_name=p_trainer_name,title=p_title,type=coalesce(p_type,'individual'),
    booking_type=p_booking_type,people_count=p_people_count,price=p_price,payment_method=p_payment_method,
    event_type=p_event_type,note=p_note,color=p_color,recurrence=coalesce(p_recurrence,'none'),
    recurrence_until=p_recurrence_until,description=p_description,status=coalesce(p_status,'active'),room_name=p_room_name
  where id=p_id returning * into v_row;
  if v_row.id is null then raise exception 'Бронювання не знайдено'; end if;
  return v_row;
end $$;

revoke execute on function public.crm_validate_booking_block_input(text,text,date,date,time,time,boolean,smallint[],uuid[]) from public,anon,authenticated;
revoke execute on function public.crm_valid_iso_weekdays(smallint[]) from public,anon,authenticated;
revoke execute on function public.crm_enforce_schedule_booking_blocks() from public,anon,authenticated;
revoke execute on function public.crm_schedule_booking_occurs_on(date,date,text) from public,anon,authenticated;
revoke execute on function public.crm_schedule_booking_recurrence_hits_block(date,date,text,date,date,smallint[]) from public,anon,authenticated;
revoke execute on function public.crm_schedule_booking_step_date(date,text,integer) from public,anon,authenticated;
revoke execute on function public.crm_schedule_booking_update_only_shrinks(date,date,date,date,text) from public,anon,authenticated;
revoke execute on function public.crm_canonical_room_name(text) from public,anon,authenticated;
revoke execute on function public.crm_occurrence_removal_signature(date,text,text,text,text,date,text,text) from public,anon,authenticated;
revoke execute on function public.crm_remove_room_booking_occurrence(uuid,date) from public,anon;
revoke execute on function public.crm_admin_override_create_room_booking(date,text,text,text,text,text,text,text,integer,integer,text,text,text,text,text,date,text,text,text) from public,anon;
revoke execute on function public.crm_admin_override_update_room_booking(uuid,date,text,text,text,text,text,text,text,integer,integer,text,text,text,text,text,date,text,text,text) from public,anon;
revoke execute on function public.crm_fetch_schedule_booking_blocks() from public,anon;
revoke execute on function public.crm_admin_create_schedule_booking_block(text,text,date,date,time,time,boolean,smallint[],uuid[],boolean) from public,anon;
revoke execute on function public.crm_admin_update_schedule_booking_block(uuid,text,text,date,date,time,time,boolean,smallint[],uuid[],boolean) from public,anon;
revoke execute on function public.crm_admin_delete_schedule_booking_block(uuid) from public,anon;
grant execute on function public.crm_fetch_schedule_booking_blocks() to authenticated;
grant execute on function public.crm_remove_room_booking_occurrence(uuid,date) to authenticated;
grant execute on function public.crm_admin_create_schedule_booking_block(text,text,date,date,time,time,boolean,smallint[],uuid[],boolean), public.crm_admin_update_schedule_booking_block(uuid,text,text,date,date,time,time,boolean,smallint[],uuid[],boolean), public.crm_admin_delete_schedule_booking_block(uuid) to authenticated;
grant execute on function public.crm_admin_override_create_room_booking(date,text,text,text,text,text,text,text,integer,integer,text,text,text,text,text,date,text,text,text), public.crm_admin_override_update_room_booking(uuid,date,text,text,text,text,text,text,text,integer,integer,text,text,text,text,text,date,text,text,text) to authenticated;

commit;

-- END SOURCE: supabase/migrations/20261002090000_schedule_booking_blocks.sql

-- BEGIN SOURCE: supabase/migrations/20261003090000_schedule_booking_blocks_continuous_periods.sql
begin;

-- Keep the CRM helper aligned with the canonical server-side admin policy.
-- auth.uid() makes an authenticated session mandatory; rls_is_admin() owns the
-- actual allow-list decision and does not trust client payloads or role metadata.
create or replace function public.crm_is_admin_session()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and public.rls_is_admin();
$$;

revoke execute on function public.crm_is_admin_session() from public, anon;
grant execute on function public.crm_is_admin_session() to authenticated;

alter table public.schedule_booking_blocks drop constraint if exists schedule_booking_blocks_times_check;
alter table public.schedule_booking_blocks add constraint schedule_booking_blocks_times_check
  check (starts_on < ends_on or start_time < end_time);

create or replace function public.crm_validate_booking_block_input(
  p_title text, p_note text, p_starts_on date, p_ends_on date, p_start_time time,
  p_end_time time, p_all_rooms boolean, p_weekdays smallint[], p_room_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.crm_is_admin_session() then raise exception 'Лише адміністратор може змінювати закриті години' using errcode='42501'; end if;
  if p_title is null or length(btrim(p_title)) not between 1 and 120 then raise exception 'Назва повинна містити 1–120 символів'; end if;
  if length(coalesce(p_note,'')) > 2000 then raise exception 'Нотатка задовга'; end if;
  if p_starts_on is null or p_ends_on is null or p_starts_on > p_ends_on then raise exception 'Некоректний діапазон дат'; end if;
  if p_start_time is null or p_end_time is null or (p_starts_on=p_ends_on and p_start_time>=p_end_time) then raise exception 'Некоректний діапазон часу'; end if;
  if cardinality(p_weekdays) is null or cardinality(p_weekdays)=0 or exists(select 1 from unnest(p_weekdays) d where d not between 1 and 7) or cardinality(p_weekdays)<>(select count(distinct d) from unnest(p_weekdays)d) then raise exception 'Дні тижня мають бути унікальними ISO 1–7'; end if;
  if coalesce(p_all_rooms,false)=false and coalesce(cardinality(p_room_ids),0)=0 then raise exception 'Оберіть хоча б одну залу'; end if;
  if coalesce(p_all_rooms,false) and coalesce(cardinality(p_room_ids),0)>0 then raise exception 'Для всіх зал room links не передаються'; end if;
  if exists(select 1 from unnest(coalesce(p_room_ids,'{}')) as selected(room_id) left join public.studio_rooms r on r.id=selected.room_id where r.id is null) then raise exception 'Невідома зала'; end if;
end $$;

create or replace function public.crm_schedule_booking_recurrence_overlaps_continuous_block(
 p_start date,p_until date,p_recurrence text,p_booking_start time,p_booking_end time,
 p_block_start date,p_block_end date,p_block_start_time time,p_block_end_time time)
returns boolean language sql immutable set search_path=public as $$
  select
    (public.crm_schedule_booking_recurrence_hits_block(p_start,p_until,p_recurrence,p_block_start,p_block_start,array[1,2,3,4,5,6,7]::smallint[]) and p_booking_end>p_block_start_time)
    or
    (public.crm_schedule_booking_recurrence_hits_block(p_start,p_until,p_recurrence,p_block_end,p_block_end,array[1,2,3,4,5,6,7]::smallint[]) and p_booking_start<p_block_end_time)
    or
    (p_block_start+1<=p_block_end-1 and public.crm_schedule_booking_recurrence_hits_block(p_start,p_until,p_recurrence,p_block_start+1,p_block_end-1,array[1,2,3,4,5,6,7]::smallint[]))
$$;

create or replace function public.crm_enforce_schedule_booking_blocks()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_title text;
begin
  if coalesce(new.status,'active')='cancelled' then return new; end if;
  if tg_op='INSERT' and current_setting('crm.occurrence_removal_continuation',true)='on'
     and public.crm_occurrence_removal_signature(new.date,new.start_time,new.end_time,new.room_name,new.recurrence,new.recurrence_until,new.status,new.trainer_id::text)=current_setting('crm.occurrence_removal_signature',true)
  then return new; end if;
  if tg_op='UPDATE'
     and new.start_time is not distinct from old.start_time
     and new.end_time is not distinct from old.end_time
     and public.crm_canonical_room_name(new.room_name)=public.crm_canonical_room_name(old.room_name)
     and new.status is not distinct from old.status
     and new.recurrence is not distinct from old.recurrence
     and public.crm_schedule_booking_update_only_shrinks(old.date,old.recurrence_until,new.date,new.recurrence_until,new.recurrence)
  then return new; end if;
  if tg_op='UPDATE' and public.crm_is_admin_session()
     and new.date is not distinct from old.date
     and new.start_time is not distinct from old.start_time
     and new.end_time is not distinct from old.end_time
     and new.recurrence is not distinct from old.recurrence
     and new.recurrence_until is not distinct from old.recurrence_until
     and new.status is not distinct from old.status
     and coalesce(current_setting('crm.room_rename_old_name',true),'')<>''
     and coalesce(current_setting('crm.room_rename_new_name',true),'')<>''
     and public.crm_canonical_room_name(old.room_name)=current_setting('crm.room_rename_old_name',true)
     and public.crm_canonical_room_name(new.room_name)=current_setting('crm.room_rename_new_name',true)
  then return new; end if;
  select b.title into v_title
  from public.schedule_booking_blocks b
  where b.is_active
    and (
      (b.starts_on < b.ends_on and b.end_time <= b.start_time and public.crm_schedule_booking_recurrence_overlaps_continuous_block(new.date,new.recurrence_until,new.recurrence,new.start_time::time,new.end_time::time,b.starts_on,b.ends_on,b.start_time,b.end_time))
      or
      (not (b.starts_on < b.ends_on and b.end_time <= b.start_time)
       and public.crm_schedule_booking_recurrence_hits_block(new.date,new.recurrence_until,new.recurrence,b.starts_on,b.ends_on,b.weekdays)
       and new.start_time::time < b.end_time and b.start_time < new.end_time::time)
    )
    and (b.all_rooms or exists(select 1 from public.schedule_booking_block_rooms br join public.studio_rooms r on r.id=br.room_id where br.block_id=b.id and public.crm_canonical_room_name(r.name)=public.crm_canonical_room_name(new.room_name)))
  limit 1;
  if v_title is not null then
    if public.crm_is_admin_session()
       and current_setting('crm.booking_block_override',true)='on' then return new; end if;
    raise exception 'Цей час закритий адміністратором: %',v_title using errcode='P0001';
  end if;
  return new;
end $$;


revoke execute on function public.crm_schedule_booking_recurrence_overlaps_continuous_block(date,date,text,time,time,date,date,time,time) from public,anon,authenticated;
revoke execute on function public.crm_validate_booking_block_input(text,text,date,date,time,time,boolean,smallint[],uuid[]) from public,anon,authenticated;

commit;

-- END SOURCE: supabase/migrations/20261003090000_schedule_booking_blocks_continuous_periods.sql

-- BEGIN SOURCE: supabase/migrations/20261005090000_harden_financial_attendance_boundary.sql
-- Enforce the CRM financial boundary at the database layer.
-- Attendance is operational. Only an administrator may create or mutate money.
begin;

do $preflight$
declare v_missing text;
begin
  select string_agg(x.name, ', ' order by x.name) into v_missing
  from (values ('attendance'),('subscriptions'),('room_bookings'),('trainers'),('trainer_groups'),('students'),('student_groups')) x(name)
  where to_regclass('public.' || x.name) is null;
  if v_missing is not null then raise exception 'financial hardening requires tables: %', v_missing; end if;
  if to_regprocedure('public.rls_is_admin()') is null or to_regprocedure('public.rls_owns_group(text)') is null then
    raise exception 'canonical admin/trainer authorization helpers are required';
  end if;
end $preflight$;

do $policy_preflight$
declare v_unknown text;
begin
  select string_agg(quote_ident(tablename)||'.'||quote_ident(policyname),', ' order by tablename,policyname)
  into v_unknown from pg_policies
  where schemaname='public' and tablename in ('attendance','subscriptions')
    and policyname not in (
      'Allow all on attendance','Allow all on subscriptions','attendance_admin_all','attendance_trainer_select_own_groups',
      'attendance_trainer_insert_own_groups','attendance_trainer_update_own_groups','attendance_trainer_delete_own_groups',
      'subscriptions_admin_all','subscriptions_trainer_select_own_group','subscriptions_trainer_insert_own_group',
      'subscriptions_trainer_update_own_group','subscriptions_trainer_delete_own_group'
    );
  if v_unknown is not null then
    raise warning 'financial hardening found unknown attendance/subscription policies; migration will fail unless reviewed: %',v_unknown;
  end if;
end $policy_preflight$;

alter table public.attendance add column if not exists mutation_key uuid;
alter table public.attendance add column if not exists mutation_hash text;
create unique index if not exists attendance_mutation_key_uidx
  on public.attendance (mutation_key) where mutation_key is not null;

alter table public.subscriptions add column if not exists source_attendance_id uuid;
alter table public.subscriptions add column if not exists financial_idempotency_key uuid;
alter table public.subscriptions add column if not exists financial_request_hash text;
create unique index if not exists subscriptions_source_attendance_uidx
  on public.subscriptions (source_attendance_id) where source_attendance_id is not null;
create unique index if not exists subscriptions_financial_idempotency_uidx
  on public.subscriptions (financial_idempotency_key) where financial_idempotency_key is not null;

-- Append-only audit independent from the legacy optional change-log installation.
create table if not exists public.financial_change_audit (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_user_id uuid,
  actor_email text,
  actor_is_admin boolean not null,
  table_name text not null check (table_name in ('subscriptions','room_bookings')),
  row_id text not null,
  operation text not null check (operation in ('INSERT','UPDATE','DELETE')),
  old_record jsonb,
  new_record jsonb
);
create index if not exists financial_change_audit_target_idx
  on public.financial_change_audit (table_name, row_id, occurred_at desc);
alter table public.financial_change_audit enable row level security;
revoke all on public.financial_change_audit from public, anon, authenticated;
grant select on public.financial_change_audit to authenticated;
drop policy if exists financial_change_audit_admin_read on public.financial_change_audit;
create policy financial_change_audit_admin_read on public.financial_change_audit
  for select to authenticated using (public.rls_is_admin());

create or replace function public.crm_audit_financial_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_old jsonb; v_new jsonb; v_id text;
begin
  v_old := case when tg_op <> 'INSERT' then to_jsonb(old) else null end;
  v_new := case when tg_op <> 'DELETE' then to_jsonb(new) else null end;
  v_id := coalesce(v_new->>'id', v_old->>'id');
  insert into public.financial_change_audit
    (actor_user_id, actor_email, actor_is_admin, table_name, row_id, operation, old_record, new_record)
  values
    (auth.uid(), nullif(auth.jwt()->>'email',''), public.rls_is_admin(), tg_table_name, v_id, tg_op, v_old, v_new);
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function public.crm_audit_financial_change() from public, anon, authenticated;

drop trigger if exists subscriptions_financial_audit on public.subscriptions;
create trigger subscriptions_financial_audit after insert or update or delete on public.subscriptions
for each row execute function public.crm_audit_financial_change();
drop trigger if exists room_bookings_financial_audit on public.room_bookings;
create trigger room_bookings_financial_audit after insert or update or delete on public.room_bookings
for each row execute function public.crm_audit_financial_change();

-- Base subscription rows contain finance and are administrator-only. Trainers use
-- operational SECURITY DEFINER read/sync RPCs, never the table.
alter table public.subscriptions enable row level security;
drop policy if exists "Allow all on subscriptions" on public.subscriptions;
drop policy if exists subscriptions_trainer_select_own_group on public.subscriptions;
drop policy if exists subscriptions_trainer_insert_own_group on public.subscriptions;
drop policy if exists subscriptions_trainer_update_own_group on public.subscriptions;
drop policy if exists subscriptions_trainer_delete_own_group on public.subscriptions;
drop policy if exists subscriptions_admin_all on public.subscriptions;
create policy subscriptions_admin_all on public.subscriptions for all to authenticated
  using (public.rls_is_admin()) with check (public.rls_is_admin());
revoke all on public.subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.subscriptions to authenticated;

-- Trainer attendance writes are RPC-only so idempotency and usage updates cannot
-- be bypassed with a direct PostgREST mutation. The existing admin ALL policy is
-- replaced explicitly; trainers retain only a scoped operational SELECT.
alter table public.attendance enable row level security;
drop policy if exists "Allow all on attendance" on public.attendance;
drop policy if exists attendance_admin_all on public.attendance;
drop policy if exists attendance_trainer_insert_own_groups on public.attendance;
drop policy if exists attendance_trainer_update_own_groups on public.attendance;
drop policy if exists attendance_trainer_delete_own_groups on public.attendance;
drop policy if exists attendance_trainer_select_own_groups on public.attendance;
create policy attendance_admin_all on public.attendance for all to authenticated
  using(public.rls_is_admin()) with check(public.rls_is_admin());
create policy attendance_trainer_select_own_groups on public.attendance for select to authenticated
  using(group_id is not null and public.rls_owns_group(group_id));
revoke all on public.attendance from public, anon, authenticated;
grant select, insert, update, delete on public.attendance to authenticated;

do $policy_postflight$
declare v_unknown text;
begin
  select string_agg(quote_ident(tablename)||'.'||quote_ident(policyname),', ' order by tablename,policyname)
  into v_unknown from pg_policies
  where schemaname='public' and tablename in ('attendance','subscriptions')
    and policyname not in ('attendance_admin_all','attendance_trainer_select_own_groups','subscriptions_admin_all');
  if v_unknown is not null then
    raise exception 'Unknown attendance/subscription policies require manual review before hardening: %',v_unknown;
  end if;
  if exists(select 1 from pg_policies where schemaname='public' and tablename='subscriptions' and policyname<>'subscriptions_admin_all')
     or exists(select 1 from pg_policies where schemaname='public' and tablename='attendance' and cmd in ('INSERT','UPDATE','DELETE','ALL') and policyname<>'attendance_admin_all') then
    raise exception 'Financial hardening policy invariant failed';
  end if;
end $policy_postflight$;

-- Roster data is readable by an active trainer only through current group
-- assignments. Membership and student mutations are administrator-only.
create or replace function public.crm_can_view_assigned_student(p_student_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.student_groups sg
    where sg.student_id=p_student_id and public.rls_owns_group(sg.group_id)
  )
$$;
revoke all on function public.crm_can_view_assigned_student(uuid) from public, anon;
grant execute on function public.crm_can_view_assigned_student(uuid) to authenticated;

alter table public.students enable row level security;
drop policy if exists "Allow all on students" on public.students;
drop policy if exists students_admin_all on public.students;
drop policy if exists students_trainer_select_linked on public.students;
drop policy if exists students_trainer_update_linked on public.students;
create policy students_admin_all on public.students for all to authenticated
  using(public.rls_is_admin()) with check(public.rls_is_admin());
create policy students_trainer_select_linked on public.students for select to authenticated
  using(public.crm_can_view_assigned_student(id));
revoke all on public.students from public, anon, authenticated;
grant select, insert, update, delete on public.students to authenticated;

alter table public.student_groups enable row level security;
drop policy if exists "Allow all on student_groups" on public.student_groups;
drop policy if exists student_groups_admin_all on public.student_groups;
drop policy if exists student_groups_trainer_select_own_groups on public.student_groups;
drop policy if exists student_groups_trainer_delete_own_groups on public.student_groups;
create policy student_groups_admin_all on public.student_groups for all to authenticated
  using(public.rls_is_admin()) with check(public.rls_is_admin());
create policy student_groups_trainer_select_own_groups on public.student_groups for select to authenticated
  using(group_id is not null and public.rls_owns_group(group_id));
revoke all on public.student_groups from public, anon, authenticated;
grant select, insert, update, delete on public.student_groups to authenticated;

do $roster_policy_postflight$
declare v_unknown text;
begin
  select string_agg(tablename||'.'||policyname,', ' order by tablename,policyname) into v_unknown
  from pg_policies where schemaname='public' and tablename in ('students','student_groups')
    and policyname not in ('students_admin_all','students_trainer_select_linked','student_groups_admin_all','student_groups_trainer_select_own_groups');
  if v_unknown is not null then
    raise exception 'Unknown student roster policies require manual review before hardening: %',v_unknown;
  end if;
  if exists(select 1 from pg_policies where schemaname='public' and tablename in ('students','student_groups')
    and cmd in ('INSERT','UPDATE','DELETE','ALL') and policyname not in ('students_admin_all','student_groups_admin_all')) then
    raise exception 'Student roster write policy invariant failed';
  end if;
end $roster_policy_postflight$;

-- Legacy roster RPCs used trainer ownership as authorization. Keep them
-- callable by the database owner for compatibility, but remove all client
-- execution and expose administrator-only wrappers.
do $revoke_legacy_roster_rpcs$
begin
  if to_regprocedure('public.crm_create_student_for_group(text,text,text,text,text,text,text,text)') is not null then
    execute 'revoke all on function public.crm_create_student_for_group(text,text,text,text,text,text,text,text) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.crm_restore_student_to_group(text,uuid)') is not null then
    execute 'revoke all on function public.crm_restore_student_to_group(text,uuid) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.crm_convert_trial_booking_to_student(uuid)') is not null then
    execute 'revoke all on function public.crm_convert_trial_booking_to_student(uuid) from public, anon, authenticated';
  end if;
end $revoke_legacy_roster_rpcs$;

create or replace function public.crm_admin_create_student_for_group(
  p_group_id text, p_name text, p_first_name text default null, p_last_name text default null,
  p_phone text default null, p_telegram text default null, p_notes text default null,
  p_message_template text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  if not public.rls_is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  if to_regprocedure('public.crm_create_student_for_group(text,text,text,text,text,text,text,text)') is null then
    raise exception 'Required student creation helper is not installed' using errcode='55000';
  end if;
  execute 'select to_jsonb(x) from public.crm_create_student_for_group($1,$2,$3,$4,$5,$6,$7,$8) x'
    into v_result using p_group_id,p_name,p_first_name,p_last_name,p_phone,p_telegram,p_notes,p_message_template;
  return v_result;
end $$;
revoke all on function public.crm_admin_create_student_for_group(text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.crm_admin_create_student_for_group(text,text,text,text,text,text,text,text) to authenticated;

create or replace function public.crm_admin_restore_student_to_group(p_group_id text,p_student_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  if not public.rls_is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  if to_regprocedure('public.crm_restore_student_to_group(text,uuid)') is null then
    raise exception 'Required student restore helper is not installed' using errcode='55000';
  end if;
  execute 'select to_jsonb(x) from public.crm_restore_student_to_group($1,$2) x limit 1'
    into v_result using p_group_id,p_student_id;
  return v_result;
end $$;
revoke all on function public.crm_admin_restore_student_to_group(text,uuid) from public, anon;
grant execute on function public.crm_admin_restore_student_to_group(text,uuid) to authenticated;

create or replace function public.crm_admin_convert_trial_booking_to_student(p_trial_booking_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  if not public.rls_is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  if to_regprocedure('public.crm_convert_trial_booking_to_student(uuid)') is null then
    raise exception 'Required trial conversion helper is not installed' using errcode='55000';
  end if;
  execute 'select public.crm_convert_trial_booking_to_student($1)' into v_result using p_trial_booking_id;
  return v_result;
end $$;
revoke all on function public.crm_admin_convert_trial_booking_to_student(uuid) from public, anon;
grant execute on function public.crm_admin_convert_trial_booking_to_student(uuid) to authenticated;

create or replace function public.crm_admin_transfer_student_group(
  p_student_id uuid,p_from_group_id text,p_to_group_id text,p_subscription_id uuid default null
) returns table(student_id uuid,from_group_id text,to_group_id text,subscription_id uuid)
language plpgsql security definer set search_path = public as $$
declare v_sub public.subscriptions%rowtype;
begin
  if not public.rls_is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  if p_student_id is null or nullif(btrim(p_from_group_id),'') is null or nullif(btrim(p_to_group_id),'') is null
     or p_from_group_id=p_to_group_id then raise exception 'Valid distinct source and target groups are required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('roster:'||p_student_id::text,0));
  perform 1 from public.student_groups sg where sg.student_id=p_student_id
    and sg.group_id in (p_from_group_id,p_to_group_id) order by sg.group_id for update;
  if not exists(select 1 from public.student_groups sg where sg.student_id=p_student_id and sg.group_id=p_from_group_id) then
    raise exception 'Student is not assigned to source group' using errcode='P0002';
  end if;
  if not exists(select 1 from public.groups g where g.id=p_to_group_id) then
    raise exception 'Target group does not exist' using errcode='23503';
  end if;
  if p_subscription_id is not null then
    select * into v_sub from public.subscriptions s where s.id=p_subscription_id for update;
    if not found or v_sub.student_id is distinct from p_student_id or v_sub.group_id is distinct from p_from_group_id then
      raise exception 'Subscription does not belong to the student and source group' using errcode='42501';
    end if;
  end if;
  insert into public.student_groups(student_id,group_id) values(p_student_id,p_to_group_id)
    on conflict do nothing;
  if p_subscription_id is not null then update public.subscriptions set group_id=p_to_group_id where id=p_subscription_id; end if;
  delete from public.student_groups sg where sg.student_id=p_student_id and sg.group_id=p_from_group_id;
  student_id:=p_student_id; from_group_id:=p_from_group_id; to_group_id:=p_to_group_id; subscription_id:=p_subscription_id;
  return next;
end $$;
revoke all on function public.crm_admin_transfer_student_group(uuid,text,text,uuid) from public, anon;
grant execute on function public.crm_admin_transfer_student_group(uuid,text,text,uuid) to authenticated;

-- Trainers may keep schedule ownership, but money and event identity are immutable
-- to them even if a row policy permits an UPDATE/DELETE.
create or replace function public.crm_is_active_booking_owner(p_trainer_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.trainers t
    where t.auth_user_id=auth.uid()
      and t.is_active is true
      and t.archived_at is null
      and t.access_disabled_at is null
      and (t.id::text=p_trainer_id or t.auth_user_id::text=p_trainer_id)
  )
$$;
revoke all on function public.crm_is_active_booking_owner(text) from public, anon;
grant execute on function public.crm_is_active_booking_owner(text) to authenticated;

create or replace function public.crm_guard_room_booking_finance()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  -- Booking UUID is a stable identity for calendar links, recurrence and audit.
  -- Enforce this before the administrator bypass as well as trainer checks.
  if tg_op='UPDATE' and old.id is distinct from new.id then
    raise exception 'Room booking id is immutable' using errcode='22023';
  end if;
  if public.rls_is_admin() then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if not public.crm_is_active_booking_owner(coalesce(new.trainer_id::text, old.trainer_id::text)) then
    raise exception 'Not allowed' using errcode='42501';
  end if;
  if tg_op='INSERT' and not (
    (new.event_type='room_booking' and new.type='room_booking' and new.booking_type is null)
    or
    (new.event_type='individual_training' and new.type='individual'
      and new.booking_type in ('individual','individual_1_2','small_group_3_9','group_10_plus'))
  ) then
    raise exception 'Unsupported trainer booking classification' using errcode='42501';
  elsif tg_op='INSERT' and (new.price is not null or new.payment_method is not null) then
    raise exception 'Only an administrator may set booking finance' using errcode='42501';
  elsif tg_op='UPDATE' and (
    old.price is distinct from new.price or old.payment_method is distinct from new.payment_method
    or old.event_type is distinct from new.event_type or old.booking_type is distinct from new.booking_type
    or old.type is distinct from new.type or old.trainer_id is distinct from new.trainer_id
  ) then raise exception 'Only an administrator may change booking finance or identity' using errcode='42501';
  elsif tg_op='DELETE' and (
    old.price is not null
    or (old.payment_method is not null and lower(btrim(old.payment_method)) not in ('','none'))
  ) then
    raise exception 'Only an administrator may delete a financially classified booking' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function public.crm_guard_room_booking_finance() from public, anon, authenticated;
drop trigger if exists room_bookings_financial_guard on public.room_bookings;
create trigger room_bookings_financial_guard before insert or update or delete on public.room_bookings
for each row execute function public.crm_guard_room_booking_finance();

-- Install and validate the canonical replacement inventory while the legacy
-- allow-all policy (if present) still keeps the table usable. The surrounding
-- transaction restores the previous inventory if any pre/postflight check fails.
do $room_bookings_policy_preflight$
declare v_missing text; v_unknown text;
begin
  select string_agg(c,', ' order by c) into v_missing
  from unnest(array['id','trainer_id','price','payment_method','type','booking_type','event_type']) c
  where not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='room_bookings' and column_name=c
  );
  if v_missing is not null then
    raise exception 'room_bookings hardening requires columns: %',v_missing;
  end if;
  if to_regprocedure('public.rls_is_admin()') is null
     or to_regprocedure('public.crm_is_active_booking_owner(text)') is null then
    raise exception 'room_bookings canonical authorization helpers are required';
  end if;
  select string_agg(quote_ident(policyname),', ' order by policyname) into v_unknown
  from pg_policies where schemaname='public' and tablename='room_bookings'
    and policyname not in (
      'Allow all on room_bookings','room_bookings_admin_all',
      'room_bookings_trainer_select_own','room_bookings_trainer_insert_own',
      'room_bookings_trainer_update_own','room_bookings_trainer_delete_own',
      'room_bookings_trainer_insert_own_allowed_events',
      'room_bookings_trainer_update_own_allowed_events'
    );
  if v_unknown is not null then
    raise exception 'Unknown room_bookings policies require manual review before hardening: %',v_unknown;
  end if;
end $room_bookings_policy_preflight$;

alter table public.room_bookings enable row level security;
drop policy if exists room_bookings_admin_all on public.room_bookings;
drop policy if exists room_bookings_trainer_select_own on public.room_bookings;
drop policy if exists room_bookings_trainer_insert_own on public.room_bookings;
drop policy if exists room_bookings_trainer_update_own on public.room_bookings;
drop policy if exists room_bookings_trainer_delete_own on public.room_bookings;

create policy room_bookings_admin_all on public.room_bookings for all to authenticated
  using(public.rls_is_admin()) with check(public.rls_is_admin());
create policy room_bookings_trainer_select_own on public.room_bookings for select to authenticated
  using(public.crm_is_active_booking_owner(trainer_id::text));
create policy room_bookings_trainer_insert_own on public.room_bookings for insert to authenticated
  with check(public.crm_is_active_booking_owner(trainer_id::text));
create policy room_bookings_trainer_update_own on public.room_bookings for update to authenticated
  using(public.crm_is_active_booking_owner(trainer_id::text))
  with check(public.crm_is_active_booking_owner(trainer_id::text));
create policy room_bookings_trainer_delete_own on public.room_bookings for delete to authenticated
  using(public.crm_is_active_booking_owner(trainer_id::text));

do $room_bookings_replacement_postflight$
declare v_count integer;
begin
  select count(*) into v_count from pg_policies
  where schemaname='public' and tablename='room_bookings'
    and policyname in ('room_bookings_admin_all','room_bookings_trainer_select_own',
      'room_bookings_trainer_insert_own','room_bookings_trainer_update_own',
      'room_bookings_trainer_delete_own');
  if v_count <> 5 then
    raise exception 'room_bookings replacement policy inventory is incomplete';
  end if;
  if exists (
    select 1 from pg_policies where schemaname='public' and tablename='room_bookings'
      and policyname in ('room_bookings_trainer_select_own','room_bookings_trainer_insert_own',
        'room_bookings_trainer_update_own','room_bookings_trainer_delete_own')
      and coalesce(qual,'')||' '||coalesce(with_check,'') not like '%crm_is_active_booking_owner%'
  ) then
    raise exception 'room_bookings trainer policies do not use canonical ownership';
  end if;
end $room_bookings_replacement_postflight$;

-- Replacement is present and verified; legacy permissive policies can now be
-- removed. Do not silently retain any repository-supported alternative policy.
drop policy if exists "Allow all on room_bookings" on public.room_bookings;
drop policy if exists room_bookings_trainer_insert_own_allowed_events on public.room_bookings;
drop policy if exists room_bookings_trainer_update_own_allowed_events on public.room_bookings;

do $room_bookings_final_postflight$
declare v_actual text; v_expected text := 'room_bookings_admin_all,room_bookings_trainer_delete_own,room_bookings_trainer_insert_own,room_bookings_trainer_select_own,room_bookings_trainer_update_own';
begin
  select string_agg(policyname,',' order by policyname) into v_actual
  from pg_policies where schemaname='public' and tablename='room_bookings';
  if v_actual is distinct from v_expected then
    raise exception 'Unexpected final room_bookings policy inventory: %',coalesce(v_actual,'<none>');
  end if;
end $room_bookings_final_postflight$;

revoke all on public.room_bookings from public, anon, authenticated;
grant select (id,date,start_time,end_time,trainer_id,trainer_name,title,type,booking_type,
  people_count,event_type,note,color,recurrence,recurrence_until,description,status,created_at,room_name)
  on public.room_bookings to authenticated;
grant insert, update, delete on public.room_bookings to authenticated;

-- No legacy attendance helper may manufacture or remove a payment.
-- These helpers existed only in some historical installations. Do not make
-- their absence a migration dependency, but fail closed on EXECUTE wherever
-- either exact legacy signature is present.
do $optional_legacy_payment_helpers$
begin
  if to_regprocedure('public.crm_ensure_one_off_payment_for_attendance(uuid)') is not null then
    execute 'revoke all on function public.crm_ensure_one_off_payment_for_attendance(uuid) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.crm_remove_one_off_payment_if_orphan(uuid)') is not null then
    execute 'revoke all on function public.crm_remove_one_off_payment_if_orphan(uuid) from public, anon, authenticated';
  end if;
end
$optional_legacy_payment_helpers$;

-- Operational subscription projection: canonical active trainer assignments,
-- no amount/paid/method/discount/notes in either the result or nested objects.
create or replace function public.crm_fetch_my_attendance_subscriptions()
returns table (
  id uuid, student_id uuid, group_id text, plan_type text, start_date date,
  end_date date, total_trainings integer, used_trainings integer,
  notification_sent boolean, created_at timestamptz, activation_date date,
  original_end_date date
) language sql stable security definer set search_path = public as $$
  select s.id,s.student_id,s.group_id,s.plan_type,s.start_date,s.end_date,
    s.total_trainings,s.used_trainings,s.notification_sent,s.created_at,
    s.activation_date,s.original_end_date
  from public.subscriptions s
  where auth.uid() is not null and public.rls_owns_group(s.group_id)
  order by s.created_at desc
$$;
revoke all on function public.crm_fetch_my_attendance_subscriptions() from public, anon;
grant execute on function public.crm_fetch_my_attendance_subscriptions() to authenticated;

-- Schedule projection never exposes price or payment method to a trainer,
-- including the owner of the booking.
create or replace function public.crm_fetch_schedule_room_bookings()
returns table (
  id uuid,date date,start_time text,end_time text,trainer_id text,trainer_name text,
  title text,type text,booking_type text,people_count integer,price integer,
  payment_method text,event_type text,note text,color text,recurrence text,
  recurrence_until date,description text,status text,created_at timestamptz,room_name text
) language sql stable security definer set search_path = public as $$
  select rb.id,rb.date,rb.start_time,rb.end_time,rb.trainer_id::text,rb.trainer_name,
    rb.title,rb.type,rb.booking_type,
    case when public.crm_is_admin_session() or public.crm_is_active_booking_owner(rb.trainer_id::text)
      then rb.people_count else null end,
    case when public.crm_is_admin_session() then rb.price else null end,
    case when public.crm_is_admin_session() then rb.payment_method else null end,
    rb.event_type,
    case when public.crm_is_admin_session() or public.crm_is_active_booking_owner(rb.trainer_id::text)
      then rb.note else null end,
    rb.color,rb.recurrence,rb.recurrence_until,
    case when public.crm_is_admin_session() or public.crm_is_active_booking_owner(rb.trainer_id::text)
      then rb.description else null end,
    rb.status,rb.created_at,rb.room_name
  from public.room_bookings rb
  where public.crm_is_admin_session() or public.crm_is_active_trainer_session()
  order by rb.date,rb.start_time
$$;
revoke all on function public.crm_fetch_schedule_room_bookings() from public, anon;
grant execute on function public.crm_fetch_schedule_room_bookings() to authenticated;

-- One canonical, lock-owning usage synchronizer shared by every attendance
-- mutation. It mirrors the established crm_sync_subscription_usage contract.
create or replace function public.crm_sync_subscription_usage_internal(p_sub_id uuid)
returns public.subscriptions language plpgsql security definer set search_path=public as $$
declare
  v_sub public.subscriptions%rowtype;
  v_used integer;
  v_first date;
  v_last date;
  v_end date;
  v_canonical_end date;
  v_pack boolean;
begin
  select * into v_sub from public.subscriptions s where s.id=p_sub_id for update;
  if not found then raise exception 'Subscription not found' using errcode='P0002'; end if;
  select coalesce(sum(coalesce(a.quantity,1)),0)::integer,min(a.date),max(a.date)
    into v_used,v_first,v_last from public.attendance a where a.sub_id=p_sub_id;
  v_pack:=lower(btrim(coalesce(v_sub.plan_type,''))) in ('4pack','8pack','12pack');
  -- original_end_date is the administrator-controlled period boundary.  The
  -- client writes it together with an intentional end_date change.  Capture a
  -- missing value before the first automatic pack shortening, but never infer
  -- an extension for historical rows that were already shortened without it.
  v_canonical_end:=coalesce(v_sub.original_end_date,v_sub.end_date);
  v_end:=v_sub.end_date;
  if v_pack then
    if coalesce(v_sub.total_trainings,0)>0 and v_used>=v_sub.total_trainings
       and v_last is not null and v_canonical_end is not null then
      v_end:=least(v_last,v_canonical_end);
    elsif v_used<coalesce(v_sub.total_trainings,0) then
      v_end:=v_canonical_end;
    end if;
  end if;
  update public.subscriptions s set
    used_trainings=v_used,
    activation_date=v_first,
    end_date=v_end,
    original_end_date=case when v_pack then coalesce(s.original_end_date,s.end_date) else s.original_end_date end
  where s.id=p_sub_id returning * into v_sub;
  return v_sub;
end $$;
revoke all on function public.crm_sync_subscription_usage_internal(uuid) from public,anon,authenticated;

create or replace function public.crm_sync_subscription_usage(p_sub_id uuid)
returns table(id uuid,student_id uuid,group_id text,plan_type text,start_date date,end_date date,
  total_trainings integer,used_trainings integer,notification_sent boolean,created_at timestamptz,
  activation_date date,original_end_date date)
language plpgsql security definer set search_path=public as $$
declare v_sub public.subscriptions%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode='28000'; end if;
  select * into v_sub from public.subscriptions s where s.id=p_sub_id;
  if not found then raise exception 'Subscription not found' using errcode='P0002'; end if;
  if not (public.rls_is_admin() or public.rls_owns_group(v_sub.group_id)) then raise exception 'Not allowed' using errcode='42501'; end if;
  v_sub:=public.crm_sync_subscription_usage_internal(p_sub_id);
  return query select v_sub.id,v_sub.student_id,v_sub.group_id,v_sub.plan_type,v_sub.start_date,v_sub.end_date,
    v_sub.total_trainings,v_sub.used_trainings,v_sub.notification_sent,v_sub.created_at,v_sub.activation_date,v_sub.original_end_date;
end $$;
revoke all on function public.crm_sync_subscription_usage(uuid) from public,anon;
grant execute on function public.crm_sync_subscription_usage(uuid) to authenticated;

create or replace function public.crm_record_attendance(
  p_sub_id uuid, p_student_id uuid, p_date date, p_guest_name text,
  p_guest_type text, p_group_id text, p_quantity integer,
  p_entry_type text, p_idempotency_key uuid
) returns table (
  id uuid, sub_id uuid, student_id uuid, date date, guest_name text,
  guest_type text, group_id text, quantity integer, entry_type text
) language plpgsql security definer set search_path = public as $$
declare
  v_row public.attendance%rowtype;
  v_sub public.subscriptions%rowtype;
  v_type text;
  v_is_admin boolean;
  v_request_hash text;
  v_existing_usage integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode='28000'; end if;
  v_is_admin := public.rls_is_admin();
  if not v_is_admin and current_setting('crm.trainer_presence_internal',true) is distinct from 'on' then
    raise exception 'Trainers must record neutral presence through crm_record_trainer_presence' using errcode='42501';
  end if;
  if not (v_is_admin or public.rls_owns_group(p_group_id)) then raise exception 'Not allowed' using errcode='42501'; end if;
  if p_idempotency_key is null or p_date is null or p_group_id is null or coalesce(p_quantity,0) < 1 then
    raise exception 'Invalid attendance input' using errcode='22023';
  end if;
  -- Canonical create order: natural identity, student/group, subscription, rows.
  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|',p_group_id,p_date::text,
    coalesce(p_student_id::text,lower(btrim(p_guest_name)))),0));
  if p_student_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(concat_ws('|','attendance',p_group_id,p_student_id::text),0));
  end if;
  v_request_hash := md5(concat_ws('|',coalesce(p_sub_id::text,''),coalesce(p_student_id::text,''),p_date::text,
    lower(coalesce(btrim(p_guest_name),'')),lower(coalesce(btrim(p_guest_type),'')),p_group_id,p_quantity::text,
    lower(coalesce(btrim(p_entry_type),''))));
  select * into v_row from public.attendance a where a.mutation_key=p_idempotency_key;
  if found then
    if v_row.mutation_hash is distinct from v_request_hash then raise exception 'Idempotency key conflict' using errcode='23505'; end if;
    return query select v_row.id,v_row.sub_id,v_row.student_id,v_row.date,v_row.guest_name,v_row.guest_type,v_row.group_id,v_row.quantity,v_row.entry_type;
    return;
  end if;
  v_type := lower(coalesce(nullif(btrim(p_entry_type),''),'debt'));
  if v_type not in ('subscription','trial','single','debt','unpaid') then raise exception 'Invalid attendance type' using errcode='22023'; end if;
  if p_sub_id is not null then
    v_type := 'subscription';
  elsif p_student_id is not null and v_type not in ('trial','single','unpaid') then
    v_type := 'debt';
  elsif p_student_id is null and v_type not in ('trial','single') then
    raise exception 'Guest attendance must be trial or single' using errcode='22023';
  end if;
  if not v_is_admin and p_student_id is not null and not public.rls_can_record_attendance(p_student_id,p_group_id) then
    raise exception 'Student is outside trainer group' using errcode='42501';
  end if;
  -- Under the natural-identity lock, retry detection must precede capacity
  -- accounting: the first request may have consumed the final training.
  select * into v_row from public.attendance a
  where a.group_id=p_group_id and a.date=p_date
    and a.student_id is not distinct from p_student_id
    and lower(coalesce(a.guest_name,''))=lower(coalesce(case when p_student_id is null then nullif(btrim(p_guest_name),'') end,''))
    and a.sub_id is not distinct from p_sub_id
    and lower(coalesce(a.entry_type,a.guest_type,''))=v_type
  order by a.created_at nulls last, a.id limit 1;
  if found then
    if v_row.mutation_hash is distinct from v_request_hash then
      raise exception 'Attendance payload conflicts with existing record' using errcode='23505';
    end if;
    return query select v_row.id,v_row.sub_id,v_row.student_id,v_row.date,v_row.guest_name,v_row.guest_type,v_row.group_id,v_row.quantity,v_row.entry_type;
    return;
  end if;
  if p_sub_id is not null then
    select * into v_sub from public.subscriptions s where s.id=p_sub_id for update;
    if not found or v_sub.student_id is distinct from p_student_id or v_sub.group_id is distinct from p_group_id then
      raise exception 'Subscription does not match attendance' using errcode='22023';
    end if;
    if p_date < coalesce(v_sub.activation_date,v_sub.start_date) or p_date > v_sub.end_date then
      raise exception 'Subscription does not cover attendance date' using errcode='22023';
    end if;
    select coalesce(sum(coalesce(a.quantity,1)),0)::integer into v_existing_usage
    from public.attendance a where a.sub_id=p_sub_id;
    v_existing_usage := greatest(v_existing_usage,coalesce(v_sub.used_trainings,0));
    if v_existing_usage + p_quantity > coalesce(v_sub.total_trainings,0) then
      raise exception 'Subscription has no remaining trainings' using errcode='22023';
    end if;
  end if;
  insert into public.attendance(sub_id,student_id,date,guest_name,guest_type,group_id,quantity,entry_type,mutation_key,mutation_hash)
  values(p_sub_id,p_student_id,p_date,case when p_student_id is null then nullif(btrim(p_guest_name),'') else null end,
    case when p_student_id is null then v_type else null end,p_group_id,p_quantity,v_type,p_idempotency_key,v_request_hash)
  returning * into v_row;
  if p_sub_id is not null then
    perform public.crm_sync_subscription_usage_internal(p_sub_id);
  end if;
  return query select v_row.id,v_row.sub_id,v_row.student_id,v_row.date,v_row.guest_name,v_row.guest_type,v_row.group_id,v_row.quantity,v_row.entry_type;
exception when unique_violation then
  select * into v_row from public.attendance a where a.mutation_key=p_idempotency_key;
  if not found or v_row.mutation_hash is distinct from v_request_hash then
    raise exception 'Idempotency key conflict' using errcode='23505';
  end if;
  return query select v_row.id,v_row.sub_id,v_row.student_id,v_row.date,v_row.guest_name,v_row.guest_type,v_row.group_id,v_row.quantity,v_row.entry_type;
end $$;
revoke all on function public.crm_record_attendance(uuid,uuid,date,text,text,text,integer,text,uuid) from public, anon;
grant execute on function public.crm_record_attendance(uuid,uuid,date,text,text,text,integer,text,uuid) to authenticated;

create or replace function public.crm_record_trainer_presence(
  p_student_id uuid,p_date date,p_group_id text,p_quantity integer,p_idempotency_key uuid
) returns table(id uuid,sub_id uuid,student_id uuid,date date,guest_name text,guest_type text,group_id text,quantity integer,entry_type text)
language plpgsql security definer set search_path=public as $$
declare v_sub_id uuid; v_row public.attendance%rowtype; v_natural_count integer;
begin
  if auth.uid() is null or not public.rls_can_record_attendance(p_student_id,p_group_id) then raise exception 'Not allowed' using errcode='42501'; end if;
  if p_student_id is null then raise exception 'Student is required' using errcode='22023'; end if;
  -- Match crm_record_attendance exactly: natural identity before student/group,
  -- then subscription. Nested acquisition is re-entrant and keeps this order.
  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|',p_group_id,p_date::text,p_student_id::text),0));
  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|','attendance',p_group_id,p_student_id::text),0));
  -- Resolve retries from the neutral trainer payload before subscription
  -- selection. The first request may have consumed the final credit, so
  -- reclassifying first would incorrectly turn the retry into unpaid.
  select * into v_row from public.attendance a where a.mutation_key=p_idempotency_key;
  if found then
    if v_row.student_id is distinct from p_student_id
       or v_row.group_id is distinct from p_group_id
       or v_row.date is distinct from p_date
       or v_row.quantity is distinct from p_quantity
       or lower(coalesce(v_row.entry_type,'')) not in ('subscription','unpaid') then
      raise exception 'Trainer presence idempotency key conflict' using errcode='23505';
    end if;
    return query select v_row.id,v_row.sub_id,v_row.student_id,v_row.date,v_row.guest_name,v_row.guest_type,v_row.group_id,v_row.quantity,v_row.entry_type;
    return;
  end if;
  select count(*)::integer into v_natural_count from public.attendance a
  where a.group_id=p_group_id and a.date=p_date and a.student_id=p_student_id;
  if v_natural_count>1 then
    raise exception 'Trainer presence natural identity is ambiguous' using errcode='23505';
  elsif v_natural_count=1 then
    select * into v_row from public.attendance a
    where a.group_id=p_group_id and a.date=p_date and a.student_id=p_student_id;
    if v_row.quantity is distinct from p_quantity
       or lower(coalesce(v_row.entry_type,'')) not in ('subscription','unpaid') then
      raise exception 'Trainer presence payload conflicts with existing attendance' using errcode='23505';
    end if;
    return query select v_row.id,v_row.sub_id,v_row.student_id,v_row.date,v_row.guest_name,v_row.guest_type,v_row.group_id,v_row.quantity,v_row.entry_type;
    return;
  end if;
  select s.id into v_sub_id from public.subscriptions s
  where s.student_id=p_student_id and s.group_id=p_group_id
    and p_date between coalesce(s.activation_date,s.start_date) and s.end_date
    and greatest(
      coalesce(s.used_trainings,0),
      (select coalesce(sum(coalesce(a.quantity,1)),0) from public.attendance a where a.sub_id=s.id)
    )<coalesce(s.total_trainings,0)
  order by coalesce(s.activation_date,s.start_date),s.created_at,s.id for update limit 1;
  perform set_config('crm.trainer_presence_internal','on',true);
  return query select * from public.crm_record_attendance(v_sub_id,p_student_id,p_date,null,null,p_group_id,p_quantity,
    case when v_sub_id is null then 'unpaid' else 'subscription' end,p_idempotency_key);
end $$;
revoke all on function public.crm_record_trainer_presence(uuid,date,text,integer,uuid) from public,anon;
grant execute on function public.crm_record_trainer_presence(uuid,date,text,integer,uuid) to authenticated;

create table if not exists public.attendance_quantity_mutations (
  idempotency_key uuid primary key,
  attendance_id uuid not null,
  expected_quantity integer not null,
  target_quantity integer not null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
alter table public.attendance_quantity_mutations enable row level security;
revoke all on public.attendance_quantity_mutations from public, anon, authenticated;

create or replace function public.crm_replace_attendance_quantity(
  p_attendance_id uuid, p_expected_quantity integer, p_target_quantity integer,
  p_idempotency_key uuid
) returns table (
  id uuid, sub_id uuid, student_id uuid, date date, guest_name text,
  guest_type text, group_id text, quantity integer, entry_type text
) language plpgsql security definer set search_path = public as $$
declare
  v_row public.attendance%rowtype;
  v_probe public.attendance%rowtype;
  v_sub public.subscriptions%rowtype;
  v_previous public.attendance_quantity_mutations%rowtype;
  v_usage_without_row integer;
begin
  -- Quantity corrections affect subscription credits and are financial/admin
  -- operations. Authorize before validation, advisory locks or any table read.
  if auth.uid() is null or not public.rls_is_admin() then
    raise exception 'Administrator required' using errcode='42501';
  end if;
  if p_attendance_id is null or p_idempotency_key is null
     or coalesce(p_expected_quantity,0) < 1 or coalesce(p_target_quantity,0) < 1 then
    raise exception 'Invalid attendance quantity input' using errcode='22023';
  end if;

  -- The request-key lock makes key reuse deterministic even for different rows.
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,0));
  select * into v_previous from public.attendance_quantity_mutations aqm
  where aqm.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.attendance_id is distinct from p_attendance_id
       or v_previous.expected_quantity is distinct from p_expected_quantity
       or v_previous.target_quantity is distinct from p_target_quantity then
      raise exception 'Idempotency key conflict' using errcode='23505';
    end if;
    select * into v_row from public.attendance a where a.id=p_attendance_id;
    if not found or v_row.quantity is distinct from p_target_quantity then
      raise exception 'Attendance changed after idempotent request' using errcode='40001';
    end if;
    return query select v_row.id,v_row.sub_id,v_row.student_id,v_row.date,v_row.guest_name,v_row.guest_type,v_row.group_id,v_row.quantity,v_row.entry_type;
    return;
  end if;

  select * into v_probe from public.attendance a where a.id=p_attendance_id;
  if not found then raise exception 'Attendance not found' using errcode='P0002'; end if;
  if v_probe.student_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(concat_ws('|','attendance',v_probe.group_id,v_probe.student_id::text),0));
  end if;
  if v_probe.sub_id is not null then
    select * into v_sub from public.subscriptions s where s.id=v_probe.sub_id for update;
  end if;
  select * into v_row from public.attendance a where a.id=p_attendance_id for update;
  if not found then raise exception 'Attendance not found' using errcode='P0002'; end if;
  if v_row.student_id is distinct from v_probe.student_id or v_row.group_id is distinct from v_probe.group_id
     or v_row.sub_id is distinct from v_probe.sub_id then
    raise exception 'Attendance changed during quantity update' using errcode='40001';
  end if;
  if v_row.sub_id is null then
    raise exception 'Quantity changes require subscription attendance; unpaid and debt attendance support exactly one training'
      using errcode='22023';
  end if;
  if v_row.quantity is distinct from p_expected_quantity then
    raise exception 'Attendance quantity conflict' using errcode='40001';
  end if;

  if v_row.sub_id is not null then
    if not found or v_sub.student_id is distinct from v_row.student_id
       or v_sub.group_id is distinct from v_row.group_id then
      raise exception 'Subscription does not match attendance' using errcode='22023';
    end if;
    if v_row.date < coalesce(v_sub.activation_date,v_sub.start_date) or v_row.date > v_sub.end_date then
      raise exception 'Subscription does not cover attendance date' using errcode='22023';
    end if;
    select coalesce(sum(coalesce(a.quantity,1)),0)::integer into v_usage_without_row
    from public.attendance a where a.sub_id=v_row.sub_id and a.id<>v_row.id;
    if v_usage_without_row + p_target_quantity > coalesce(v_sub.total_trainings,0) then
      raise exception 'Subscription has no remaining trainings' using errcode='22023';
    end if;
  end if;

  update public.attendance a set quantity=p_target_quantity where a.id=v_row.id returning a.* into v_row;
  if v_row.sub_id is not null then
    perform public.crm_sync_subscription_usage_internal(v_row.sub_id);
  end if;
  insert into public.attendance_quantity_mutations(
    idempotency_key,attendance_id,expected_quantity,target_quantity,created_by
  ) values(p_idempotency_key,p_attendance_id,p_expected_quantity,p_target_quantity,auth.uid());
  return query select v_row.id,v_row.sub_id,v_row.student_id,v_row.date,v_row.guest_name,v_row.guest_type,v_row.group_id,v_row.quantity,v_row.entry_type;
end $$;
revoke all on function public.crm_replace_attendance_quantity(uuid,integer,integer,uuid) from public, anon;
grant execute on function public.crm_replace_attendance_quantity(uuid,integer,integer,uuid) to authenticated;

create table if not exists public.attendance_subscription_conversions (
  idempotency_key uuid primary key,
  subscription_id uuid not null,
  attendance_ids uuid[] not null default '{}',
  created_by uuid not null,
  created_at timestamptz not null default now()
);
alter table public.attendance_subscription_conversions enable row level security;
revoke all on public.attendance_subscription_conversions from public,anon,authenticated;

create or replace function public.crm_admin_convert_unpaid_attendance_to_subscription(
  p_subscription_id uuid,p_idempotency_key uuid
) returns table (
  id uuid,sub_id uuid,student_id uuid,date date,guest_name text,
  guest_type text,group_id text,quantity integer,entry_type text
) language plpgsql security definer set search_path=public as $$
declare
  v_sub public.subscriptions%rowtype;
  v_sub_probe public.subscriptions%rowtype;
  v_previous public.attendance_subscription_conversions%rowtype;
  v_ids uuid[];
  v_candidate_usage integer;
  v_linked_usage integer;
begin
  if auth.uid() is null or not public.rls_is_admin() then
    raise exception 'Administrator required' using errcode='42501';
  end if;
  if p_subscription_id is null or p_idempotency_key is null then
    raise exception 'Subscription and idempotency key are required' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,0));
  select * into v_previous from public.attendance_subscription_conversions c
  where c.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.subscription_id is distinct from p_subscription_id then
      raise exception 'Idempotency key conflict' using errcode='23505';
    end if;
    return query select a.id,a.sub_id,a.student_id,a.date,a.guest_name,a.guest_type,a.group_id,a.quantity,a.entry_type
      from public.attendance a where a.id=any(v_previous.attendance_ids) order by a.date,a.id;
    return;
  end if;

  select * into v_sub_probe from public.subscriptions s where s.id=p_subscription_id;
  if not found then raise exception 'Subscription not found' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|','attendance',v_sub_probe.group_id,v_sub_probe.student_id::text),0));
  select * into v_sub from public.subscriptions s where s.id=p_subscription_id for update;
  if not found then raise exception 'Subscription not found' using errcode='P0002'; end if;

  -- Candidate rows are locked in deterministic order before their quantities
  -- are aggregated. Locks remain held through capacity check, update and sync.
  perform 1 from public.attendance a
  where a.sub_id is null and a.student_id=v_sub.student_id and a.group_id=v_sub.group_id
    and a.date between coalesce(v_sub.activation_date,v_sub.start_date) and v_sub.end_date
    and lower(coalesce(a.entry_type,'')) in ('debt','unpaid')
    and not exists(select 1 from public.subscriptions paid where paid.source_attendance_id=a.id)
  order by a.date,a.id for update;

  select coalesce(array_agg(a.id order by a.date,a.id),'{}'::uuid[]),coalesce(sum(coalesce(a.quantity,1)),0)::integer
  into v_ids,v_candidate_usage
  from public.attendance a
  where a.sub_id is null and a.student_id=v_sub.student_id and a.group_id=v_sub.group_id
    and a.date between coalesce(v_sub.activation_date,v_sub.start_date) and v_sub.end_date
    and lower(coalesce(a.entry_type,'')) in ('debt','unpaid')
    and not exists(select 1 from public.subscriptions paid where paid.source_attendance_id=a.id);

  select coalesce(sum(coalesce(a.quantity,1)),0)::integer into v_linked_usage
  from public.attendance a where a.sub_id=p_subscription_id;
  if greatest(coalesce(v_sub.used_trainings,0),v_linked_usage)+v_candidate_usage > coalesce(v_sub.total_trainings,0) then
    raise exception 'Subscription has no capacity for unpaid attendance' using errcode='22023';
  end if;

  update public.attendance a set sub_id=p_subscription_id,entry_type='subscription',guest_name=null,guest_type=null
  where a.id=any(v_ids);
  perform public.crm_sync_subscription_usage_internal(p_subscription_id);
  insert into public.attendance_subscription_conversions(idempotency_key,subscription_id,attendance_ids,created_by)
  values(p_idempotency_key,p_subscription_id,v_ids,auth.uid());
  return query select a.id,a.sub_id,a.student_id,a.date,a.guest_name,a.guest_type,a.group_id,a.quantity,a.entry_type
    from public.attendance a where a.id=any(v_ids) order by a.date,a.id;
end $$;
revoke all on function public.crm_admin_convert_unpaid_attendance_to_subscription(uuid,uuid) from public,anon;
grant execute on function public.crm_admin_convert_unpaid_attendance_to_subscription(uuid,uuid) to authenticated;

create or replace function public.crm_delete_attendance(p_attendance_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_row public.attendance%rowtype; v_probe public.attendance%rowtype; v_sub public.subscriptions%rowtype; v_is_admin boolean;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode='28000'; end if;
  select * into v_probe from public.attendance where id=p_attendance_id;
  if not found then return; end if;
  v_is_admin := public.rls_is_admin();
  if not v_is_admin and (
    v_probe.student_id is null
    or not public.rls_can_record_attendance(v_probe.student_id,v_probe.group_id)
  ) then
    raise exception 'Trainer may delete only authorized student attendance' using errcode='42501';
  end if;
  if v_probe.student_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(concat_ws('|','attendance',v_probe.group_id,v_probe.student_id::text),0));
  end if;
  -- Serialize every usage-changing operation for this subscription before the
  -- attendance disappears, then calculate from the committed remaining rows.
  if v_probe.sub_id is not null then
    select * into v_sub from public.subscriptions s where s.id=v_probe.sub_id for update;
  end if;
  select * into v_row from public.attendance where id=p_attendance_id for update;
  if not found then return; end if;
  if v_row.student_id is distinct from v_probe.student_id or v_row.group_id is distinct from v_probe.group_id
     or v_row.sub_id is distinct from v_probe.sub_id then
    raise exception 'Attendance changed during delete' using errcode='40001';
  end if;
  if not v_is_admin and (
    v_row.student_id is null
    or not public.rls_can_record_attendance(v_row.student_id,v_row.group_id)
  ) then
    raise exception 'Trainer may delete only authorized student attendance' using errcode='42501';
  end if;
  delete from public.attendance where id=p_attendance_id;
  if v_row.sub_id is not null then
    perform public.crm_sync_subscription_usage_internal(v_row.sub_id);
  end if;
  -- Deliberately never delete or alter a payment. source_attendance_id remains an audit link.
end $$;
revoke all on function public.crm_delete_attendance(uuid) from public, anon;
grant execute on function public.crm_delete_attendance(uuid) to authenticated;

create or replace function public.crm_relink_guest_attendance(
  p_group_id text, p_student_id uuid, p_attendance_ids uuid[]
) returns table (
  id uuid, sub_id uuid, student_id uuid, date date, guest_name text,
  guest_type text, group_id text, quantity integer, entry_type text
) language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode='28000'; end if;
  if not public.rls_is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  if p_student_id is null
     or not exists(select 1 from public.groups g where g.id=p_group_id)
     or not exists(select 1 from public.students s where s.id=p_student_id)
     or not exists(select 1 from public.student_groups sg where sg.student_id=p_student_id and sg.group_id=p_group_id) then
    raise exception 'Student is not linked to group' using errcode='22023';
  end if;
  return query
  update public.attendance a set student_id=p_student_id,guest_name=null,guest_type=null,sub_id=null,
    entry_type=case when lower(coalesce(a.entry_type,a.guest_type,'')) in ('trial','single')
      then lower(coalesce(a.entry_type,a.guest_type)) else 'debt' end
  where a.id=any(coalesce(p_attendance_ids,'{}')) and a.group_id=p_group_id and a.student_id is null
  returning a.id,a.sub_id,a.student_id,a.date,a.guest_name,a.guest_type,a.group_id,a.quantity,a.entry_type;
end $$;
revoke all on function public.crm_relink_guest_attendance(text,uuid,uuid[]) from public, anon;
grant execute on function public.crm_relink_guest_attendance(text,uuid,uuid[]) to authenticated;

create table if not exists public.guest_conversion_mutations (
  idempotency_key uuid primary key, request_hash text not null, student_id uuid not null,
  created_by uuid not null, created_at timestamptz not null default now()
);
alter table public.guest_conversion_mutations enable row level security;
revoke all on public.guest_conversion_mutations from public, anon, authenticated;

create or replace function public.crm_convert_guest_to_student(
  p_group_id text,p_attendance_ids uuid[],p_name text,p_first_name text,p_last_name text,
  p_phone text,p_telegram text,p_notes text,p_message_template text,p_idempotency_key uuid
) returns setof public.students language plpgsql security definer set search_path=public as $$
declare v_hash text; v_student_id uuid; v_count integer; v_previous public.guest_conversion_mutations%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode='28000'; end if;
  if not public.rls_is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  if p_idempotency_key is null or coalesce(array_length(p_attendance_ids,1),0)=0 or nullif(btrim(p_name),'') is null then
    raise exception 'Invalid guest conversion input' using errcode='22023';
  end if;
  v_hash:=md5(concat_ws('|',p_group_id,array_to_string(p_attendance_ids,','),btrim(p_name),coalesce(p_phone,''),coalesce(p_telegram,'')));
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,0));
  select * into v_previous from public.guest_conversion_mutations gcm where gcm.idempotency_key=p_idempotency_key;
  if found then
    if v_previous.request_hash is distinct from v_hash then raise exception 'Guest conversion idempotency conflict' using errcode='23505'; end if;
    return query select s.* from public.students s where s.id=v_previous.student_id; return;
  end if;
  perform 1 from public.attendance a where a.id=any(p_attendance_ids) for update;
  select count(*)::integer into v_count from public.attendance a
  where a.id=any(p_attendance_ids) and a.group_id=p_group_id and a.student_id is null;
  if v_count<>cardinality(p_attendance_ids) then raise exception 'Guest attendance changed or is outside group' using errcode='40001'; end if;
  select c.id into v_student_id from public.crm_create_student_for_group(
    p_group_id,p_name,p_first_name,p_last_name,p_phone,p_telegram,p_notes,p_message_template
  ) c limit 1;
  if v_student_id is null then raise exception 'Student creation failed'; end if;
  perform public.crm_relink_guest_attendance(p_group_id,v_student_id,p_attendance_ids);
  insert into public.guest_conversion_mutations(idempotency_key,request_hash,student_id,created_by)
  values(p_idempotency_key,v_hash,v_student_id,auth.uid());
  return query select s.* from public.students s where s.id=v_student_id;
end $$;
revoke all on function public.crm_convert_guest_to_student(text,uuid[],text,text,text,text,text,text,text,uuid) from public,anon;
grant execute on function public.crm_convert_guest_to_student(text,uuid[],text,text,text,text,text,text,text,uuid) to authenticated;

-- Admin-only preflight. Legacy paid/card flags are deliberately reported as
-- unverified; they are never treated as evidence that money was received.
create or replace function public.crm_admin_inspect_attendance_payment(p_attendance_id uuid)
returns table (status text, message text, legacy_subscription_id uuid)
language plpgsql stable security definer set search_path = public as $$
declare v_att public.attendance%rowtype; v_legacy public.subscriptions%rowtype; v_count integer; v_type text;
begin
  if auth.uid() is null or not public.rls_is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  if exists(select 1 from public.subscriptions s where s.source_attendance_id=p_attendance_id) then
    return query select 'already_confirmed'::text,'Payment is already confirmed; refresh attendance'::text,null::uuid; return;
  end if;
  select * into v_att from public.attendance a where a.id=p_attendance_id;
  if not found then
    raise exception 'Student attendance not found' using errcode='P0002';
  end if;
  if coalesce(v_att.quantity,1)<>1 then
    return query select 'unsupported_quantity'::text,
      ('Payment confirmation currently supports exactly one training; attendance quantity is '||v_att.quantity::text)::text,null::uuid;
    return;
  end if;
  select count(*)::integer into v_count from public.subscriptions s
  where s.notes=('auto_one_off_from_attendance:'||p_attendance_id::text);
  if v_count=0 then
    -- Some legacy helpers reused a matching paid one-off without writing either
    -- technical source marker. Treat every such candidate as unverified and
    -- block a second payment; paid/method flags are not proof of receipt.
    select count(*)::integer into v_count from public.subscriptions s
    where s.source_attendance_id is null
      and coalesce(s.notes,'') not like 'auto_one_off_from_attendance:%'
      and s.paid is true
      and s.student_id is not distinct from v_att.student_id
      and s.group_id is not distinct from v_att.group_id
      and lower(coalesce(s.plan_type,'')) in ('trial','single')
      and coalesce(s.total_trainings,1)=1
      and v_att.date between s.start_date and s.end_date
      and (lower(coalesce(v_att.entry_type,v_att.guest_type,'')) not in ('trial','single')
        or lower(s.plan_type)=lower(coalesce(v_att.entry_type,v_att.guest_type,'')));
    if v_count>0 then
      return query select 'legacy_unmarked_match'::text,
        'Можливо, для цього відвідування вже існує історична оплата без технічного зв’язку. Перевірте вручну.'::text,
        null::uuid;
      return;
    end if;
    return query select 'clear'::text,null::text,null::uuid;
    return;
  end if;
  if v_count>1 then return query select 'ambiguous'::text,'Multiple legacy payments require manual reconciliation'::text,null::uuid; return; end if;
  select * into v_legacy from public.subscriptions s where s.notes=('auto_one_off_from_attendance:'||p_attendance_id::text);
  v_type:=case when lower(coalesce(v_att.entry_type,v_att.guest_type,''))='trial' then 'trial' else 'single' end;
  if v_att.student_id is null or v_legacy.student_id is distinct from v_att.student_id
     or v_legacy.group_id is distinct from v_att.group_id or v_legacy.start_date is distinct from v_att.date
     or v_legacy.end_date is distinct from v_att.date or lower(coalesce(v_legacy.plan_type,''))<>v_type then
    return query select 'mismatch'::text,'Legacy payment does not match attendance and requires manual reconciliation'::text,null::uuid; return;
  end if;
  return query select 'legacy_unverified'::text,
    'Legacy auto-generated payment is not proof of receipt; explicit reconciliation is required'::text,v_legacy.id;
end $$;
revoke all on function public.crm_admin_inspect_attendance_payment(uuid) from public, anon;
grant execute on function public.crm_admin_inspect_attendance_payment(uuid) to authenticated;

-- Explicit administrator-only conversion of an attendance debt into a concrete
-- payment. Locking by source precedes every lookup, so independent connections
-- cannot both observe an absent payment.
drop function if exists public.crm_admin_confirm_attendance_payment(uuid,integer,text,uuid);
drop function if exists public.crm_admin_confirm_attendance_payment(uuid,integer,text,uuid,boolean);
create function public.crm_admin_confirm_attendance_payment(
  p_attendance_id uuid, p_amount integer, p_payment_method text, p_idempotency_key uuid,
  p_reconcile_legacy boolean default false,p_category text default 'other'
) returns table (
  id uuid, student_id uuid, group_id text, plan_type text, start_date date,
  end_date date, total_trainings integer, used_trainings integer, amount integer,
  base_price integer, discount_pct integer, discount_source text, paid boolean,
  pay_method text, created_at timestamptz, source_attendance_id uuid
) language plpgsql security definer set search_path = public as $$
declare
  v_att public.attendance%rowtype; v_att_probe public.attendance%rowtype; v_sub public.subscriptions%rowtype;
  v_key_sub public.subscriptions%rowtype; v_legacy public.subscriptions%rowtype;
  v_type text; v_plan_type text; v_request_hash text; v_legacy_count integer;
begin
  if auth.uid() is null or not public.rls_is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  if p_attendance_id is null or p_amount is null or p_amount <= 0 or p_idempotency_key is null
     or lower(coalesce(p_payment_method,'')) not in ('cash','card','transfer','other')
     or lower(coalesce(p_category,'')) not in ('trial','single','other') then
    raise exception 'Invalid payment input' using errcode='22023';
  end if;
  v_request_hash := md5(concat_ws('|',p_attendance_id::text,p_amount::text,lower(p_payment_method),lower(p_category)));

  -- Source lock must be first: retry remains possible even after attendance deletion.
  perform pg_advisory_xact_lock(hashtextextended('attendance-payment|'||p_attendance_id::text,0));
  select * into v_key_sub from public.subscriptions s where s.financial_idempotency_key=p_idempotency_key;
  if found and (v_key_sub.source_attendance_id is distinct from p_attendance_id
     or v_key_sub.financial_request_hash is distinct from v_request_hash) then
    raise exception 'Payment idempotency conflict' using errcode='23505';
  end if;
  select * into v_sub from public.subscriptions s where s.source_attendance_id=p_attendance_id;
  if found then
    if v_sub.financial_request_hash is distinct from v_request_hash then
      raise exception 'Payment payload conflict for attendance' using errcode='23505';
    end if;
    return query select v_sub.id,v_sub.student_id,v_sub.group_id,v_sub.plan_type,v_sub.start_date,v_sub.end_date,
      v_sub.total_trainings,v_sub.used_trainings,v_sub.amount,v_sub.base_price,v_sub.discount_pct,v_sub.discount_source,
      v_sub.paid,v_sub.pay_method,v_sub.created_at,v_sub.source_attendance_id; return;
  end if;
  if v_key_sub.id is not null then raise exception 'Payment idempotency conflict' using errcode='23505'; end if;

  select * into v_att_probe from public.attendance a where a.id=p_attendance_id;
  if not found or v_att_probe.student_id is null then raise exception 'Student attendance not found' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|','attendance',v_att_probe.group_id,v_att_probe.student_id::text),0));
  select * into v_att from public.attendance a where a.id=p_attendance_id for update;
  if not found or v_att.student_id is null then raise exception 'Student attendance not found' using errcode='P0002'; end if;
  if v_att.student_id is distinct from v_att_probe.student_id or v_att.group_id is distinct from v_att_probe.group_id
     or v_att.sub_id is distinct from v_att_probe.sub_id then
    raise exception 'Attendance changed during payment confirmation' using errcode='40001';
  end if;
  if coalesce(v_att.quantity,1)<>1 then
    raise exception 'Payment confirmation supports exactly one training; split or reconcile multi-unit attendance manually' using errcode='22023';
  end if;
  v_type := lower(coalesce(v_att.entry_type,v_att.guest_type,''));
  if v_type not in ('trial','single','debt','unpaid') then raise exception 'Attendance is not payable debt' using errcode='22023'; end if;
  v_plan_type:=case when lower(p_category) in ('trial','single') then lower(p_category) else 'single' end;

  select count(*)::integer into v_legacy_count from public.subscriptions s
  where s.source_attendance_id is null
    and coalesce(s.notes,'') not like 'auto_one_off_from_attendance:%'
    and s.paid is true
    and s.student_id is not distinct from v_att.student_id
    and s.group_id is not distinct from v_att.group_id
    and lower(coalesce(s.plan_type,'')) in ('trial','single')
    and coalesce(s.total_trainings,1)=1
    and v_att.date between s.start_date and s.end_date
    and (v_type not in ('trial','single') or lower(s.plan_type)=v_type);
  if v_legacy_count>0 then
    raise exception 'Historical unmarked payment may already exist; manual reconciliation is required' using errcode='22023';
  end if;

  select count(*)::integer into v_legacy_count from public.subscriptions s
  where s.notes=('auto_one_off_from_attendance:'||p_attendance_id::text);
  if v_legacy_count>1 then raise exception 'Multiple legacy payments require manual reconciliation' using errcode='22023'; end if;
  if v_legacy_count=1 then
    select * into v_legacy from public.subscriptions s where s.notes=('auto_one_off_from_attendance:'||p_attendance_id::text) for update;
    if v_legacy.student_id is distinct from v_att.student_id or v_legacy.group_id is distinct from v_att.group_id
       or v_legacy.start_date is distinct from v_att.date or v_legacy.end_date is distinct from v_att.date
       or lower(coalesce(v_legacy.plan_type,''))<>(case when v_type='trial' then 'trial' else 'single' end) then
      raise exception 'Legacy payment does not match attendance; manual reconciliation required' using errcode='22023';
    end if;
    if not p_reconcile_legacy then
      raise exception 'Legacy auto-generated payment requires explicit reconciliation' using errcode='22023';
    end if;
    update public.subscriptions s set amount=p_amount,base_price=p_amount,paid=true,pay_method=lower(p_payment_method),
      source_attendance_id=p_attendance_id,financial_idempotency_key=p_idempotency_key,
      financial_request_hash=v_request_hash,plan_type=v_plan_type,notes=s.notes||';admin_reconciled:'||lower(p_category)
    where s.id=v_legacy.id returning * into v_sub;
  else
    insert into public.subscriptions(student_id,group_id,plan_type,start_date,end_date,activation_date,original_end_date,
      total_trainings,used_trainings,amount,base_price,discount_pct,discount_source,paid,pay_method,notification_sent,
      notes,source_attendance_id,financial_idempotency_key,financial_request_hash)
    values(v_att.student_id,v_att.group_id,v_plan_type,v_att.date,v_att.date,v_att.date,v_att.date,1,1,p_amount,p_amount,
      0,'studio',true,lower(p_payment_method),false,'admin_confirmed_attendance_payment:'||lower(p_category),v_att.id,p_idempotency_key,v_request_hash)
    returning * into v_sub;
  end if;
  update public.attendance a set sub_id=v_sub.id,entry_type='subscription',guest_name=null,guest_type=null where a.id=v_att.id;
  return query select v_sub.id,v_sub.student_id,v_sub.group_id,v_sub.plan_type,v_sub.start_date,v_sub.end_date,
    v_sub.total_trainings,v_sub.used_trainings,v_sub.amount,v_sub.base_price,v_sub.discount_pct,v_sub.discount_source,
    v_sub.paid,v_sub.pay_method,v_sub.created_at,v_sub.source_attendance_id;
end $$;
revoke all on function public.crm_admin_confirm_attendance_payment(uuid,integer,text,uuid,boolean,text) from public, anon;
grant execute on function public.crm_admin_confirm_attendance_payment(uuid,integer,text,uuid,boolean,text) to authenticated;

-- Atomic reception action. An administrator records the selected student's
-- attendance and, only after an explicit paid choice, confirms its payment in
-- the same transaction. A subscription credit always wins when one is usable.
create or replace function public.crm_admin_record_reception(
  p_student_id uuid,p_date date,p_group_id text,p_payment_status text,
  p_category text,p_amount integer,p_payment_method text,p_idempotency_key uuid
) returns table(
  attendance_id uuid,sub_id uuid,student_id uuid,date date,group_id text,
  quantity integer,entry_type text,payment_id uuid,outcome text
) language plpgsql security definer set search_path=public as $$
declare
  v_att public.attendance%rowtype;
  v_sub_id uuid;
  v_payment public.subscriptions%rowtype;
  v_payment_result record;
  v_status text:=lower(coalesce(p_payment_status,''));
  v_payment_hash text;
  v_direction_id text;
begin
  if auth.uid() is null or not public.rls_is_admin() then
    raise exception 'Administrator required' using errcode='42501';
  end if;
  if p_student_id is null or p_date is null or nullif(btrim(p_group_id),'') is null
     or p_idempotency_key is null or v_status not in ('paid','unpaid') then
    raise exception 'Invalid reception attendance input' using errcode='22023';
  end if;
  if v_status='paid' and (coalesce(p_amount,0)<=0
     or lower(coalesce(p_payment_method,'')) not in ('cash','card','transfer','other')
     or lower(coalesce(p_category,'')) not in ('trial','single','other')) then
    raise exception 'Invalid reception payment input' using errcode='22023';
  end if;

  -- Use the canonical create order before looking up either attendance or a
  -- subscription. These locks are retained through payment confirmation.
  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|',p_group_id,p_date::text,p_student_id::text),0));
  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|','attendance',p_group_id,p_student_id::text),0));

  select * into v_att from public.attendance a where a.mutation_key=p_idempotency_key;
  if found then
    if v_att.student_id is distinct from p_student_id or v_att.group_id is distinct from p_group_id
       or v_att.date is distinct from p_date or coalesce(v_att.quantity,1)<>1 then
      raise exception 'Reception idempotency key conflict' using errcode='23505';
    end if;
    select * into v_payment from public.subscriptions s where s.source_attendance_id=v_att.id;
    if found then
      v_payment_hash:=md5(concat_ws('|',v_att.id::text,p_amount::text,lower(p_payment_method),lower(p_category)));
      if v_status<>'paid' or v_payment.financial_idempotency_key is distinct from p_idempotency_key
         or v_payment.financial_request_hash is distinct from v_payment_hash then
        raise exception 'Reception payment idempotency conflict' using errcode='23505';
      end if;
      return query select v_att.id,v_att.sub_id,v_att.student_id,v_att.date,v_att.group_id,
        coalesce(v_att.quantity,1),v_att.entry_type,v_payment.id,'paid'::text;
      return;
    end if;
    if v_att.sub_id is not null and lower(coalesce(v_att.entry_type,''))='subscription' then
      return query select v_att.id,v_att.sub_id,v_att.student_id,v_att.date,v_att.group_id,
        coalesce(v_att.quantity,1),v_att.entry_type,null::uuid,'subscription'::text;
      return;
    end if;
    if v_status='unpaid' and v_att.sub_id is null and lower(coalesce(v_att.entry_type,''))='unpaid' then
      return query select v_att.id,null::uuid,v_att.student_id,v_att.date,v_att.group_id,
        coalesce(v_att.quantity,1),v_att.entry_type,null::uuid,'unpaid'::text;
      return;
    end if;
    raise exception 'Reception idempotency key conflict' using errcode='23505';
  end if;

  if exists(select 1 from public.attendance a where a.student_id=p_student_id and a.group_id=p_group_id and a.date=p_date) then
    raise exception 'Attendance already exists for this student, group and date' using errcode='23505';
  end if;

  select s.id into v_sub_id from public.subscriptions s
  where s.student_id=p_student_id and s.group_id=p_group_id
    and p_date between coalesce(s.activation_date,s.start_date) and s.end_date
    and greatest(coalesce(s.used_trainings,0),
      (select coalesce(sum(coalesce(a.quantity,1)),0) from public.attendance a where a.sub_id=s.id)
    )<coalesce(s.total_trainings,0)
  order by coalesce(s.activation_date,s.start_date),s.created_at,s.id for update limit 1;

  -- Preserve the historical trial rule at the server boundary: a student may
  -- receive a paid trial only before any attendance in the same direction.
  -- The direction lock serializes forged/concurrent requests in other groups.
  if v_sub_id is null and v_status='paid' and lower(p_category)='trial' then
    select g.direction_id::text into v_direction_id from public.groups g where g.id=p_group_id;
    if v_direction_id is not null then
      perform pg_advisory_xact_lock(hashtextextended(concat_ws('|','attendance-trial',p_student_id::text,v_direction_id),0));
      if exists(
        select 1 from public.attendance a join public.groups ag on ag.id=a.group_id
        where a.student_id=p_student_id and ag.direction_id::text=v_direction_id
      ) then
        raise exception 'Student is not eligible for another trial attendance' using errcode='22023';
      end if;
    end if;
  end if;

  perform * from public.crm_record_attendance(
    v_sub_id,p_student_id,p_date,null,null,p_group_id,1,
    case when v_sub_id is null then 'unpaid' else 'subscription' end,p_idempotency_key
  );
  select * into v_att from public.attendance a where a.mutation_key=p_idempotency_key;
  if v_sub_id is not null then
    return query select v_att.id,v_att.sub_id,v_att.student_id,v_att.date,v_att.group_id,
      coalesce(v_att.quantity,1),v_att.entry_type,null::uuid,'subscription'::text;
    return;
  end if;
  if v_status='unpaid' then
    return query select v_att.id,null::uuid,v_att.student_id,v_att.date,v_att.group_id,
      coalesce(v_att.quantity,1),v_att.entry_type,null::uuid,'unpaid'::text;
    return;
  end if;

  select s.* into v_payment_result from public.crm_admin_confirm_attendance_payment(
    v_att.id,p_amount,p_payment_method,p_idempotency_key,false,p_category
  ) s;
  select * into v_payment from public.subscriptions s where s.id=v_payment_result.id;
  select * into v_att from public.attendance a where a.id=v_att.id;
  return query select v_att.id,v_att.sub_id,v_att.student_id,v_att.date,v_att.group_id,
    coalesce(v_att.quantity,1),v_att.entry_type,v_payment.id,'paid'::text;
end $$;
revoke all on function public.crm_admin_record_reception(uuid,date,text,text,text,integer,text,uuid) from public,anon;
grant execute on function public.crm_admin_record_reception(uuid,date,text,text,text,integer,text,uuid) to authenticated;

commit;

-- END SOURCE: supabase/migrations/20261005090000_harden_financial_attendance_boundary.sql

DO $staging_postflight$
BEGIN
  IF to_regclass('public.attendance') IS NULL
     OR to_regclass('public.subscriptions') IS NULL
     OR to_regclass('public.room_bookings') IS NULL
     OR to_regprocedure('public.crm_record_trainer_presence(uuid,date,text,integer,uuid)') IS NULL
     OR to_regprocedure('public.crm_admin_record_reception(uuid,date,text,text,text,integer,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'STAGING bootstrap postflight failed';
  END IF;
END $staging_postflight$;
