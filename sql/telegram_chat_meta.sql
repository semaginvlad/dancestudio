create table if not exists telegram_chat_meta (
  chat_id text primary key,
  student_id text null,
  internal_note text null,
  custom_template text null,
  updated_at timestamptz not null default now()
);

create index if not exists telegram_chat_meta_student_idx on telegram_chat_meta(student_id);
