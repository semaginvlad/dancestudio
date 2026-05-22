create table if not exists public.notification_schedule_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  group_id text not null,
  trainer_id uuid null,
  channel text not null default 'push',
  enabled boolean not null default true,
  timezone text not null default 'Europe/Kyiv',
  days_of_week int[] not null default '{}',
  send_time_local text not null,
  include_trial_bookings boolean not null default true,
  include_unpaid_students boolean not null default true,
  include_attendance_reminder boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_schedule_rules_channel_check check (
    channel in ('push', 'telegram', 'both')
  ),
  constraint notification_schedule_rules_days_of_week_check check (
    days_of_week <@ ARRAY[1,2,3,4,5,6,7]::int[]
  ),
  constraint notification_schedule_rules_send_time_local_check check (
    send_time_local ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
  )
);

create table if not exists public.notification_rule_runs (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.notification_schedule_rules(id) on delete cascade,
  run_key text not null unique,
  scheduled_for timestamptz null,
  status text not null default 'pending',
  reason text null,
  payload_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_rule_runs_status_check check (
    status in ('pending', 'sent', 'failed', 'skipped')
  )
);

alter table public.notification_schedule_rules enable row level security;
alter table public.notification_rule_runs enable row level security;
