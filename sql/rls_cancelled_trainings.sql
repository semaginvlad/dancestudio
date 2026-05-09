-- RLS draft for public.cancelled_trainings.
-- Documentation/draft only. Do not apply from this PR.
-- Review and apply manually in Supabase when ready for the cancelled_trainings
-- RLS safety step.
--
-- Context:
-- - public.crm_fetch_schedule_cancelled_trainings() is already applied manually
--   and is the wider Schedule cancelled-training read model for trainer/non-admin
--   users.
-- - Admin users continue to read the base table directly.
-- - Trainers should only SELECT/INSERT/DELETE base-table rows for their own
--   group_id where public.groups.trainer_id = auth.uid().
-- - No UPDATE policy is created by this draft.

begin;

-- Drop the old permissive policy before enabling trusted scoped policies.
drop policy if exists "Allow all on cancelled_trainings" on public.cancelled_trainings;

-- Idempotency for policies created by this draft.
drop policy if exists cancelled_trainings_admin_all on public.cancelled_trainings;
drop policy if exists cancelled_trainings_trainer_select_own_groups on public.cancelled_trainings;
drop policy if exists cancelled_trainings_trainer_insert_own_groups on public.cancelled_trainings;
drop policy if exists cancelled_trainings_trainer_delete_own_groups on public.cancelled_trainings;

-- Helper predicates used by this draft. These mirror the other RLS drafts and
-- are idempotent so this file can be reviewed/applied independently.
create or replace function public.rls_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'semagin.vlad@gmail.com';
$$;

create or replace function public.rls_owns_group(p_group_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.groups g
    where g.id = p_group_id
      and g.trainer_id::text = auth.uid()::text
  );
$$;

revoke execute on function public.rls_is_admin() from public, anon;
revoke execute on function public.rls_owns_group(text) from public, anon;
grant execute on function public.rls_is_admin() to authenticated;
grant execute on function public.rls_owns_group(text) to authenticated;

alter table public.cancelled_trainings enable row level security;

create policy cancelled_trainings_admin_all
on public.cancelled_trainings
for all
to authenticated
using (public.rls_is_admin())
with check (public.rls_is_admin());

create policy cancelled_trainings_trainer_select_own_groups
on public.cancelled_trainings
for select
to authenticated
using (group_id is not null and public.rls_owns_group(group_id));

create policy cancelled_trainings_trainer_insert_own_groups
on public.cancelled_trainings
for insert
to authenticated
with check (group_id is not null and public.rls_owns_group(group_id));

create policy cancelled_trainings_trainer_delete_own_groups
on public.cancelled_trainings
for delete
to authenticated
using (group_id is not null and public.rls_owns_group(group_id));

commit;
