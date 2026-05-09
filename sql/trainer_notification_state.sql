create table if not exists trainer_notification_state (
  chat_id text not null,
  group_id text not null,
  custom_template text null,
  auto_send_enabled boolean not null default true,
  send_time_override text null,
  updated_at timestamptz not null default now(),
  primary key (chat_id, group_id)
);

create index if not exists trainer_notification_state_chat_idx
  on trainer_notification_state (chat_id);
