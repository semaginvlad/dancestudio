-- Foundation schema for future real Instagram CRM integration.
-- This step intentionally does not connect to external APIs.

create extension if not exists pgcrypto;

create table if not exists crm_contacts (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  phone text,
  email text,
  lead_source text,
  contact_type text not null default 'lead',
  pipeline_status text,
  short_tag text,
  preferred_direction text,
  preferred_group text,
  format_preference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists crm_contact_channels (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references crm_contacts(id) on delete cascade,
  channel_type text not null, -- instagram, telegram, phone, email
  external_user_id text,
  external_username text,
  external_thread_id text,
  is_primary boolean not null default false,
  is_connected boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_type, external_user_id)
);

create table if not exists crm_waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references crm_contacts(id) on delete cascade,
  direction text,
  group_name text,
  preferred_time text,
  status text not null default 'active',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists crm_contact_events (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references crm_contacts(id) on delete cascade,
  channel_id uuid references crm_contact_channels(id) on delete set null,
  event_type text not null, -- inbound_message, outbound_message, status_change, note
  event_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  source text not null default 'manual'
);

create table if not exists crm_conversation_threads (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references crm_contact_channels(id) on delete cascade,
  thread_external_id text,
  title text,
  last_message_at timestamptz,
  state text not null default 'open',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_id, thread_external_id)
);

create index if not exists idx_crm_contacts_pipeline_status on crm_contacts(pipeline_status);
create index if not exists idx_crm_contacts_phone on crm_contacts(phone);
create index if not exists idx_crm_contact_channels_contact on crm_contact_channels(contact_id);
create index if not exists idx_crm_contact_channels_type on crm_contact_channels(channel_type);
create index if not exists idx_crm_waitlist_contact on crm_waitlist_entries(contact_id, status);
create index if not exists idx_crm_contact_events_contact_time on crm_contact_events(contact_id, event_at desc);
create index if not exists idx_crm_threads_channel on crm_conversation_threads(channel_id, last_message_at desc);
