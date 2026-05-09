-- RLS draft for public.mod_log.
-- Documentation/draft only. Do not apply from this PR.
-- Review and apply manually in Supabase when ready to close the remaining
-- public allow-all policy on mod_log.
--
-- Context:
-- - Runtime app code does not read or write public.mod_log.
-- - Trainers/non-admin users do not need mod_log access.
-- - This draft makes public.mod_log admin-only.
-- - This draft does not change subscriptions, Attendance, Schedule,
--   students/groups/attendance RLS, room_bookings/trainers/custom_orders/waitlist,
--   Telegram/Instagram, or salary/revenue tables.

begin;

-- Drop the old permissive policy and any previous version of this draft policy.
drop policy if exists "Allow all on mod_log" on public.mod_log;
drop policy if exists mod_log_admin_all on public.mod_log;

-- Helper predicate used by this draft. It is idempotent so this file can be
-- reviewed/applied independently of other RLS drafts.
create or replace function public.rls_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'semagin.vlad@gmail.com';
$$;

revoke execute on function public.rls_is_admin() from public, anon;
grant execute on function public.rls_is_admin() to authenticated;

alter table public.mod_log enable row level security;

create policy mod_log_admin_all
on public.mod_log
for all
to authenticated
using (public.rls_is_admin())
with check (public.rls_is_admin());

commit;
