-- RLS draft for public.cancelled_trainings.
-- Documentation/draft only. Do not apply from this PR.
-- Review and apply manually in Supabase after applying
-- public.crm_fetch_schedule_cancelled_trainings().
--
-- Context:
-- - Attendance needs trainer-owned cancelled_trainings only.
-- - Schedule needs a wider cancellation calendar through
--   public.crm_fetch_schedule_cancelled_trainings().
-- - cancelled_trainings.reason can contain service data such as originalEnds,
--   so other trainers should not read base-table rows for groups they do not own.

begin;

-- Drop old permissive policy that exposed cancelled_trainings too broadly.
drop policy if exists "Allow all on cancelled_trainings" on public.cancelled_trainings;

-- Idempotency for policies created by this draft.
drop policy if exists cancelled_trainings_admin_all on public.cancelled_trainings;
drop policy if exists cancelled_trainings_trainer_select_own_groups on public.cancelled_trainings;
drop policy if exists cancelled_trainings_trainer_insert_own_groups on public.cancelled_trainings;
drop policy if exists cancelled_trainings_trainer_delete_own_groups on public.cancelled_trainings;

-- Helper predicates used by this draft. They are idempotent so this draft can be
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
    where g.id::text = p_group_id
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
using (group_id is not null and public.rls_owns_group(group_id::text));

create policy cancelled_trainings_trainer_insert_own_groups
on public.cancelled_trainings
for insert
to authenticated
with check (group_id is not null and public.rls_owns_group(group_id::text));

create policy cancelled_trainings_trainer_delete_own_groups
on public.cancelled_trainings
for delete
to authenticated
using (group_id is not null and public.rls_owns_group(group_id::text));

commit;
