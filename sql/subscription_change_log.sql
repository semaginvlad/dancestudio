-- Subscription change log foundation for future admin audit UI.
-- Documentation/migration draft only. Apply manually in Supabase after reviewing.
--
-- This file intentionally creates only the audit table, indexes, and admin-only
-- SELECT policy. It does not add triggers, RPCs, frontend helpers, or runtime app
-- behavior changes.

begin;

create table if not exists public.subscription_change_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Actor snapshot. These fields are nullable because future writes may come from
  -- DB triggers, RPCs, service-role/system jobs, or legacy/manual operations.
  actor_type text not null default 'unknown',
  actor_auth_user_id uuid null,
  actor_email text null,
  actor_name text null,
  actor_trainer_id uuid null,

  -- Subscription target snapshot. No foreign keys are used on purpose: audit rows
  -- must survive deleted subscriptions/students/groups and remain readable.
  subscription_id uuid null,
  student_id uuid null,
  student_name text null,
  group_id text null,
  group_name text null,

  action_type text not null,
  change_type text not null default 'unknown',

  -- Full before/after snapshots for future trigger/RPC writers.
  previous_value jsonb null,
  new_value jsonb null,

  -- Common subscription field snapshot for fast UI rendering and filtering.
  subscription_type text null,
  status text null,
  start_date date null,
  end_date date null,
  activation_date date null,
  original_end_date date null,
  total_trainings integer null,
  used_trainings integer null,
  amount numeric null,
  base_price numeric null,
  discount_pct numeric null,
  discount_source text null,
  paid boolean null,
  pay_method text null,
  notes text null,

  source text not null default 'unknown',
  details jsonb null,

  constraint subscription_change_log_actor_type_chk
    check (actor_type in ('admin', 'trainer', 'system', 'unknown')),
  constraint subscription_change_log_action_type_chk
    check (action_type in ('create', 'update', 'delete')),
  constraint subscription_change_log_source_chk
    check (source in ('db_trigger', 'rpc', 'admin_form', 'attendance_one_off', 'usage_sync', 'cancellation_rpc', 'system', 'unknown')),
  constraint subscription_change_log_total_trainings_chk
    check (total_trainings is null or total_trainings >= 0),
  constraint subscription_change_log_used_trainings_chk
    check (used_trainings is null or used_trainings >= 0),
  constraint subscription_change_log_amount_chk
    check (amount is null or amount >= 0),
  constraint subscription_change_log_base_price_chk
    check (base_price is null or base_price >= 0),
  constraint subscription_change_log_discount_pct_chk
    check (discount_pct is null or discount_pct >= 0)
);

create index if not exists subscription_change_log_created_at_idx
  on public.subscription_change_log (created_at desc);

create index if not exists subscription_change_log_subscription_id_idx
  on public.subscription_change_log (subscription_id);

create index if not exists subscription_change_log_student_created_idx
  on public.subscription_change_log (student_id, created_at desc);

create index if not exists subscription_change_log_group_created_idx
  on public.subscription_change_log (group_id, created_at desc);

create index if not exists subscription_change_log_actor_auth_created_idx
  on public.subscription_change_log (actor_auth_user_id, created_at desc);

create index if not exists subscription_change_log_actor_trainer_created_idx
  on public.subscription_change_log (actor_trainer_id, created_at desc);

create index if not exists subscription_change_log_action_created_idx
  on public.subscription_change_log (action_type, created_at desc);

create index if not exists subscription_change_log_change_created_idx
  on public.subscription_change_log (change_type, created_at desc);

create index if not exists subscription_change_log_source_created_idx
  on public.subscription_change_log (source, created_at desc);

alter table public.subscription_change_log enable row level security;

-- Admins may read subscription audit history. No INSERT/UPDATE/DELETE policies are
-- added here: future trigger/RPC writers should create audit rows without exposing
-- direct frontend writes to this table.
drop policy if exists subscription_change_log_admin_select on public.subscription_change_log;
create policy subscription_change_log_admin_select
on public.subscription_change_log
for select
to authenticated
using (coalesce(auth.jwt() ->> 'email', '') = 'semagin.vlad@gmail.com');

commit;
