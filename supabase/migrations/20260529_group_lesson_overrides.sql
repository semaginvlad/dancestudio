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
