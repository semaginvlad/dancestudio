-- Final RLS draft for public.subscriptions.
-- Documentation/draft only. Do not apply automatically from this PR.
-- Review and apply manually in Supabase when ready to close the old public
-- allow-all policy on subscriptions.
--
-- Context:
-- - Admin direct subscription forms continue to use the base table.
-- - Trainer/non-admin subscription access must go through the safe RPC layer:
--   - public.crm_fetch_my_attendance_subscriptions()
--   - public.crm_sync_subscription_usage(uuid)
--   - public.crm_ensure_one_off_payment_for_attendance(uuid)
--   - public.crm_remove_one_off_payment_if_orphan(uuid)
--   - public.crm_cancel_training_for_group(text, date)
--   - public.crm_restore_cancelled_training(uuid)
-- - No trainer direct SELECT/INSERT/UPDATE/DELETE policies are created here.
-- - This draft does not change application code, Attendance, Schedule,
--   salary/revenue, Telegram/Instagram, or any RPC definitions.

begin;

-- Drop the old permissive policy before enabling admin-only base-table access.
drop policy if exists "Allow all on subscriptions" on public.subscriptions;

-- Idempotency for the policy created by this draft.
drop policy if exists subscriptions_admin_all on public.subscriptions;

-- Helper predicate used by this draft. It mirrors the other RLS drafts and is
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

alter table public.subscriptions enable row level security;

-- Admins keep direct base-table access for the existing subscription forms.
create policy subscriptions_admin_all
on public.subscriptions
for all
to authenticated
using (public.rls_is_admin())
with check (public.rls_is_admin());

-- Intentionally no trainer direct policies:
-- - no subscriptions_trainer_select_own_group
-- - no subscriptions_trainer_insert_own_group
-- - no subscriptions_trainer_update_own_group
-- - no subscriptions_trainer_delete_own_group
--
-- Trainer/non-admin reads and writes are intentionally constrained to the safe
-- security-definer RPCs listed in the Context section above, which return or
-- mutate only attendance-safe/operational fields.

commit;
