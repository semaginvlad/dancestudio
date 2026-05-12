-- Attendance change log foundation for future admin audit UI.
-- Documentation/migration draft only. Apply manually in Supabase after reviewing
-- the production attendance schema and confirming the table does not exist.
--
-- This file intentionally does not add attendance triggers, RPC write paths,
-- frontend helpers, or runtime app behavior changes.

begin;

create table if not exists public.attendance_change_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Actor snapshot. Future writers may populate these from Supabase Auth,
  -- trainer profile data, Telegram context, or system jobs.
  actor_type text not null default 'unknown',
  actor_auth_user_id uuid null,
  actor_email text null,
  actor_trainer_id uuid null,
  actor_name text null,
  actor_telegram_user_id text null,
  actor_telegram_chat_id text null,

  -- Attendance target snapshot. Names are denormalized on purpose so that audit
  -- rows remain readable even if a group/student/guest name changes later.
  attendance_id uuid null,
  group_id text null,
  group_name text null,
  student_id uuid null,
  student_name text null,
  guest_name text null,

  -- Meaning of the attendance change.
  attendance_date date null,
  action_type text not null,
  change_type text null,
  previous_value jsonb null,
  new_value jsonb null,

  -- Important attendance row fields captured as a quick-readable snapshot.
  sub_id uuid null,
  entry_type text null,
  guest_type text null,
  quantity integer null,

  -- Source/context for future trigger/RPC/frontend/server writers.
  source text not null default 'unknown',
  details jsonb null,

  constraint attendance_change_log_actor_type_chk
    check (actor_type in ('admin', 'trainer', 'telegram_bot', 'system', 'unknown')),
  constraint attendance_change_log_action_type_chk
    check (action_type in ('create', 'update', 'delete')),
  constraint attendance_change_log_source_chk
    check (source in ('attendance_tab', 'db_trigger', 'rpc', 'telegram_bot', 'migration', 'unknown')),
  constraint attendance_change_log_quantity_chk
    check (quantity is null or quantity >= 1)
);

create index if not exists attendance_change_log_created_at_idx
  on public.attendance_change_log (created_at desc);

create index if not exists attendance_change_log_group_date_idx
  on public.attendance_change_log (group_id, attendance_date);

create index if not exists attendance_change_log_actor_auth_created_idx
  on public.attendance_change_log (actor_auth_user_id, created_at desc);

create index if not exists attendance_change_log_actor_trainer_created_idx
  on public.attendance_change_log (actor_trainer_id, created_at desc);

create index if not exists attendance_change_log_student_created_idx
  on public.attendance_change_log (student_id, created_at desc);

create index if not exists attendance_change_log_attendance_id_idx
  on public.attendance_change_log (attendance_id);

create index if not exists attendance_change_log_action_created_idx
  on public.attendance_change_log (action_type, created_at desc);

create index if not exists attendance_change_log_source_created_idx
  on public.attendance_change_log (source, created_at desc);

alter table public.attendance_change_log enable row level security;

-- Admin-only read access. Trainers and other authenticated users intentionally
-- receive no SELECT policy for this audit table in the foundation step.
drop policy if exists attendance_change_log_admin_select on public.attendance_change_log;
create policy attendance_change_log_admin_select
on public.attendance_change_log
for select
to authenticated
using (coalesce(auth.jwt() ->> 'email', '') = 'semagin.vlad@gmail.com');

-- No INSERT/UPDATE/DELETE policies are added here. Future PRs should write audit
-- rows through reviewed trigger/RPC paths instead of direct frontend mutations.

commit;
