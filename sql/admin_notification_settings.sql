-- Admin notification settings for the managed CRM Automation UI.
-- Run manually in Supabase SQL editor after reviewing for your project.

create table if not exists public.admin_notification_settings (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  admin_email text,
  telegram_chat_id text,
  enabled boolean not null default false,
  send_time_local time not null default time '08:00',
  timezone text not null default 'Europe/Kyiv',
  include_today_trials boolean not null default true,
  include_expiring_subscriptions boolean not null default true,
  include_inactive_students boolean not null default true,
  expiring_lessons_threshold integer not null default 2 check (expiring_lessons_threshold between 0 and 50),
  expiring_days_threshold integer not null default 7 check (expiring_days_threshold between 0 and 365),
  inactive_days_threshold integer not null default 14 check (inactive_days_threshold between 1 and 365),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (admin_user_id)
);

create or replace function public.set_admin_notification_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists admin_notification_settings_updated_at on public.admin_notification_settings;
create trigger admin_notification_settings_updated_at
before update on public.admin_notification_settings
for each row
execute function public.set_admin_notification_settings_updated_at();

alter table public.admin_notification_settings enable row level security;

drop policy if exists admin_notification_settings_admin_select on public.admin_notification_settings;
create policy admin_notification_settings_admin_select
on public.admin_notification_settings
for select
to authenticated
using (public.crm_is_admin_session() and admin_user_id = auth.uid());

drop policy if exists admin_notification_settings_admin_insert on public.admin_notification_settings;
create policy admin_notification_settings_admin_insert
on public.admin_notification_settings
for insert
to authenticated
with check (public.crm_is_admin_session() and admin_user_id = auth.uid());

drop policy if exists admin_notification_settings_admin_update on public.admin_notification_settings;
create policy admin_notification_settings_admin_update
on public.admin_notification_settings
for update
to authenticated
using (public.crm_is_admin_session() and admin_user_id = auth.uid())
with check (public.crm_is_admin_session() and admin_user_id = auth.uid());

grant select, insert, update on public.admin_notification_settings to authenticated;
