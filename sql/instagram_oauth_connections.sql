-- Storage foundation for Instagram OAuth token lifecycle.
-- Stores only connection metadata needed by backend token lifecycle.

create extension if not exists pgcrypto;

create table if not exists instagram_oauth_connections (
  id text primary key,
  provider text not null default 'instagram_basic',
  ig_user_id text,
  ig_username text,
  token_type text,
  access_token text,
  scopes text[] not null default '{}',
  connected boolean not null default false,
  expires_at timestamptz,
  refreshed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_error text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_instagram_oauth_connected on instagram_oauth_connections(connected, expires_at);
create index if not exists idx_instagram_oauth_user on instagram_oauth_connections(ig_user_id);
