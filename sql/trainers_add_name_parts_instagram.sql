alter table public.trainers
  add column if not exists first_name text null,
  add column if not exists last_name text null,
  add column if not exists instagram_handle text null;

update public.trainers
set
  first_name = coalesce(nullif(first_name, ''), split_part(coalesce(name, ''), ' ', 1)),
  last_name = coalesce(
    nullif(last_name, ''),
    nullif(trim(substr(coalesce(name, ''), length(split_part(coalesce(name, ''), ' ', 1)) + 1)), '')
  )
where (first_name is null or first_name = '' or last_name is null or last_name = '');
