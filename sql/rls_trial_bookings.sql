-- RLS draft for public.trial_bookings.
-- Documentation/draft only. Review and apply manually in Supabase when ready.
--
-- Context:
-- - public.trial_bookings is a CRM/admin table for concrete trial lesson bookings.
-- - The first UI will live in the admin-only Students CRM area.
-- - Trainer access, if needed, should be added in a separate scoped policy/RPC PR.
-- - Anonymous users intentionally receive no direct policy.

begin;

-- Idempotency for the policy created by this draft.
drop policy if exists trial_bookings_admin_all on public.trial_bookings;

-- Helper predicate used by this draft. It mirrors the existing RLS drafts and is
-- idempotent so this file can be reviewed/applied independently.
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

alter table public.trial_bookings enable row level security;

-- Admins keep direct base-table access for the future Students CRM trial-booking UI.
create policy trial_bookings_admin_all
on public.trial_bookings
for all
to authenticated
using (public.rls_is_admin())
with check (public.rls_is_admin());

commit;
