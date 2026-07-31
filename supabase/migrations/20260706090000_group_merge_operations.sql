create table if not exists public.group_merge_operations (
  id text primary key,
  created_at timestamptz not null default now(),
  source_group_id text not null,
  target_group_id text not null,
  selected_student_ids jsonb not null default '[]'::jsonb,
  new_target_links_student_ids jsonb not null default '[]'::jsonb,
  removed_source_links_student_ids jsonb not null default '[]'::jsonb,
  moved_subscription_ids jsonb not null default '[]'::jsonb,
  previous_subscription_group_ids jsonb not null default '{}'::jsonb,
  previous_target_schedule jsonb not null default '[]'::jsonb,
  new_target_schedule jsonb not null default '[]'::jsonb,
  previous_source_archive_state jsonb,
  source_was_archived_before boolean not null default false,
  schedule_mode text not null default 'keep_target',
  executed_by text,
  undone_at timestamptz,
  undone_by text
);

create index if not exists group_merge_operations_created_at_idx
  on public.group_merge_operations (created_at desc);

create index if not exists group_merge_operations_active_idx
  on public.group_merge_operations (undone_at)
  where undone_at is null;
