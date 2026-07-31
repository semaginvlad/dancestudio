-- Seed the persistent directions dictionary from the existing CRM constants.
-- Existing records are never overwritten.

insert into public.directions (
  id,
  name,
  color,
  is_active
)
values
  ('bachata',   'Bachata Lady Style', '#FF9500', true),
  ('dancehall', 'Dancehall Female',   '#34C759', true),
  ('heels',     'High Heels',         '#AF52DE', true),
  ('jazzfunk',  'Jazz Funk',          '#FF2D55', true),
  ('kpop',      'K-pop Cover Dance',   '#5A81FA', true),
  ('latina',    'Latina Solo',         '#FF453A', true)
on conflict (id) do nothing;
