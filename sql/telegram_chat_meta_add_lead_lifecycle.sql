alter table telegram_chat_meta
  add column if not exists lead_status text null,
  add column if not exists lead_source text null,
  add column if not exists preferred_direction text null,
  add column if not exists preferred_group text null;

create index if not exists telegram_chat_meta_lead_status_idx on telegram_chat_meta(lead_status);
