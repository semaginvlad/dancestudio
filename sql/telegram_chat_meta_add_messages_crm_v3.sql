alter table telegram_chat_meta
  add column if not exists pipeline_status text null,
  add column if not exists format_preference text null,
  add column if not exists waitlist_status text null,
  add column if not exists next_action text null,
  add column if not exists follow_up_at timestamptz null,
  add column if not exists follow_up_reason text null,
  add column if not exists follow_up_state text null;

create index if not exists telegram_chat_meta_pipeline_status_idx on telegram_chat_meta(pipeline_status);
create index if not exists telegram_chat_meta_follow_up_at_idx on telegram_chat_meta(follow_up_at);
