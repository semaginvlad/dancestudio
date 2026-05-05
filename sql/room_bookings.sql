create table if not exists room_bookings (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  start_time text not null,
  end_time text not null,
  trainer_id text null,
  trainer_name text null,
  title text not null,
  type text not null default 'individual',
  note text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_room_bookings_date on room_bookings(date);
