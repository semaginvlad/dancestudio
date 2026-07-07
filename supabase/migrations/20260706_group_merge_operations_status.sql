alter table public.group_merge_operations
  add column if not exists status text not null default 'completed',
  add column if not exists completed_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists error_message text;

update public.group_merge_operations
set status = case
    when undone_at is not null then 'undone'
    when failed_at is not null then 'failed'
    when completed_at is not null then 'completed'
    else status
  end;

create index if not exists group_merge_operations_status_idx
  on public.group_merge_operations (status, created_at desc);
