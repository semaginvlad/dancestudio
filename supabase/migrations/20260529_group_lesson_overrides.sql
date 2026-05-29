-- Phase 1: single-date overrides for generated group lessons in ScheduleTab.
-- Follow-up phases must integrate this table with Attendance, salary, Telegram reminders and analytics.

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
  constraint group_lesson_overrides_status_check check (status in ('active', 'cancelled')),
  constraint group_lesson_overrides_unique_slot unique (group_id, date, slot_index)
);

create index if not exists group_lesson_overrides_group_id_idx
  on public.group_lesson_overrides (group_id);

create index if not exists group_lesson_overrides_date_idx
  on public.group_lesson_overrides (date);

create index if not exists group_lesson_overrides_group_date_idx
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
for each row execute function public.set_group_lesson_overrides_updated_at();

alter table public.group_lesson_overrides enable row level security;

-- This project currently does not expose a SQL-level admin helper matching the
-- frontend admin role. These Phase 1 policies intentionally mirror the existing
-- authenticated studio_rooms access pattern so admins and trainers can use the
-- feature while ownership hardening is added in a follow-up migration/RPC.
drop policy if exists "group lesson overrides select authenticated" on public.group_lesson_overrides;
create policy "group lesson overrides select authenticated"
  on public.group_lesson_overrides
  for select
  to authenticated
  using (true);

drop policy if exists "group lesson overrides insert authenticated" on public.group_lesson_overrides;
create policy "group lesson overrides insert authenticated"
  on public.group_lesson_overrides
  for insert
  to authenticated
  with check (true);

drop policy if exists "group lesson overrides update authenticated" on public.group_lesson_overrides;
create policy "group lesson overrides update authenticated"
  on public.group_lesson_overrides
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "group lesson overrides delete authenticated" on public.group_lesson_overrides;
create policy "group lesson overrides delete authenticated"
  on public.group_lesson_overrides
  for delete
  to authenticated
  using (true);
