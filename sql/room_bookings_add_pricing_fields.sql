alter table room_bookings
  add column if not exists booking_type text,
  add column if not exists people_count integer,
  add column if not exists price integer;
