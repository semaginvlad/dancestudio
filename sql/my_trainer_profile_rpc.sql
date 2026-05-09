-- Documentation/draft only. Do not apply from this PR.
-- Apply manually in Supabase before enabling trainers RLS/admin-only table access.
--
-- Purpose:
-- - Let an authenticated trainer fetch only their own safe profile fields.
-- - Avoid direct frontend reads from public.trainers for trainer/non-admin users.
-- - Do not expose notes, phone, telegram, salary/admin, or other private fields.

create or replace function public.crm_get_my_trainer_profile()
returns table (
  id uuid,
  auth_user_id uuid,
  name text,
  first_name text,
  last_name text,
  instagram_handle text,
  is_active boolean
)
language sql
security definer
set search_path = public
as $$
  select
    t.id,
    t.auth_user_id,
    t.name,
    t.first_name,
    t.last_name,
    t.instagram_handle,
    t.is_active
  from public.trainers t
  where t.auth_user_id = auth.uid()
  limit 1;
$$;

revoke execute on function public.crm_get_my_trainer_profile() from public, anon;
grant execute on function public.crm_get_my_trainer_profile() to authenticated;
