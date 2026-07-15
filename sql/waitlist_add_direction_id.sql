-- Idempotent production migration for waitlist direction support.
-- Adds directionId for direction-level reserve entries without changing existing data shape.

alter table if exists public.waitlist
  add column if not exists "directionId" text null;

update public.waitlist as w
set "directionId" = g.direction_id
from public.groups as g
where (w."directionId" is null or btrim(w."directionId") = '')
  and w."groupId" is not null
  and w."groupId" = g.id
  and g.direction_id is not null
  and btrim(g.direction_id) <> '';

create index if not exists idx_waitlist_direction_status
  on public.waitlist ("directionId", status);
