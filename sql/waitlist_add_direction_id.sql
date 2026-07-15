-- Idempotent production migration for waitlist direction support.
-- Repo schema evidence: public.groups exposes id text and direction_id text via
-- crm_fetch_schedule_groups()/crm_fetch_my_attendance_groups() RPC definitions.
-- Adds directionId for direction-level reserve entries without changing existing data shape.

alter table if exists public.waitlist
  add column if not exists "directionId" text null;

update public.waitlist as w
set "directionId" = g.direction_id
from public.groups as g
where nullif(w."directionId", '') is null
  and w."groupId" is not null
  and w."groupId"::text = g.id::text
  and nullif(g.direction_id, '') is not null;

create index if not exists idx_waitlist_direction_status
  on public.waitlist ("directionId", status);
