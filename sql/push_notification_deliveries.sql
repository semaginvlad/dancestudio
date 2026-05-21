create table if not exists public.push_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  target_user_id uuid not null,
  subscription_id uuid null,
  entity_type text null,
  entity_id text null,
  delivery_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  error text null,
  sent_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_notification_deliveries_delivery_key_key unique (delivery_key),
  constraint push_notification_deliveries_status_check check (
    status in ('pending', 'sent', 'failed', 'skipped')
  )
);

alter table public.push_notification_deliveries enable row level security;
