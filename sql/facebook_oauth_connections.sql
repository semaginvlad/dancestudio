-- Foundation storage for Facebook user/page tokens used by Instagram inbox retrieval.

create extension if not exists pgcrypto;

create table if not exists facebook_oauth_connections (
  id text primary key,
  connected boolean not null default false,
  fb_user_id text,
  fb_user_name text,
  user_access_token text,
  user_token_expires_at timestamptz,
  selected_page_id text,
  selected_page_name text,
  page_access_token text,
  ig_business_id text,
  ig_business_username text,
  refreshed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_error text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_fb_oauth_connected on facebook_oauth_connections(connected, refreshed_at);
create index if not exists idx_fb_oauth_page on facebook_oauth_connections(selected_page_id);
