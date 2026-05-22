alter table public.notification_schedule_rules
add column if not exists message_template text null;
