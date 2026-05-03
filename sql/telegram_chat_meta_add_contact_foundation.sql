alter table telegram_chat_meta
  add column if not exists contact_type text null,
  add column if not exists crm_stage text null,
  add column if not exists short_tag text null,
  add column if not exists contact_name text null,
  add column if not exists contact_phone text null,
  add column if not exists contact_telegram text null,
  add column if not exists contact_instagram text null;

create index if not exists telegram_chat_meta_contact_type_idx on telegram_chat_meta(contact_type);
create index if not exists telegram_chat_meta_crm_stage_idx on telegram_chat_meta(crm_stage);
