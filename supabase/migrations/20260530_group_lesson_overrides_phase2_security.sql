-- Phase 2 security for public.group_lesson_overrides.
-- Protects single-date generated group lesson overrides server-side:
-- - admins can manage every override;
-- - trainers can read/create/update/delete overrides only for groups they own;
-- - broad authenticated Phase 1 policies are removed.

begin;

-- Remove the temporary Phase 1 allow-authenticated policies and any previous
-- version of the Phase 2 policies before recreating the trusted set.
drop policy if exists group_lesson_overrides_authenticated_select on public.group_lesson_overrides;
drop policy if exists group_lesson_overrides_authenticated_mutations on public.group_lesson_overrides;
drop policy if exists group_lesson_overrides_admin_all on public.group_lesson_overrides;
drop policy if exists group_lesson_overrides_trainer_select_own_groups on public.group_lesson_overrides;
drop policy if exists group_lesson_overrides_trainer_insert_own_groups on public.group_lesson_overrides;
drop policy if exists group_lesson_overrides_trainer_update_own_groups on public.group_lesson_overrides;
drop policy if exists group_lesson_overrides_trainer_delete_own_groups on public.group_lesson_overrides;

-- Shared RLS helper used elsewhere in the project. It mirrors the frontend
-- admin email allow-list so direct base-table access is only granted to the
-- same admin identity.
create or replace function public.rls_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'semagin.vlad@gmail.com';
$$;

-- Shared ownership helper: a trainer owns a group when public.groups.trainer_id
-- maps to the authenticated Supabase user id. Casts keep the check compatible
-- with existing text/uuid group and trainer id usage in the project.
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

revoke execute on function public.rls_is_admin() from public, anon;
revoke execute on function public.rls_owns_group(text) from public, anon;
grant execute on function public.rls_is_admin() to authenticated;
grant execute on function public.rls_owns_group(text) to authenticated;

alter table public.group_lesson_overrides enable row level security;

-- Admins keep full base-table access for Schedule override management.
create policy group_lesson_overrides_admin_all
on public.group_lesson_overrides
for all
to authenticated
using (public.rls_is_admin())
with check (public.rls_is_admin());

-- Trainers can see only overrides for groups assigned to their auth user.
create policy group_lesson_overrides_trainer_select_own_groups
on public.group_lesson_overrides
for select
to authenticated
using (group_id is not null and public.rls_owns_group(group_id));

-- Trainers can create overrides only for their own groups. created_by, when
-- supplied by the client, must point at the authenticated user rather than a
-- spoofed actor.
create policy group_lesson_overrides_trainer_insert_own_groups
on public.group_lesson_overrides
for insert
to authenticated
with check (
  group_id is not null
  and public.rls_owns_group(group_id)
  and (created_by is null or created_by::text = auth.uid()::text)
);

-- Updates require ownership of both the existing row (USING) and the resulting
-- row (WITH CHECK), so a trainer cannot move an override onto another group_id.
-- created_by is intentionally not checked here so trainers can maintain their
-- own-group overrides even if an admin originally created the row.
create policy group_lesson_overrides_trainer_update_own_groups
on public.group_lesson_overrides
for update
to authenticated
using (group_id is not null and public.rls_owns_group(group_id))
with check (
  group_id is not null
  and public.rls_owns_group(group_id)
);

-- Trainers can delete only overrides for their own groups.
create policy group_lesson_overrides_trainer_delete_own_groups
on public.group_lesson_overrides
for delete
to authenticated
using (group_id is not null and public.rls_owns_group(group_id));

commit;
