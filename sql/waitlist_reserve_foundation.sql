alter table if exists waitlist
  add column if not exists name text null,
  add column if not exists contact text null,
  add column if not exists note text null,
  add column if not exists status text not null default 'waiting',
  add column if not exists created_at timestamptz not null default now();

create index if not exists idx_waitlist_group_status on waitlist("groupId", status);
