create table if not exists public.notification_rules (
  key text primary key,
  enabled boolean not null default true,
  channel text not null default 'push',
  minutes_before_lesson integer not null default 30,
  include_trial_bookings boolean not null default true,
  include_unpaid_students boolean not null default true,
  include_attendance_reminder boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_rules_channel_check check (channel in ('push', 'telegram', 'both')),
  constraint notification_rules_minutes_before_lesson_check check (minutes_before_lesson between 0 and 1440)
);

alter table public.notification_rules enable row level security;
