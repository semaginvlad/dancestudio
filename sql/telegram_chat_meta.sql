create table if not exists public.telegram_chat_meta (
  chat_id text primary key,
  is_favorite boolean not null default false,
  needs_reply boolean not null default false,
  internal_note text not null default '',
  updated_at timestamptz not null default now()
);

create index if not exists telegram_chat_meta_updated_at_idx
  on public.telegram_chat_meta(updated_at desc);
