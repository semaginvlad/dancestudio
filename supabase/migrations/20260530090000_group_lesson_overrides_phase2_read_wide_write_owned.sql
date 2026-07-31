-- Phase 2 security for public.group_lesson_overrides: read-wide / write-owned.
--
-- Business rule protected by this migration:
-- - authenticated schedule users may read all single-date group lesson overrides
--   so the shared schedule shows the real state of occupied/cancelled slots;
-- - admins may create/update/delete any override;
-- - trainers may create/update/delete overrides only for groups they own through
--   public.groups.trainer_id = auth.uid();
-- - direct API calls cannot mutate another trainer's group_id/override.

begin;

-- Remove the temporary Phase 1 allow-authenticated mutation policy and any
-- earlier Phase 2 policy names before recreating the read-wide/write-owned set.
-- Data is intentionally preserved.
drop policy if exists group_lesson_overrides_authenticated_select on public.group_lesson_overrides;
drop policy if exists group_lesson_overrides_authenticated_mutations on public.group_lesson_overrides;
drop policy if exists group_lesson_overrides_admin_all on public.group_lesson_overrides;
drop policy if exists group_lesson_overrides_schedule_select_authenticated on public.group_lesson_overrides;
drop policy if exists group_lesson_overrides_trainer_select_own_groups on public.group_lesson_overrides;
drop policy if exists group_lesson_overrides_trainer_insert_own_groups on public.group_lesson_overrides;
drop policy if exists group_lesson_overrides_trainer_update_own_groups on public.group_lesson_overrides;
drop policy if exists group_lesson_overrides_trainer_delete_own_groups on public.group_lesson_overrides;

-- Existing project admin pattern: the SQL helper mirrors the frontend admin
-- allow-list and other RLS drafts.
create or replace function public.rls_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'semagin.vlad@gmail.com';
$$;

-- Existing project ownership pattern: a trainer owns a group when groups.trainer_id
-- maps to the authenticated Supabase auth user id.
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
    where g.id::text = p_group_id::text
      and g.trainer_id::text = auth.uid()::text
  );
$$;

-- Helper for UPDATE checks on created_by. Trainers may keep the existing value
-- or set it only to null/their own auth.uid(); they cannot spoof another actor
-- through a direct API PATCH. The SECURITY DEFINER function reads the stored row
-- without relying on the table's SELECT policy semantics.
create or replace function public.rls_group_lesson_override_created_by_allowed(
  p_override_id uuid,
  p_created_by uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_created_by is null
    or p_created_by::text = auth.uid()::text
    or exists (
      select 1
      from public.group_lesson_overrides glo
      where glo.id = p_override_id
        and glo.created_by is not distinct from p_created_by
    );
$$;

revoke execute on function public.rls_is_admin() from public, anon;
revoke execute on function public.rls_owns_group(text) from public, anon;
revoke execute on function public.rls_group_lesson_override_created_by_allowed(uuid, uuid) from public, anon;
grant execute on function public.rls_is_admin() to authenticated;
grant execute on function public.rls_owns_group(text) to authenticated;
grant execute on function public.rls_group_lesson_override_created_by_allowed(uuid, uuid) to authenticated;

alter table public.group_lesson_overrides enable row level security;

-- Read-wide: authenticated schedule users can read all overrides so generated
-- lessons, active overrides, and cancelled overrides render consistently in the
-- shared schedule. Write access is restricted by the policies below.
create policy group_lesson_overrides_schedule_select_authenticated
on public.group_lesson_overrides
for select
to authenticated
using (true);

-- Admins can manage every override. This policy intentionally covers all write
-- paths, while SELECT is also covered by the read-wide policy above.
create policy group_lesson_overrides_admin_all
on public.group_lesson_overrides
for all
to authenticated
using (public.rls_is_admin())
with check (public.rls_is_admin());

-- Trainers can create overrides only for their own groups. If the client sends
-- created_by, it must be null or the current auth.uid(), not a spoofed user id.
create policy group_lesson_overrides_trainer_insert_own_groups
on public.group_lesson_overrides
for insert
to authenticated
with check (
  group_id is not null
  and public.rls_owns_group(group_id)
  and (created_by is null or created_by::text = auth.uid()::text)
);

-- Trainers can update only rows that currently belong to their groups, and the
-- resulting row must still belong to one of their groups. This prevents direct
-- API payloads from moving an override onto another trainer's group_id.
create policy group_lesson_overrides_trainer_update_own_groups
on public.group_lesson_overrides
for update
to authenticated
using (group_id is not null and public.rls_owns_group(group_id))
with check (
  group_id is not null
  and public.rls_owns_group(group_id)
  and public.rls_group_lesson_override_created_by_allowed(id, created_by)
);

-- Trainers can delete only overrides for their own groups.
create policy group_lesson_overrides_trainer_delete_own_groups
on public.group_lesson_overrides
for delete
to authenticated
using (group_id is not null and public.rls_owns_group(group_id));

commit;
