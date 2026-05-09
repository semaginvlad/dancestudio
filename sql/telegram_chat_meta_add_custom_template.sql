alter table telegram_chat_meta
  add column if not exists custom_template text null;
