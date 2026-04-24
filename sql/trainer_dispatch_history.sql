create table if not exists trainer_dispatch_history (
  id text primary key,
  chat_id text not null,
  chat_title text null,
  group_id text null,
  group_name text null,
  trigger_type text not null,
  status text not null,
  dedup_key text null,
  students_count integer not null default 0,
  details text null,
  reason text null,
  created_at timestamptz not null default now()
);

create index if not exists trainer_dispatch_history_chat_idx
  on trainer_dispatch_history (chat_id, created_at desc);

create index if not exists trainer_dispatch_history_dedup_idx
  on trainer_dispatch_history (dedup_key, trigger_type, status);
