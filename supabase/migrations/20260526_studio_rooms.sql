create table if not exists public.studio_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists studio_rooms_name_unique_idx
  on public.studio_rooms (lower(btrim(name)));

alter table public.studio_rooms enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'studio_rooms' and policyname = 'studio_rooms_select_authenticated') then
    create policy "studio_rooms_select_authenticated"
      on public.studio_rooms
      for select
      to authenticated
      using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'studio_rooms' and policyname = 'studio_rooms_admin_mutations') then
    create policy "studio_rooms_admin_mutations"
      on public.studio_rooms
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

insert into public.studio_rooms (name, is_active, sort_order)
values ('Основна зала', true, 0)
on conflict (lower(btrim(name)))
do update set is_active = true;

alter table public.room_bookings
  add column if not exists room_name text;

update public.room_bookings
set room_name = coalesce(nullif(btrim(room_name), ''), 'Основна зала')
where room_name is null or btrim(room_name) = '';
