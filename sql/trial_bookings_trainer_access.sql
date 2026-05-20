-- Scoped trainer access for public.trial_bookings.
-- Review and apply manually in Supabase.
--
-- Goal:
-- - Keep existing admin policy unchanged.
-- - Allow trainers to SELECT only bookings in groups they own.
-- - Do not grant INSERT/DELETE to trainers.

begin;

-- Helper used by scoped trainer policies.
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

revoke execute on function public.rls_owns_group(text) from public, anon;
grant execute on function public.rls_owns_group(text) to authenticated;

alter table public.trial_bookings enable row level security;

drop policy if exists trial_bookings_trainer_select_own_groups on public.trial_bookings;
drop policy if exists trial_bookings_trainer_update_own_groups on public.trial_bookings;

create policy trial_bookings_trainer_select_own_groups
on public.trial_bookings
for select
to authenticated
using (
  group_id is not null
  and public.rls_owns_group(group_id)
);

commit;
