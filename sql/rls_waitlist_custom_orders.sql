-- RLS draft for public.waitlist and public.custom_orders.
-- Documentation/draft only. Do not apply from this PR.
-- Review and apply manually in Supabase when ready for this RLS safety step.
--
-- Context:
-- - Frontend/data hardening is already in place: trainer/non-admin users no
--   longer call db.fetchWaitlist().
-- - public.crm_fetch_my_custom_orders() is already applied manually and is the
--   scoped custom_orders read path for trainer/non-admin users.
-- - Admin users continue to read public.waitlist and public.custom_orders base
--   tables directly.

begin;

-- Drop old permissive policies that exposed these tables too broadly.
drop policy if exists "Allow all on waitlist" on public.waitlist;
drop policy if exists "Allow all on custom_orders" on public.custom_orders;
drop policy if exists "Allow full access" on public.custom_orders;

-- Idempotency for policies created by this draft.
drop policy if exists waitlist_admin_all on public.waitlist;
drop policy if exists custom_orders_admin_all on public.custom_orders;

-- Helper predicate used by this draft. It is idempotent so this draft can be
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

-- public.waitlist:
-- - Admin has full base-table access.
-- - Trainer/non-admin users intentionally get no direct base-table policies.
-- - Frontend should keep returning [] for trainer/non-admin waitlist state.
alter table public.waitlist enable row level security;

create policy waitlist_admin_all
on public.waitlist
for all
to authenticated
using (public.rls_is_admin())
with check (public.rls_is_admin());

-- public.custom_orders:
-- - Admin has full base-table access.
-- - Trainer/non-admin users intentionally get no direct base-table SELECT policy.
-- - Trainer/non-admin scoped reads must continue to use
--   public.crm_fetch_my_custom_orders().
alter table public.custom_orders enable row level security;

create policy custom_orders_admin_all
on public.custom_orders
for all
to authenticated
using (public.rls_is_admin())
with check (public.rls_is_admin());

commit;
